import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import {
  HISTORY_IMPORT_BUCKET,
  HISTORY_IMPORT_SELECT,
  MAX_HISTORY_FILE_BYTES,
  HistoryImportValidationError,
  historyImportErrorResponse,
  safeHistoryFilename,
  whatsappConnectionKey,
} from '@/lib/whatsapp-history/server';
import type { HistoryImportBatch } from '@/lib/whatsapp-history/types';

export const runtime = 'nodejs';

type CreateBody = {
  filename?: unknown;
  sizeBytes?: unknown;
  checksumSha256?: unknown;
};

export async function GET() {
  try {
    const ctx = await requireRole('owner');
    const { data, error } = await ctx.supabase
      .from('whatsapp_history_imports')
      .select(HISTORY_IMPORT_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return NextResponse.json({ batches: data ?? [] });
  } catch (error) {
    return historyImportErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as CreateBody | null;
    const filename = String(body?.filename ?? '').trim();
    const sizeBytes = Number(body?.sizeBytes);
    const checksumSha256 = String(body?.checksumSha256 ?? '').toLowerCase();
    if (
      !filename.toLowerCase().endsWith('.jsonl') ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > MAX_HISTORY_FILE_BYTES ||
      !/^[a-f0-9]{64}$/.test(checksumSha256)
    ) {
      throw new HistoryImportValidationError(
        'Envie um JSONL válido de até 50 MB.'
      );
    }

    const [{ data: config, error: configError }, { data: profile }] =
      await Promise.all([
        ctx.supabase
          .from('whatsapp_config')
          .select('id, provider, phone_number_id, uazapi_instance_id, status')
          .eq('account_id', ctx.accountId)
          .maybeSingle(),
        ctx.supabase
          .from('profiles')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('user_id', ctx.userId)
          .maybeSingle(),
      ]);
    if (configError) throw configError;
    if (!config) {
      throw new HistoryImportValidationError(
        'Conecte o WhatsApp antes de importar o histórico.',
        409
      );
    }
    const connectionKey = whatsappConnectionKey(config);
    const batchId = crypto.randomUUID();
    const objectPath = `${ctx.accountId}/${batchId}/${safeHistoryFilename(filename)}`;
    const { data: batch, error: batchError } = await ctx.supabase
      .from('whatsapp_history_imports')
      .insert({
        id: batchId,
        account_id: ctx.accountId,
        whatsapp_config_id: config.id,
        created_by_profile_id: profile?.id ?? null,
        created_by_user_id: ctx.userId,
        connection_key: connectionKey,
        original_filename: filename.slice(0, 255),
        object_path: objectPath,
        mime_type: 'application/x-ndjson',
        size_bytes: sizeBytes,
        checksum_sha256: checksumSha256,
      })
      .select(HISTORY_IMPORT_SELECT)
      .single();
    if (batchError || !batch) {
      if (batchError?.code === '23505') {
        const { data: existing } = await ctx.supabase
          .from('whatsapp_history_imports')
          .select('id, status')
          .eq('account_id', ctx.accountId)
          .eq('connection_key', connectionKey)
          .eq('checksum_sha256', checksumSha256)
          .maybeSingle();
        return NextResponse.json(
          {
            error: 'Este mesmo arquivo já foi cadastrado para a conexão atual.',
            existing,
          },
          { status: 409 }
        );
      }
      throw batchError ?? new Error('Falha ao criar lote');
    }
    const createdBatch = batch as unknown as HistoryImportBatch;

    const signed = await ctx.supabase.storage
      .from(HISTORY_IMPORT_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (signed.error || !signed.data) {
      await ctx.supabase
        .from('whatsapp_history_imports')
        .delete()
        .eq('id', createdBatch.id)
        .eq('account_id', ctx.accountId);
      throw signed.error ?? new Error('Upload não autorizado');
    }

    return NextResponse.json({
      batch: createdBatch,
      upload: {
        path: signed.data.path,
        token: signed.data.token,
      },
    });
  } catch (error) {
    return historyImportErrorResponse(error);
  }
}
