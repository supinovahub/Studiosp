import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { loadAiConfig } from '@/lib/ai/config';
import { analyzeSanitizedDocument } from './analyze';
import { extractDocument } from './extract';
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
  accountId?: string
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
      .in('status', ['awaiting', 'failed'])
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
      const analysis = await analyzeSanitizedDocument({
        config,
        filename: source.original_filename,
        text: privacy.analysisText,
      });

      await setStep(db, batch, source, leaseToken, 'consolidating');
      await persistAnalysis(db, batch, source, analysis);
      await completeSource(db, batch, source, leaseToken, false);
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
  analysis: Awaited<ReturnType<typeof analyzeSanitizedDocument>>
) {
  const insertedItems: Row[] = [];
  const { data: existingItems, error: existingItemsError } = await db
    .from('document_analysis_items')
    .select('*')
    .eq('batch_id', batch.id);
  if (existingItemsError) throw existingItemsError;
  const existingByKey = new Map(
    (existingItems ?? []).map((item) => [
      itemKey(
        item.item_type,
        item.normalized_key || item.display_name
      ),
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
