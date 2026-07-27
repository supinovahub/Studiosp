import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { loadAiConfig } from '@/lib/ai/config';
import {
  analyzeSanitizedChunk,
  consolidateChunkAnalyses,
  splitDocument,
  type AnalysisResult,
} from './analyze';
import { extractDocument, type ExtractedMedia } from './extract';
import { downloadGoogleDriveFile } from './google-drive';
import { sanitizePersonalData } from './privacy';

// O worker recebe projeções dinâmicas do PostgREST em várias etapas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const LEASE_MS = 4 * 60_000;

function cleanError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Falha desconhecida no processamento.';
  return message
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[DADO REMOVIDO]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[DADO REMOVIDO]')
    .slice(0, 700);
}

export async function processNextDocumentAnalysis(
  db: SupabaseClient,
  accountId?: string,
  requestedBatchId?: string
): Promise<{ processed: number; batchId?: string; sourceId?: string }> {
  const now = new Date();
  let candidateQuery = db
    .from('document_analysis_batches')
    .select('*')
    .in('status', [
      'awaiting',
      'extracting',
      'privacy_check',
      'analyzing',
      'consolidating',
    ])
    .is('cancel_requested_at', null)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .lt('attempts', 3)
    .order('created_at');
  if (accountId) candidateQuery = candidateQuery.eq('account_id', accountId);
  if (requestedBatchId)
    candidateQuery = candidateQuery.eq('id', requestedBatchId);
  const { data: candidates } = await candidateQuery.limit(5);

  for (const candidate of (candidates ?? []) as Row[]) {
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS).toISOString();
    const { data: batch } = await db
      .from('document_analysis_batches')
      .update({
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        started_at: candidate.started_at ?? now.toISOString(),
      })
      .eq('id', candidate.id)
      .is('cancel_requested_at', null)
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
      .select('*')
      .maybeSingle();
    if (!batch) continue;

    const { data: source } = await db
      .from('document_analysis_sources')
      .select('*')
      .eq('batch_id', batch.id)
      .in('status', ['awaiting', 'failed', 'analyzing', 'consolidating'])
      .lt('attempts', 3)
      .lte('next_attempt_at', now.toISOString())
      .order('created_at')
      .limit(1)
      .maybeSingle();

    if (!source) {
      const { count: delayedRetries } = await db
        .from('document_analysis_sources')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .eq('status', 'failed')
        .lt('attempts', 3);
      if (delayedRetries) {
        await db
          .from('document_analysis_batches')
          .update({
            status: 'awaiting',
            lease_token: null,
            lease_expires_at: null,
          })
          .eq('id', batch.id)
          .eq('lease_token', leaseToken);
        return { processed: 0, batchId: batch.id };
      }
      await finalizeBatch(db, batch.id, leaseToken);
      return { processed: 0, batchId: batch.id };
    }

    if (source.status === 'analyzing') {
      return processAnalysisChunk(db, batch, source, leaseToken);
    }
    if (source.status === 'consolidating') {
      try {
        return await consolidateSource(db, batch, source, leaseToken);
      } catch (error) {
        const attempts = Number(source.attempts ?? 0) + 1;
        await db
          .from('document_analysis_sources')
          .update({
            status: 'failed',
            attempts,
            error_code:
              attempts >= 3 ? 'consolidation_failed' : 'retry_scheduled',
            error_message: cleanError(error),
            next_attempt_at: new Date(
              Date.now() + [30_000, 120_000, 300_000][Math.min(attempts - 1, 2)]
            ).toISOString(),
          })
          .eq('id', source.id);
        await releaseBatchLease(db, batch.id, leaseToken, 'awaiting');
        return { processed: 1, batchId: batch.id, sourceId: source.id };
      }
    }

    try {
      await setStep(db, batch, source, leaseToken, 'extracting');
      let bytes: Uint8Array;
      let mimeType = source.mime_type;
      if (source.source_kind === 'google_drive') {
        const remote = await downloadGoogleDriveFile(source.original_url);
        bytes = remote.bytes;
        mimeType = remote.mimeType;
        const checksum = createHash('sha256').update(bytes).digest('hex');
        const { data: existingSizes } = await db
          .from('document_analysis_sources')
          .select('size_bytes')
          .eq('batch_id', batch.id)
          .neq('id', source.id);
        const batchBytes = (existingSizes ?? []).reduce(
          (sum, item) => sum + Number(item.size_bytes ?? 0),
          bytes.length
        );
        if (batchBytes > 250 * 1024 * 1024) {
          throw new Error('O lote excede o limite total de 250 MB.');
        }
        const upload = await db.storage
          .from('document-analysis-quarantine')
          .upload(source.object_path, bytes, {
            contentType: mimeType,
            upsert: false,
          });
        if (upload.error) {
          throw new Error('Falha ao colocar o arquivo remoto na quarentena.');
        }
        await db
          .from('document_analysis_sources')
          .update({
            original_filename: remote.filename,
            mime_type: mimeType,
            size_bytes: bytes.length,
            checksum_sha256: checksum,
          })
          .eq('id', source.id);
      } else {
        const downloaded = await db.storage
          .from('document-analysis-quarantine')
          .download(source.object_path);
        if (downloaded.error || !downloaded.data) {
          throw new Error('O arquivo não está disponível na quarentena.');
        }
        bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      }
      const extracted = await extractDocument(bytes, mimeType);
      if (!extracted.text.trim()) {
        throw new Error(
          'O documento não possui texto extraível. Envie uma versão textual sem dados pessoais.'
        );
      }

      await setStep(db, batch, source, leaseToken, 'privacy_check', {
        signature_valid: true,
        page_count: extracted.pageCount,
        extracted_text: extracted.text,
        extraction_metadata: extracted.metadata,
      });
      const privacy = sanitizePersonalData(extracted.text);
      await db
        .from('document_analysis_sources')
        .update({
          sanitized_text: privacy.sanitizedText,
          pii_status: privacy.blocked
            ? 'blocked'
            : privacy.count
              ? 'sanitized'
              : 'clear',
          pii_categories: privacy.categories,
          pii_count: privacy.count,
        })
        .eq('id', source.id);

      if (privacy.count) {
        await db.from('document_analysis_issues').insert({
          account_id: batch.account_id,
          batch_id: batch.id,
          source_id: source.id,
          issue_type: 'pii',
          severity: privacy.blocked ? 'blocking' : 'warning',
          code: privacy.blocked
            ? 'pii_document_blocked'
            : 'pii_removed_before_ai',
          message: privacy.blocked
            ? 'Documento bloqueado por conter múltiplos dados pessoais. Nenhum conteúdo foi enviado ao provedor de IA.'
            : `${privacy.count} ocorrência(s) de dados pessoais e seus trechos foram removidos antes da análise externa.`,
          details: {
            categories: privacy.categories,
            count: privacy.count,
          },
        });
      }

      if (privacy.blocked) {
        await completeSource(db, batch, source, leaseToken, true);
        return { processed: 1, batchId: batch.id, sourceId: source.id };
      }

      await setStep(db, batch, source, leaseToken, 'analyzing');
      const config = await loadAiConfig(db, batch.account_id, {
        requireActive: false,
      });
      if (!config) {
        await db.from('document_analysis_issues').insert({
          account_id: batch.account_id,
          batch_id: batch.id,
          source_id: source.id,
          issue_type: 'blocked',
          severity: 'blocking',
          code: 'ai_not_configured',
          message:
            'Extração e privacidade concluídas. Configure uma credencial de IA válida para gerar as propostas do preview.',
        });
        await completeSource(db, batch, source, leaseToken, false);
        return { processed: 1, batchId: batch.id, sourceId: source.id };
      }
      const chunks = splitDocument(privacy.analysisText);
      const { error: chunkError } = await db
        .from('document_analysis_chunks')
        .upsert(
          chunks.map((content, chunkIndex) => ({
            account_id: batch.account_id,
            batch_id: batch.id,
            source_id: source.id,
            chunk_index: chunkIndex,
            chunk_count: chunks.length,
            sanitized_content: content,
            status: 'awaiting',
          })),
          { onConflict: 'source_id,chunk_index', ignoreDuplicates: true }
        );
      if (chunkError) throw chunkError;
      await db
        .from('document_analysis_sources')
        .update({
          status: 'analyzing',
          checkpoint: {
            chunk_count: chunks.length,
            completed_chunks: 0,
          },
        })
        .eq('id', source.id);
      await db
        .from('document_analysis_batches')
        .update({
          status: 'analyzing',
          lease_token: null,
          lease_expires_at: null,
        })
        .eq('id', batch.id)
        .eq('lease_token', leaseToken);
      await event(
        db,
        batch,
        source,
        'chunks_created',
        'privacy_check',
        'analyzing',
        {
          chunk_count: chunks.length,
        }
      );
      return { processed: 1, batchId: batch.id, sourceId: source.id };
    } catch (error) {
      const attempts = Number(source.attempts ?? 0) + 1;
      const finalFailure = attempts >= 3;
      const retryDelayMinutes = [1, 5, 15][Math.min(attempts - 1, 2)];
      await db
        .from('document_analysis_sources')
        .update({
          status: 'failed',
          attempts,
          error_code: finalFailure ? 'processing_failed' : 'retry_scheduled',
          error_message: cleanError(error),
          next_attempt_at: new Date(
            Date.now() + retryDelayMinutes * 60_000
          ).toISOString(),
        })
        .eq('id', source.id);
      await db
        .from('document_analysis_batches')
        .update({
          status: finalFailure ? 'failed' : 'awaiting',
          attempts: finalFailure
            ? Math.min(3, Number(batch.attempts ?? 0) + 1)
            : batch.attempts,
          error_code: finalFailure ? 'source_failed' : null,
          error_message: cleanError(error),
          lease_token: null,
          lease_expires_at: null,
        })
        .eq('id', batch.id)
        .eq('lease_token', leaseToken);
      await event(
        db,
        batch,
        source,
        'processing_failed',
        source.status,
        'failed',
        {
          final: finalFailure,
          attempts,
          error: cleanError(error),
        }
      );
      return { processed: 1, batchId: batch.id, sourceId: source.id };
    }
  }

  return { processed: 0 };
}

