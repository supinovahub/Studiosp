import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  HISTORY_IMPORT_BUCKET,
  HISTORY_IMPORT_CHUNK_SIZE,
  HISTORY_IMPORT_SELECT,
  HistoryImportValidationError,
  downloadAndParseHistorySource,
  historyImportErrorResponse,
} from '@/lib/whatsapp-history/server';
import type {
  HistoryImportBatch,
  NormalizedHistoryMessage,
} from '@/lib/whatsapp-history/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

function rpcEntry(message: NormalizedHistoryMessage) {
  return {
    phone: message.phone,
    name: message.name,
    messageKey: message.messageKey,
    timestamp: message.timestamp,
    senderType: message.senderType,
    contentType: message.contentType,
    contentText: message.contentText,
    sourceLine: message.sourceLine,
    providerMetadata: message.providerMetadata,
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as {
      batchId?: unknown;
      confirm?: unknown;
    } | null;
    const batchId = String(body?.batchId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(batchId) || body?.confirm !== true) {
      throw new HistoryImportValidationError(
        'Confirme a importação antes de continuar.'
      );
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
    if (batch.status === 'completed') {
      return NextResponse.json({ batch, completed: true });
    }
    if (!['ready', 'importing'].includes(batch.status)) {
      throw new HistoryImportValidationError(
        'A prévia precisa estar pronta antes da confirmação.',
        409
      );
    }

    const parsed = await downloadAndParseHistorySource(
      batch as HistoryImportBatch & { object_path: string | null }
    );
    if (parsed.messages.length !== Number(batch.message_count)) {
      throw new HistoryImportValidationError(
        'O conteúdo atual não corresponde à prévia aprovada.',
        409
      );
    }
    const cursor = Number(batch.import_cursor);
    if (cursor === 0) {
      const { error: suppressionError } = await supabaseAdmin().rpc(
        'suppress_whatsapp_history_contacts',
        {
          p_batch_id: batchId,
          p_contacts: parsed.contacts.map((contact) => ({
            phone: contact.phone,
            name: contact.name,
            originatedAt: contact.originatedAt,
          })),
        }
      );
      if (suppressionError) throw suppressionError;
    }
    const entries = parsed.messages
      .slice(cursor, cursor + HISTORY_IMPORT_CHUNK_SIZE)
      .map(rpcEntry);
    const { data: result, error: rpcError } = await supabaseAdmin().rpc(
      'import_whatsapp_history_chunk',
      {
        p_batch_id: batchId,
        p_start_cursor: cursor,
        p_entries: entries,
      }
    );
    if (rpcError) throw rpcError;

    const completed =
      Boolean((result as { completed?: boolean } | null)?.completed) ||
      cursor + entries.length >= parsed.messages.length;
    if (completed && batch.object_path) {
      const removal = await supabaseAdmin()
        .storage.from(HISTORY_IMPORT_BUCKET)
        .remove([batch.object_path]);
      await supabaseAdmin()
        .from('whatsapp_history_imports')
        .update({
          object_deleted_at: removal.error ? null : new Date().toISOString(),
          object_path: removal.error ? batch.object_path : null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', ctx.accountId)
        .eq('id', batchId);
      if (removal.error) {
        console.error(
          '[whatsapp-history] source cleanup failed:',
          removal.error
        );
      }
    }

    const { data: current, error: currentError } = await ctx.supabase
      .from('whatsapp_history_imports')
      .select(HISTORY_IMPORT_SELECT)
      .eq('account_id', ctx.accountId)
      .eq('id', batchId)
      .single();
    if (currentError) throw currentError;
    const currentBatch = current as unknown as HistoryImportBatch;
    return NextResponse.json({
      batch: currentBatch,
      completed: currentBatch.status === 'completed',
    });
  } catch (error) {
    return historyImportErrorResponse(error);
  }
}
