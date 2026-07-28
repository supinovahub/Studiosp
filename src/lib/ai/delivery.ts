import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export interface AiResponseOutbox {
  id: string;
  account_id: string;
  conversation_id: string;
  job_id: string;
  trigger_message_id: string;
  context_version: number;
  response_text: string;
  parts: string[];
  semantic_context: JsonObject;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'ambiguous' | 'cancelled';
  sent_part_count: number;
  provider_message_ids: string[];
  lease_expires_at?: string | null;
}

export async function prepareAiResponseOutbox(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  jobId: string;
  triggerMessageId: string;
  contextVersion: number;
  responseText: string;
  parts: string[];
  semanticContext: JsonObject;
}): Promise<AiResponseOutbox> {
  const { data: existing, error: existingError } = await args.db
    .from('ai_response_outbox')
    .select('*')
    .eq('job_id', args.jobId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.status !== 'cancelled') {
    return normalizeOutbox(existing);
  }

  const [{ data: conversation, error: conversationError }, { data: job }] =
    await Promise.all([
      args.db
        .from('conversations')
        .select('ai_context_version, ai_control_mode, assigned_agent_id')
        .eq('account_id', args.accountId)
        .eq('id', args.conversationId)
        .maybeSingle(),
      args.db
        .from('ai_reply_jobs')
        .select('id, status, context_version')
        .eq('account_id', args.accountId)
        .eq('id', args.jobId)
        .maybeSingle(),
    ]);
  if (conversationError) throw conversationError;
  if (
    !conversation ||
    !job ||
    job.status !== 'processing' ||
    Number(job.context_version) !== args.contextVersion ||
    Number(conversation.ai_context_version) !== args.contextVersion ||
    conversation.ai_control_mode !== 'ai_active' ||
    conversation.assigned_agent_id
  ) {
    throw new Error('stale_or_unowned_ai_turn');
  }

  if (existing?.status === 'cancelled') {
    const renewed = await args.db
      .from('ai_response_outbox')
      .update({
        context_version: args.contextVersion,
        response_fingerprint: deliveryFingerprint(args.responseText),
        response_text: args.responseText,
        parts: args.parts,
        semantic_context: args.semanticContext,
        status: 'pending',
        sent_part_count: 0,
        provider_message_ids: [],
        send_started_at: null,
        lease_expires_at: null,
        sent_at: null,
        last_error: null,
      })
      .eq('id', existing.id)
      .eq('status', 'cancelled')
      .select()
      .single();
    if (renewed.error) throw renewed.error;
    return normalizeOutbox(renewed.data);
  }

  const { data, error } = await args.db
    .from('ai_response_outbox')
    .insert({
      account_id: args.accountId,
      conversation_id: args.conversationId,
      job_id: args.jobId,
      trigger_message_id: args.triggerMessageId,
      context_version: args.contextVersion,
      response_fingerprint: deliveryFingerprint(args.responseText),
      response_text: args.responseText,
      parts: args.parts,
      semantic_context: args.semanticContext,
    })
    .select()
    .single();
  if (error?.code === '23505') {
    const raced = await args.db
      .from('ai_response_outbox')
      .select('*')
      .eq('job_id', args.jobId)
      .single();
    if (raced.error) throw raced.error;
    return normalizeOutbox(raced.data);
  }
  if (error || !data) throw error ?? new Error('ai_outbox_not_created');
  return normalizeOutbox(data);
}

function deliveryFingerprint(text: string) {
  const normalized = text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export async function beginAiOutboxPart(
  db: SupabaseClient,
  outbox: AiResponseOutbox,
  partIndex: number
) {
  const { data, error } = await db
    .from('ai_response_outbox')
    .update({
      status: 'sending',
      send_started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      last_error: null,
    })
    .eq('id', outbox.id)
    .eq('sent_part_count', partIndex)
    .in('status', ['pending', 'sending'])
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ai_outbox_part_not_claimed');
  return normalizeOutbox(data);
}

export async function markAiOutboxPartSent(args: {
  db: SupabaseClient;
  outbox: AiResponseOutbox;
  partIndex: number;
  providerMessageId: string;
}) {
  const ids = [
    ...(Array.isArray(args.outbox.provider_message_ids)
      ? args.outbox.provider_message_ids
      : []),
    args.providerMessageId,
  ];
  const { data, error } = await args.db
    .from('ai_response_outbox')
    .update({
      sent_part_count: args.partIndex + 1,
      provider_message_ids: ids,
      status:
        args.partIndex + 1 >= args.outbox.parts.length ? 'sent' : 'pending',
      sent_at:
        args.partIndex + 1 >= args.outbox.parts.length
          ? new Date().toISOString()
          : null,
      lease_expires_at: null,
    })
    .eq('id', args.outbox.id)
    .eq('status', 'sending')
    .eq('sent_part_count', args.partIndex)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ai_outbox_part_not_settled');
  return normalizeOutbox(data);
}

export async function markAiOutboxAmbiguous(
  db: SupabaseClient,
  outboxId: string,
  reason: string
) {
  const { data, error } = await db
    .from('ai_response_outbox')
    .update({
      status: 'ambiguous',
      lease_expires_at: null,
      last_error: reason.replace(/\s+/g, ' ').slice(0, 500),
    })
    .eq('id', outboxId)
    .in('status', ['pending', 'sending'])
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeOutbox(data) : null;
}

export async function findStaleSendingOutboxes(db: SupabaseClient) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('ai_response_outbox')
    .update({
      status: 'ambiguous',
      lease_expires_at: null,
      last_error:
        'O worker terminou durante o envio e não confirmou o resultado do provedor.',
    })
    .eq('status', 'sending')
    .lt('lease_expires_at', now)
    .select('*')
    .limit(25);
  if (error) throw error;
  return (data ?? []).map(normalizeOutbox);
}

function normalizeOutbox(row: Record<string, unknown>): AiResponseOutbox {
  return {
    ...(row as unknown as AiResponseOutbox),
    context_version: Number(row.context_version),
    sent_part_count: Number(row.sent_part_count ?? 0),
    parts: Array.isArray(row.parts)
      ? row.parts.filter((item): item is string => typeof item === 'string')
      : [],
    provider_message_ids: Array.isArray(row.provider_message_ids)
      ? row.provider_message_ids.filter(
          (item): item is string => typeof item === 'string'
        )
      : [],
    semantic_context:
      row.semantic_context &&
      typeof row.semantic_context === 'object' &&
      !Array.isArray(row.semantic_context)
        ? (row.semantic_context as JsonObject)
        : {},
  };
}