async function processAnalysisChunk(
  db: SupabaseClient,
  batch: Row,
  source: Row,
  leaseToken: string
) {
  const now = new Date().toISOString();
  const { data: chunks } = await db
    .from('document_analysis_chunks')
    .select('*')
    .eq('source_id', source.id)
    .in('status', ['awaiting', 'failed'])
    .lt('attempts', 3)
    .lte('next_attempt_at', now)
    .order('chunk_index')
    .limit(2);

  if (!chunks?.length) {
    const { count: remaining } = await db
      .from('document_analysis_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', source.id)
      .neq('status', 'ready')
      .lt('attempts', 3);
    await db
      .from('document_analysis_sources')
      .update({
        status: remaining ? 'analyzing' : 'consolidating',
      })
      .eq('id', source.id);
    await releaseBatchLease(
      db,
      batch.id,
      leaseToken,
      remaining ? 'analyzing' : 'consolidating'
    );
    return { processed: 0, batchId: batch.id, sourceId: source.id };
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      await db
        .from('document_analysis_chunks')
        .update({
          status: 'analyzing',
          started_at: chunk.started_at ?? now,
          error_code: null,
          error_message: null,
        })
        .eq('id', chunk.id);
      try {
        const config = await loadAiConfig(db, batch.account_id, {
          requireActive: false,
        });
        if (!config) throw new Error('Configure uma credencial de IA válida.');
        const analysis = await analyzeSanitizedChunk({
          config,
          filename: source.original_filename,
          content: chunk.sanitized_content,
          chunkIndex: chunk.chunk_index,
          chunkCount: chunk.chunk_count,
        });
        await db
          .from('document_analysis_chunks')
          .update({
            status: 'ready',
            result: analysis,
            usage: analysis.usage ?? null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', chunk.id);
      } catch (error) {
        const attempts = Number(chunk.attempts ?? 0) + 1;
        await db
          .from('document_analysis_chunks')
          .update({
            status: 'failed',
            attempts,
            next_attempt_at: new Date(
              Date.now() + [30_000, 120_000, 300_000][Math.min(attempts - 1, 2)]
            ).toISOString(),
            error_code:
              attempts >= 3 ? 'chunk_failed' : 'chunk_retry_scheduled',
            error_message: cleanError(error),
          })
          .eq('id', chunk.id);
      }
    })
  );

  const [{ count: completed }, { count: total }, { count: terminalFailures }] =
    await Promise.all([
      db
        .from('document_analysis_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', source.id)
        .eq('status', 'ready'),
      db
        .from('document_analysis_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', source.id),
      db
        .from('document_analysis_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', source.id)
        .eq('status', 'failed')
        .gte('attempts', 3),
    ]);
  const finished = Number(completed ?? 0) + Number(terminalFailures ?? 0);
  await db
    .from('document_analysis_sources')
    .update({
      status: finished >= Number(total ?? 0) ? 'consolidating' : 'analyzing',
      checkpoint: {
        chunk_count: total ?? 0,
        completed_chunks: completed ?? 0,
        failed_chunks: terminalFailures ?? 0,
      },
    })
    .eq('id', source.id);
  await releaseBatchLease(
    db,
    batch.id,
    leaseToken,
    finished >= Number(total ?? 0) ? 'consolidating' : 'analyzing'
  );
  return {
    processed: chunks.length,
    batchId: batch.id,
    sourceId: source.id,
  };
}

