import { supabaseAdmin } from './admin-client';
import {
  dispatchInboundToAiReply,
  type AiDispatchResult,
} from './auto-reply';

type Db = ReturnType<typeof supabaseAdmin>;

export interface EnqueueAiReplyArgs {
  accountId: string;
  conversationId: string;
  contactId: string;
  triggerMessageId: string;
  configOwnerUserId: string;
  senderPhone: string;
}

interface AiReplyJob {
  id: string;
  account_id: string;
  conversation_id: string;
  contact_id: string;
  trigger_message_id: string;
  config_owner_user_id: string;
  sender_phone: string;
  attempt_count: number;
  max_attempts: number;
  correlation_id: string;
}

export async function enqueueInboundAiReply(
  args: EnqueueAiReplyArgs
): Promise<{ queued: boolean; processed: number }> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('enqueue_ai_reply_job', {
    p_account_id: args.accountId,
    p_conversation_id: args.conversationId,
    p_contact_id: args.contactId,
    p_trigger_message_id: args.triggerMessageId,
    p_config_owner_user_id: args.configOwnerUserId,
    p_sender_phone: args.senderPhone,
  });
  if (error) {
    console.error(
      JSON.stringify({
        event: 'ai_reply_enqueue_failed',
        account_id: args.accountId,
        conversation_id: args.conversationId,
        trigger_message_id: args.triggerMessageId,
        error: error.message,
      })
    );
    throw error;
  }

  // Give consecutive short messages time to form one conversational turn.
  // Every newer enqueue supersedes the older audit job in the database.
  await waitForInboundQuietPeriod();
  const processed = await processAiReplyQueue(db, 5);
  return { queued: Boolean(data), processed };
}

export async function waitForInboundQuietPeriod(ms = 8_250) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processAiReplyQueue(
  db: Db = supabaseAdmin(),
  limit = 10
): Promise<number> {
  await flagDelayedAiReplies(db);
  const { data, error } = await db.rpc('claim_ai_reply_jobs', {
    p_limit: limit,
    p_lease_seconds: 330,
  });
  if (error) {
    console.error(
      JSON.stringify({ event: 'ai_reply_claim_failed', error: error.message })
    );
    return 0;
  }

  let processed = 0;
  for (const job of (data ?? []) as AiReplyJob[]) {
    await processClaimedJob(db, job);
    processed += 1;
  }
  return processed;
}

async function flagDelayedAiReplies(db: Db) {
  const threshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: delayed } = await db
    .from('ai_reply_jobs')
    .select('id, account_id, conversation_id, trigger_message_id, correlation_id')
    .in('status', ['queued', 'retrying'])
    .lte('created_at', threshold)
    .limit(20);

  for (const job of delayed ?? []) {
    const { data: opportunity } = await db
      .from('opportunities')
      .select('id')
      .eq('account_id', job.account_id)
      .eq('primary_conversation_id', job.conversation_id)
      .not('stage', 'in', '("won","lost")')
      .maybeSingle();
    if (!opportunity) continue;
    await db.from('attention_items').upsert(
      {
        account_id: job.account_id,
        opportunity_id: opportunity.id,
        assigned_role: 'owner',
        kind: 'ai_handoff',
        severity: 'warning',
        title: 'Resposta da IA atrasada',
        context: {
          conversation_id: job.conversation_id,
          trigger_message_id: job.trigger_message_id,
          job_id: job.id,
          correlation_id: job.correlation_id,
        },
        due_at: new Date().toISOString(),
        deduplication_key: `ai-reply-delayed:${job.conversation_id}`,
      },
      { onConflict: 'account_id,deduplication_key', ignoreDuplicates: true }
    );
  }
}

async function processClaimedJob(db: Db, job: AiReplyJob) {
  const startedAt = Date.now();
  await Promise.all([
    db.from('ai_reply_attempts').insert({
      account_id: job.account_id,
      job_id: job.id,
      conversation_id: job.conversation_id,
      trigger_message_id: job.trigger_message_id,
      attempt_number: job.attempt_count,
      status: 'processing',
    }),
    db
      .from('conversations')
      .update({
        ai_processing_status: 'processing',
        ai_processing_reason: null,
        ai_processing_job_id: job.id,
        ai_last_attempt_at: new Date().toISOString(),
      })
      .eq('id', job.conversation_id)
      .eq('account_id', job.account_id),
  ]);

  console.info(
    JSON.stringify({
      event: 'ai_reply_processing_started',
      job_id: job.id,
      correlation_id: job.correlation_id,
      conversation_id: job.conversation_id,
      attempt: job.attempt_count,
    })
  );

  const result = await dispatchInboundToAiReply({
    accountId: job.account_id,
    conversationId: job.conversation_id,
    contactId: job.contact_id,
    triggerMessageId: job.trigger_message_id,
    configOwnerUserId: job.config_owner_user_id,
    senderPhone: job.sender_phone,
  });
  const latencyMs = Date.now() - startedAt;

  if (
    result.outcome === 'failed' &&
    result.retryable &&
    job.attempt_count < job.max_attempts
  ) {
    const delaySeconds = retryDelaySeconds(job.attempt_count);
    const availableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await Promise.all([
      db
        .from('ai_reply_jobs')
        .update({
          status: 'retrying',
          available_at: availableAt,
          claimed_at: null,
          lease_expires_at: null,
          outcome_reason: 'temporary_failure',
          last_error: sanitizeError(result.reason),
        })
        .eq('id', job.id)
        .eq('status', 'processing'),
      finishAttempt(db, job, 'retrying', result.reason, latencyMs),
      updateConversationState(db, job, 'retrying', 'temporary_failure'),
    ]);
    logFinished(job, 'retrying', latencyMs, result.reason);
    return;
  }

  const terminal = terminalState(result);
  await Promise.all([
    db
      .from('ai_reply_jobs')
      .update({
        status: terminal.jobStatus,
        completed_at: new Date().toISOString(),
        claimed_at: null,
        lease_expires_at: null,
        outcome_reason: terminal.reason,
        last_error:
          result.outcome === 'failed' ? sanitizeError(result.reason) : null,
      })
      .eq('id', job.id)
      .eq('status', 'processing'),
    finishAttempt(db, job, terminal.attemptStatus, terminal.reason, latencyMs),
    updateConversationState(
      db,
      job,
      terminal.conversationStatus,
      terminal.reason,
      result.outcome === 'completed'
    ),
  ]);

  if (result.outcome === 'failed') {
    await openFailureAttention(db, job, result.reason);
  }
  logFinished(job, terminal.jobStatus, latencyMs, terminal.reason);
}

