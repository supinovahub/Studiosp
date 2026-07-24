import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/account';
import { parseWhatsAppHistoryJsonl } from './parser';
import type { HistoryImportBatch } from './types';

export const HISTORY_IMPORT_BUCKET = 'whatsapp-history-imports';
export const MAX_HISTORY_FILE_BYTES = 50 * 1024 * 1024;
export const HISTORY_IMPORT_CHUNK_SIZE = 750;

export const HISTORY_IMPORT_SELECT = [
  'id',
  'status',
  'original_filename',
  'size_bytes',
  'checksum_sha256',
  'total_line_count',
  'valid_event_count',
  'invalid_line_count',
  'skipped_event_count',
  'message_count',
  'chat_count',
  'inbound_count',
  'outbound_count',
  'media_count',
  'duplicate_event_id_count',
  'import_cursor',
  'imported_message_count',
  'duplicate_message_count',
  'preview',
  'report',
  'error_message',
  'analyzed_at',
  'confirmed_at',
  'completed_at',
  'created_at',
  'updated_at',
].join(', ');

export class HistoryImportValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'HistoryImportValidationError';
  }
}

export function safeHistoryFilename(name: string) {
  const stem = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `${stem || 'historico-whatsapp'}.jsonl`;
}

export function whatsappConnectionKey(config: {
  id: string;
  provider: string;
  phone_number_id?: string | null;
  uazapi_instance_id?: string | null;
}) {
  const identity =
    config.provider === 'uazapi'
      ? config.uazapi_instance_id
      : config.phone_number_id;
  return `${config.provider}:${identity?.trim() || config.id}`;
}

export async function downloadAndParseHistorySource(
  batch: HistoryImportBatch & { object_path?: string | null }
) {
  if (!batch.object_path) {
    throw new HistoryImportValidationError(
      'O arquivo original desta importação não está mais disponível.',
      409
    );
  }
  const { data, error } = await supabaseAdmin()
    .storage.from(HISTORY_IMPORT_BUCKET)
    .download(batch.object_path);
  if (error || !data) {
    throw new HistoryImportValidationError(
      'O arquivo ainda não foi enviado ou não pôde ser aberto.',
      409
    );
  }
  if (data.size !== Number(batch.size_bytes)) {
    throw new HistoryImportValidationError(
      'O tamanho do arquivo enviado não corresponde à prévia.'
    );
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (checksum !== batch.checksum_sha256) {
    throw new HistoryImportValidationError(
      'A assinatura do arquivo enviado não confere. Crie uma nova importação.'
    );
  }
  return parseWhatsAppHistoryJsonl(bytes.toString('utf8'));
}

export function historyImportErrorResponse(error: unknown) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof HistoryImportValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error('[whatsapp-history] unexpected error:', error);
  return Response.json(
    { error: 'Não foi possível concluir esta etapa da importação.' },
    { status: 500 }
  );
}