async function consolidateSource(
  db: SupabaseClient,
  batch: Row,
  source: Row,
  leaseToken: string
) {
  const { data: chunks, error } = await db
    .from('document_analysis_chunks')
    .select('result, status, attempts')
    .eq('source_id', source.id)
    .order('chunk_index');
  if (error) throw error;
  const terminal = (chunks ?? []).filter(
    (chunk) => chunk.status === 'failed' && Number(chunk.attempts) >= 3
  );
  if (terminal.length) {
    throw new Error(
      `${terminal.length} parte(s) do documento falharam após três tentativas.`
    );
  }
  const results = (chunks ?? [])
    .filter((chunk) => chunk.status === 'ready' && chunk.result)
    .map((chunk) => chunk.result as AnalysisResult);
  const analysis = consolidateChunkAnalyses(results);

  const downloaded = await db.storage
    .from('document-analysis-quarantine')
    .download(source.object_path);
  if (downloaded.error || !downloaded.data)
    throw new Error('Fonte indisponível para consolidar mídias.');
  const extracted = await extractDocument(
    new Uint8Array(await downloaded.data.arrayBuffer()),
    source.mime_type
  );
  const mediaCandidates = await prepareMediaCandidates(
    db,
    source,
    extracted.media,
    source.sanitized_text ?? '',
    analysis.items
  );
  attachMediaCandidates(analysis.items, mediaCandidates);
  await persistAnalysis(db, batch, source, analysis);
  await completeSource(db, batch, source, leaseToken, false);
  return { processed: 1, batchId: batch.id, sourceId: source.id };
}