export function terminalState(result: AiDispatchResult) {
  if (result.outcome === 'completed')
    return {
      jobStatus: 'completed',
      attemptStatus: 'completed',
      conversationStatus: 'idle',
      reason: 'reply_sent',
    } as const;
  if (result.outcome === 'handoff')
    return {
      jobStatus: 'handoff',
      attemptStatus: 'handoff',
      conversationStatus: 'handoff',
      reason: result.reason,
    } as const;
  if (result.outcome === 'skipped')
    return {
      jobStatus: 'skipped',
      attemptStatus: 'skipped',
      conversationStatus: pausedSkipReasons.has(result.reason)
        ? 'paused'
        : 'idle',
      reason: result.reason,
    } as const;
  return {
    jobStatus: 'failed',
    attemptStatus: 'failed',
    conversationStatus: 'failed',
    reason: result.reason,
  } as const;
}

const pausedSkipReasons = new Set([
  'assigned_to_human',
  'conversation_paused',
  'sender_not_allowed',
]);

async function finishAttempt(
  db: Db,
  job: AiReplyJob,
  status: string,
  reason: string,
  latencyMs: number
) {
  return db
    .from('ai_reply_attempts')
    .update({
      status,
      reason_code: reasonCode(reason),
      error_message: status === 'failed' ? sanitizeError(reason) : null,
      latency_ms: latencyMs,
      completed_at: new Date().toISOString(),
    })
    .eq('job_id', job.id)
    .eq('attempt_number', job.attempt_count);
}

async function updateConversationState(
  db: Db,
  job: AiReplyJob,
  status: string,
  reason: string,
  responded = false
) {
  return db
    .from('conversations')
    .update({
      ai_processing_status: status,
      ai_processing_reason: reason,
      ...(responded ? { ai_last_response_at: new Date().toISOString() } : {}),
    })
    .eq('id', job.conversation_id)
    .eq('account_id', job.account_id)
    .eq('ai_processing_job_id', job.id);
}

async function openFailureAttention(
  db: Db,
  job: AiReplyJob,
  reason: string
) {
  const { data: opportunity } = await db
    .from('opportunities')
    .select('id')
    .eq('account_id', job.account_id)
    .eq('primary_conversation_id', job.conversation_id)
    .not('stage', 'in', '("won","lost")')
    .maybeSingle();
  if (!opportunity) return;

  await db.from('attention_items').upsert(
    {
      account_id: job.account_id,
      opportunity_id: opportunity.id,
      assigned_role: 'owner',
      kind: 'ai_handoff',
      severity: 'critical',
      title: 'A IA não conseguiu responder ao lead',
      context: {
        conversation_id: job.conversation_id,
        trigger_message_id: job.trigger_message_id,
        job_id: job.id,
        correlation_id: job.correlation_id,
        reason: sanitizeError(reason),
      },
      due_at: new Date().toISOString(),
      deduplication_key: `ai-reply-failed:${job.conversation_id}`,
    },
    { onConflict: 'account_id,deduplication_key', ignoreDuplicates: true }
  );
}

export function retryDelaySeconds(attempt: number) {
  const base = [15, 60, 180][Math.max(0, Math.min(attempt - 1, 2))];
  return base + Math.floor(Math.random() * 11);
}

export function reasonCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function sanitizeError(value: string) {
  return value.replace(/\s+/g, ' ').slice(0, 500);
}

function logFinished(
  job: AiReplyJob,
  status: string,
  latencyMs: number,
  reason: string
) {
  console.info(
    JSON.stringify({
      event: 'ai_reply_processing_finished',
      job_id: job.id,
      correlation_id: job.correlation_id,
      conversation_id: job.conversation_id,
      attempt: job.attempt_count,
      status,
      reason: reasonCode(reason),
      latency_ms: latencyMs,
    })
  );
}
