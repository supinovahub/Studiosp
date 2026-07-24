import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { parseGoogleDriveLink } from '@/lib/document-analysis/google-drive';

export const runtime = 'nodejs';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_BYTES = 250 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
]);

type SourceInput = {
  filename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  checksumSha256?: unknown;
};

function safeFilename(name: string) {
  const extension = name.includes('.') ? `.${name.split('.').pop()}` : '';
  const stem = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `${stem || 'documento'}${extension.toLowerCase()}`;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const url = new URL(request.url);
    const batchId = url.searchParams.get('id');

    if (!batchId) {
      const { data, error } = await ctx.supabase
        .from('document_analysis_batches')
        .select(
          'id, title, status, source_count, completed_source_count, failed_source_count, current_version, error_message, created_at, updated_at, expires_at'
        )
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return NextResponse.json({ batches: data ?? [] });
    }

    const [batchResult, sourcesResult, itemsResult, issuesResult] =
      await Promise.all([
        ctx.supabase
          .from('document_analysis_batches')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('id', batchId)
          .maybeSingle(),
        ctx.supabase
          .from('document_analysis_sources')
          .select(
            'id, status, original_filename, mime_type, size_bytes, page_count, pii_status, pii_categories, pii_count, error_code, error_message, completed_at'
          )
          .eq('account_id', ctx.accountId)
          .eq('batch_id', batchId)
          .order('created_at'),
        ctx.supabase
          .from('document_analysis_items')
          .select(
            '*, fields:document_analysis_fields(*, provenance:document_analysis_provenance(page_number, sanitized_excerpt, source_id))'
          )
          .eq('account_id', ctx.accountId)
          .eq('batch_id', batchId)
          .order('sort_order'),
        ctx.supabase
          .from('document_analysis_issues')
          .select(
            'id, source_id, item_id, field_id, issue_type, severity, code, message, details, resolved_at, created_at'
          )
          .eq('account_id', ctx.accountId)
          .eq('batch_id', batchId)
          .order('created_at'),
      ]);

    if (batchResult.error) throw batchResult.error;
    if (!batchResult.data) {
      return NextResponse.json(
        { error: 'Lote não encontrado.' },
        { status: 404 }
      );
    }
    if (sourcesResult.error) throw sourcesResult.error;
    if (itemsResult.error) throw itemsResult.error;
    if (issuesResult.error) throw issuesResult.error;

    return NextResponse.json({
      batch: batchResult.data,
      sources: sourcesResult.data ?? [],
      items: itemsResult.data ?? [],
      issues: issuesResult.data ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      sources?: SourceInput[];
      links?: unknown[];
    } | null;
    const sources = Array.isArray(body?.sources) ? body.sources : [];
    const links = Array.isArray(body?.links)
      ? body.links.map((link) => String(link).trim()).filter(Boolean)
      : [];
    if (
      (!sources.length && !links.length) ||
      sources.length + links.length > MAX_FILES
    ) {
      return NextResponse.json(
        { error: `Envie entre 1 e ${MAX_FILES} arquivos ou links por lote.` },
        { status: 400 }
      );
    }
    if (links.some((link) => !parseGoogleDriveLink(link))) {
      return NextResponse.json(
        {
          error:
            'Use apenas links públicos de arquivos, Documentos ou Planilhas Google.',
        },
        { status: 400 }
      );
    }

    const normalized = sources.map((source) => ({
      filename: String(source.filename ?? '').trim(),
      mimeType: String(source.mimeType ?? '').toLowerCase(),
      sizeBytes: Number(source.sizeBytes),
      checksumSha256: String(source.checksumSha256 ?? '').toLowerCase(),
    }));
    const invalid = normalized.find(
      (source) =>
        !source.filename ||
        !ALLOWED_MIME_TYPES.has(source.mimeType) ||
        !Number.isInteger(source.sizeBytes) ||
        source.sizeBytes <= 0 ||
        source.sizeBytes > MAX_FILE_BYTES ||
        !/^[a-f0-9]{64}$/.test(source.checksumSha256)
    );
    const totalBytes = normalized.reduce(
      (sum, source) => sum + source.sizeBytes,
      0
    );
    if (invalid || totalBytes > MAX_BATCH_BYTES) {
      return NextResponse.json(
        {
          error:
            totalBytes > MAX_BATCH_BYTES
              ? 'O lote deve ter no máximo 250 MB.'
              : 'Há um arquivo inválido, não permitido ou maior que 50 MB.',
        },
        { status: 400 }
      );
    }
    if (new Set(normalized.map((item) => item.checksumSha256)).size !== normalized.length) {
      return NextResponse.json(
        { error: 'O mesmo arquivo aparece mais de uma vez no lote.' },
        { status: 400 }
      );
    }

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const { data: batch, error: batchError } = await ctx.supabase
      .from('document_analysis_batches')
      .insert({
        account_id: ctx.accountId,
        created_by: profile?.id ?? null,
        title:
          typeof body?.title === 'string' && body.title.trim()
            ? body.title.trim().slice(0, 160)
            : 'Análise de documentos',
        source_count: normalized.length + links.length,
      })
      .select('id, title, status')
      .single();
    if (batchError || !batch) throw batchError ?? new Error('Lote não criado');

    const sourceRows = normalized.map((source) => {
      const sourceId = crypto.randomUUID();
      return {
        id: sourceId,
        account_id: ctx.accountId,
        batch_id: batch.id,
        source_kind: 'upload',
        original_filename: source.filename,
        object_path: `${ctx.accountId}/${batch.id}/${sourceId}/${safeFilename(source.filename)}`,
        mime_type: source.mimeType,
        size_bytes: source.sizeBytes,
        checksum_sha256: source.checksumSha256,
      };
    });
    const driveRows = await Promise.all(
      links.map(async (link, index) => {
        const sourceId = crypto.randomUUID();
        const parsed = parseGoogleDriveLink(link)!;
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(`${link}#${index}`)
        );
        return {
          id: sourceId,
          account_id: ctx.accountId,
          batch_id: batch.id,
          source_kind: 'google_drive',
          original_filename: parsed.filename,
          original_url: link,
          object_path: `${ctx.accountId}/${batch.id}/${sourceId}/${safeFilename(parsed.filename)}`,
          mime_type: 'application/octet-stream',
          size_bytes: 0,
          checksum_sha256: Array.from(new Uint8Array(digest))
            .map((value) => value.toString(16).padStart(2, '0'))
            .join(''),
        };
      })
    );
    const { error: sourceError } = await ctx.supabase
      .from('document_analysis_sources')
      .insert([...sourceRows, ...driveRows]);
    if (sourceError) {
      await ctx.supabase
        .from('document_analysis_batches')
        .delete()
        .eq('id', batch.id);
      throw sourceError;
    }

    const uploadTargets = [];
    for (const source of sourceRows) {
      const signed = await ctx.supabase.storage
        .from('document-analysis-quarantine')
        .createSignedUploadUrl(source.object_path);
      if (signed.error || !signed.data) {
        await ctx.supabase
          .from('document_analysis_batches')
          .delete()
          .eq('id', batch.id);
        throw signed.error ?? new Error('Upload não autorizado');
      }
      uploadTargets.push({
        sourceId: source.id,
        path: signed.data.path,
        token: signed.data.token,
      });
    }

    await ctx.supabase.from('document_analysis_events').insert({
      account_id: ctx.accountId,
      batch_id: batch.id,
      actor_type: 'user',
      actor_id: profile?.id ?? null,
      event_type: 'batch_created',
      to_status: 'awaiting',
      metadata: {
        source_count: normalized.length + links.length,
        remote_source_count: links.length,
        total_bytes: totalBytes,
      },
    });

    return NextResponse.json({
      batch,
      uploads: uploadTargets,
      remoteSources: driveRows.map((source) => ({ sourceId: source.id })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const batchId = new URL(request.url).searchParams.get('id');
    if (!batchId) {
      return NextResponse.json(
        { error: 'Lote não informado.' },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase
      .from('document_analysis_batches')
      .update({
        status: 'cancelled',
        cancel_requested_at: new Date().toISOString(),
        lease_token: null,
        lease_expires_at: null,
      })
      .eq('account_id', ctx.accountId)
      .eq('id', batchId)
      .not('status', 'in', '("ready","expired")')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: 'Este lote não pode mais ser cancelado.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