async function releaseBatchLease(
  db: SupabaseClient,
  batchId: string,
  leaseToken: string,
  status: string
) {
  await db
    .from('document_analysis_batches')
    .update({ status, lease_token: null, lease_expires_at: null })
    .eq('id', batchId)
    .eq('lease_token', leaseToken);
}

type MediaCandidate = {
  object_path: string;
  source_id: string;
  source_page: number;
  filename: string;
  mime_type: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  category: 'fachada' | 'areas_comuns' | 'interiores' | 'apresentacao';
  is_cover: boolean;
  confidence: number;
};

const MAX_MEDIA_BYTES_PER_SOURCE = 20 * 1024 * 1024;
const MAX_SINGLE_MEDIA_BYTES = 5 * 1024 * 1024;

async function prepareMediaCandidates(
  db: SupabaseClient,
  source: Row,
  media: ExtractedMedia[],
  sanitizedText: string,
  items: AnalysisResult['items']
) {
  const developments = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'development');
  if (!media.length || !developments.length)
    return new Map<number, MediaCandidate[]>();

  const eligible: ExtractedMedia[] = [];
  let totalBytes = 0;
  for (const image of media) {
    if (image.data.byteLength > MAX_SINGLE_MEDIA_BYTES) continue;
    if (totalBytes + image.data.byteLength > MAX_MEDIA_BYTES_PER_SOURCE) break;
    eligible.push(image);
    totalBytes += image.data.byteLength;
  }

  const pageText = pageTextMap(sanitizedText);
  const byDevelopment = new Map<number, MediaCandidate[]>();
  const sourceDirectory = String(source.object_path).replace(/\/[^/]+$/, '');

  for (let index = 0; index < eligible.length; index++) {
    const image = eligible[index];
    const owner = nearestDevelopment(developments, image.page);
    if (!owner) continue;
    const objectPath = `${sourceDirectory}/media/${crypto.randomUUID()}-${image.filename}`;
    const upload = await db.storage
      .from('document-analysis-quarantine')
      .upload(objectPath, image.data, {
        contentType: image.mimeType,
        upsert: false,
      });
    if (upload.error) throw upload.error;
    const current = byDevelopment.get(owner.index) ?? [];
    current.push({
      object_path: objectPath,
      source_id: String(source.id),
      source_page: image.page,
      filename: image.filename,
      mime_type: image.mimeType,
      width: image.width,
      height: image.height,
      category: classifyMedia(pageText.get(image.page) ?? ''),
      is_cover: false,
      confidence: 0.65,
    });
    byDevelopment.set(owner.index, current);
  }

  for (const candidates of byDevelopment.values()) {
    const cover = candidates.reduce<MediaCandidate | null>(
      (best, candidate) =>
        !best || candidate.width * candidate.height > best.width * best.height
          ? candidate
          : best,
      null
    );
    if (cover) {
      cover.is_cover = true;
      cover.category = 'fachada';
      cover.confidence = 0.72;
    }
  }
  return byDevelopment;
}

