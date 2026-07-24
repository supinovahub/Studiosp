import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import {
  HISTORY_IMPORT_SELECT,
  HistoryImportValidationError,
  downloadAndParseHistorySource,
  historyImportErrorResponse,
} from '@/lib/whatsapp-history/server';
import type { HistoryImportBatch } from '@/lib/whatsapp-history/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  let batchId = '';
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as {
      batchId?: unknown;
    } | null;
    batchId = String(body?.batchId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
      throw new HistoryImportValidationError('Importação não informada.');
    }
    const { data: batch, error } = await ctx.supabase
      .from('whatsapp_history_imports')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('id', batchId)
      .maybeSingle();
    if (error) throw error;
    if (!batch) {
      throw new HistoryImportValidationError('Importação não encontrada.', 404);
    }
    if (batch.status === 'ready' || batch.status === 'completed') {
      return NextResponse.json({ batch });
    }
    if (!['uploading', 'analyzing', 'failed'].includes(batch.status)) {
      throw new HistoryImportValidationError(
        'Esta importação não pode ser analisada agora.',
        409
      );
    }

    await ctx.supabase
      .from('whatsapp_history_imports')
      .update({
        status: 'analyzing',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .eq('id', batchId);

    const parsed = await downloadAndParseHistorySource(
      batch as HistoryImportBatch & { object_path: string | null }
    );
    if (!parsed.preview.messageCount) {
      throw new HistoryImportValidationError(
        'Nenhuma mensagem individual válida foi encontrada no arquivo.'
      );
    }

    const preview = parsed.preview;
    const { data: ready, error: updateError } = await ctx.supabase
      .from('whatsapp_history_imports')
      .update({
        status: 'ready',
        total_line_count: preview.totalLineCount,
        valid_event_count: preview.validEventCount,
        invalid_line_count: preview.invalidLineCount,
        skipped_event_count: preview.skippedEventCount,
        message_count: preview.messageCount,
        chat_count: preview.chatCount,
        inbound_count: preview.inboundCount,
        outbound_count: preview.outboundCount,
        media_count: preview.mediaCount,
        duplicate_event_id_count: preview.duplicateEventIdCount,
        preview,
        analyzed_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .eq('id', batchId)
      .select(HISTORY_IMPORT_SELECT)
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ batch: ready });
  } catch (error) {
    if (batchId) {
      try {
        const ctx = await requireRole('owner');
        await ctx.supabase
          .from('whatsapp_history_imports')
          .update({
            status: 'failed',
            error_message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : 'Falha ao analisar o arquivo.',
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', ctx.accountId)
          .eq('id', batchId);
      } catch {
        // A resposta original de autenticação ou validação tem prioridade.
      }
    }
    return historyImportErrorResponse(error);
  }
}