function attachMediaCandidates(
  items: AnalysisResult['items'],
  candidates: Map<number, MediaCandidate[]>
) {
  for (const [itemIndex, media] of candidates) {
    if (!media.length || !items[itemIndex]) continue;
    items[itemIndex].fields.push({
      name: 'media_candidates',
      value: media,
      confidence: Math.min(...media.map((candidate) => candidate.confidence)),
      page: media[0].source_page,
      excerpt:
        'Mídias extraídas do PDF e classificadas pelo contexto textual da página. Revise capa e categoria antes de publicar.',
    });
  }
}

function nearestDevelopment(
  developments: Array<{
    item: AnalysisResult['items'][number];
    index: number;
  }>,
  page: number
) {
  return developments
    .map((development) => {
      const pages = development.item.fields
        .map((field) => field.page)
        .filter((value): value is number => typeof value === 'number');
      const distance = pages.length
        ? Math.min(...pages.map((value) => Math.abs(value - page)))
        : Number.MAX_SAFE_INTEGER;
      return { ...development, distance };
    })
    .filter((development) => development.distance <= 1)
    .sort((left, right) => left.distance - right.distance)[0];
}

function pageTextMap(text: string) {
  const pages = new Map<number, string>();
  for (const part of text.split(/\[PÁGINA\s+/i).slice(1)) {
    const match = part.match(/^(\d+)\]\s*([\s\S]*)$/);
    if (match) pages.set(Number(match[1]), match[2].split(/\[PÁGINA\s+/i)[0]);
  }
  return pages;
}

function classifyMedia(text: string): MediaCandidate['category'] {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (
    /\b(decorado|interior|living|dormitorio|cozinha|banheiro)\b/.test(
      normalized
    )
  )
    return 'interiores';
  if (
    /\b(piscina|lazer|academia|coworking|salao|area comum)\b/.test(normalized)
  )
    return 'areas_comuns';
  if (/\b(fachada|edificio|torre)\b/.test(normalized)) return 'fachada';
  return 'apresentacao';
}

async function setStep(
  db: SupabaseClient,
  batch: Row,
  source: Row,
  leaseToken: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await Promise.all([
    db
      .from('document_analysis_batches')
      .update({
        status,
        lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
      })
      .eq('id', batch.id)
      .eq('lease_token', leaseToken),
    db
      .from('document_analysis_sources')
      .update({
        status,
        started_at: source.started_at ?? new Date().toISOString(),
        error_code: null,
        error_message: null,
        ...extra,
      })
      .eq('id', source.id),
    event(db, batch, source, 'processing_step_changed', source.status, status),
  ]);
}

async function persistAnalysis(
  db: SupabaseClient,
  batch: Row,
  source: Row,
  analysis: AnalysisResult
) {
  const insertedItems: Row[] = [];
  const { data: existingItems, error: existingItemsError } = await db
    .from('document_analysis_items')
    .select('*')
    .eq('batch_id', batch.id);
  if (existingItemsError) throw existingItemsError;
  const existingByKey = new Map(
    (existingItems ?? []).map((item) => [
      itemKey(item.item_type, item.normalized_key || item.display_name),
      item,
    ])
  );
  for (let index = 0; index < analysis.items.length; index++) {
    const item = analysis.items[index];
    const parent =
      item.parentIndex != null ? insertedItems[item.parentIndex] : null;
    const key = itemKey(item.type, item.normalizedKey || item.displayName);
    const existing = existingByKey.get(key);
    const values = {
      account_id: batch.account_id,
      batch_id: batch.id,
      item_type: item.type,
      proposed_action: item.action,
      parent_item_id: parent?.id ?? existing?.parent_item_id ?? null,
      display_name: item.displayName,
      normalized_key: item.normalizedKey ?? null,
      confidence: item.confidence,
      sort_order: index,
    };
    const { data: inserted, error } = existing
      ? await db
          .from('document_analysis_items')
          .update(values)
          .eq('id', existing.id)
          .select()
          .single()
      : await db
          .from('document_analysis_items')
          .insert(values)
          .select()
          .single();
    if (error || !inserted) throw error ?? new Error('Item não persistido');
    existingByKey.set(key, inserted);
    insertedItems.push(inserted);

    for (const field of item.fields) {
      const { data: insertedField, error: fieldError } = await db
        .from('document_analysis_fields')
        .upsert(
          {
            account_id: batch.account_id,
            batch_id: batch.id,
            item_id: inserted.id,
            field_name: field.name,
            proposed_value: field.value,
            confidence: field.confidence,
          },
          { onConflict: 'item_id,field_name' }
        )
        .select('id')
        .single();
      if (fieldError || !insertedField)
        throw fieldError ?? new Error('Campo não persistido');
      if (field.page || field.excerpt) {
        await db.from('document_analysis_provenance').insert({
          account_id: batch.account_id,
          batch_id: batch.id,
          source_id: source.id,
          field_id: insertedField.id,
          page_number: field.page ?? null,
          sanitized_excerpt: field.excerpt ?? null,
        });
      }
    }
  }

  if (analysis.issues.length) {
    await db.from('document_analysis_issues').insert(
      analysis.issues.map((issue) => ({
        account_id: batch.account_id,
        batch_id: batch.id,
        source_id: source.id,
        issue_type: issue.type,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
      }))
    );
  }
}

function itemKey(type: string, value: string) {
  return `${type}:${value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()}`;
}

async function completeSource(
  db: SupabaseClient,
  batch: Row,
  source: Row,
  leaseToken: string,
  blocked: boolean
) {
  await db
    .from('document_analysis_sources')
    .update({
      status: 'ready',
      completed_at: new Date().toISOString(),
      extracted_text: null,
      sanitized_text: null,
      checkpoint: { privacy_blocked: blocked },
    })
    .eq('id', source.id);
  await event(db, batch, source, 'source_completed', source.status, 'ready', {
    privacy_blocked: blocked,
  });
  await finalizeBatch(db, batch.id, leaseToken);
}

async function finalizeBatch(
  db: SupabaseClient,
  batchId: string,
  leaseToken: string
) {
  const [
    { count: active },
    { count: retryable },
    { count: completed },
    { count: failed },
  ] = await Promise.all([
    db
      .from('document_analysis_sources')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .in('status', [
        'awaiting',
        'extracting',
        'privacy_check',
        'analyzing',
        'consolidating',
      ]),
    db
      .from('document_analysis_sources')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('status', 'failed')
      .lt('attempts', 3),
    db
      .from('document_analysis_sources')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('status', 'ready'),
    db
      .from('document_analysis_sources')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('status', 'failed'),
  ]);
  const remaining = Number(active ?? 0) + Number(retryable ?? 0);

  if (!remaining) {
    const [items, sources, issues] = await Promise.all([
      db
        .from('document_analysis_items')
        .select(
          'id, item_type, proposed_action, display_name, normalized_key, confidence, parent_item_id, fields:document_analysis_fields(id, field_name, proposed_value, confidence)'
        )
        .eq('batch_id', batchId)
        .order('sort_order'),
      db
        .from('document_analysis_sources')
        .select(
          'id, original_filename, source_kind, status, pii_status, pii_categories, pii_count, page_count'
        )
        .eq('batch_id', batchId)
        .order('created_at'),
      db
        .from('document_analysis_issues')
        .select('id, source_id, issue_type, severity, code, message, details')
        .eq('batch_id', batchId)
        .order('created_at'),
    ]);
    const { data: batch } = await db
      .from('document_analysis_batches')
      .select('account_id')
      .eq('id', batchId)
      .single();
    if (batch) {
      await db.from('document_analysis_versions').upsert(
        {
          account_id: batch.account_id,
          batch_id: batchId,
          version: 1,
          origin: 'analysis',
          snapshot: {
            sources: sources.data ?? [],
            items: items.data ?? [],
            issues: issues.data ?? [],
          },
        },
        { onConflict: 'batch_id,version', ignoreDuplicates: true }
      );
    }
  }

  await db
    .from('document_analysis_batches')
    .update({
      status: remaining ? 'awaiting' : 'ready',
      completed_source_count: completed ?? 0,
      failed_source_count: failed ?? 0,
      completed_at: remaining ? null : new Date().toISOString(),
      current_version: remaining ? 0 : 1,
      lease_token: null,
      lease_expires_at: null,
    })
    .eq('id', batchId)
    .eq('lease_token', leaseToken);
}

async function event(
  db: SupabaseClient,
  batch: Row,
  source: Row,
  eventType: string,
  fromStatus: string | null,
  toStatus: string | null,
  metadata: Record<string, unknown> = {}
) {
  await db.from('document_analysis_events').insert({
    account_id: batch.account_id,
    batch_id: batch.id,
    source_id: source.id,
    actor_type: 'worker',
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    metadata,
  });
}
