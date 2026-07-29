import { supabaseAdmin } from './admin-client';
import { dispatchInboundToAiReply, type AiDispatchResult } from './auto-reply';
import { findStaleSendingOutboxes } from './delivery';
import { openOperationalFailure } from './guidance';
import { triggerAiReplyProcessor } from './processor-trigger';

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
  context_version: number;
}

export async function enqueueInboundAiReply(
  args: EnqueueAiReplyArgs
): Promise<{ queued: boolean; processed: number }> {
  const db = supabaseAdmin();
  const cancellation = await db.rpc('studiosp_cancel_reactivation_on_inbound', {
    p_account_id: args.accountId,
    p_contact_id: args.contactId,
    p_conversation_id: args.conversationId,
    p_trigger_message_id: args.triggerMessageId,
  });
  if (cancellation.error) {
    console.error(
      JSON.stringify({
        event: 'reactivation_inbound_cancellation_failed',
        account_id: args.accountId,
        conversation_id: args.conversationId,
        trigger_message_id: args.triggerMessageId,
        error: cancellation.error.message,
      })
    );
    throw cancellation.error;
  }
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

  // The webhook only persists and schedules. A separate invocation owns the
  // quiet period and the expensive model/provider work.
  await triggerAiReplyProcessor();
  return { queued: Boolean(data), processed: 0 };
}

export async function waitForInboundQuietPeriod(ms = 8_250) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processAiReplyQueue(
  db: Db = supabaseAdmin(),
  limit = 10
): Promise<number> {
  await reconcileAmbiguousDeliveries(db);
  await recoverTransientPausedConversations(db);
  await flagDelayedAiReplies(db);

  let processed = 0;
  const concurrency = 4;
  while (processed < limit) {
    const { data, error } = await db.rpc('claim_ai_reply_jobs', {
      p_limit: Math.min(concurrency, limit - processed),
      p_lease_seconds: 330,
    });
    if (error) {
      console.error(
        JSON.stringify({ event: 'ai_reply_claim_failed', error: error.message })
      );
      break;
    }
    const jobs = (data ?? []) as AiReplyJob[];
    if (!jobs.length) break;
    const results = await Promise.allSettled(
      jobs.map((job) => processClaimedJob(db, job))
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          JSON.stringify({
            event: 'ai_reply_worker_rejected',
            job_id: jobs[index].id,
            conversation_id: jobs[index].conversation_id,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          })
        );
      }
    });
    processed += jobs.length;
  }
  return processed;
}

async function flagDelayedAiReplies(db: Db) {
  const threshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: delayed } = await db
    .from('ai_reply_jobs')
    .select(
      'id, account_id, conversation_id, trigger_message_id, correlation_id'
    )
    .in('status', ['queued', 'retrying'])
    .lte('available_at', threshold)
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
    await openOperationalFailure({
      db,
      accountId: job.account_id,
      conversationId: job.conversation_id,
      opportunityId: opportunity.id,
      triggerMessageId: job.trigger_message_id,
      jobId: job.id,
      reasonCode: 'ai_reply_delayed',
      summary:
        'A resposta está levando mais tempo que o esperado e continua na fila.',
      retryable: true,
      deliveryState: 'safe_to_retry',
      blockConversation: false,
      context: { correlation_id: job.correlation_id },
    });
  }
}

async function processClaimedJob(db: Db, job: AiReplyJob) {
  const startedAt = Date.now();
  const { data: config } = await db
    .from('ai_configs')
    .select('provider, model')
    .eq('account_id', job.account_id)
    .eq('created_by', job.config_owner_user_id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  await Promise.all([
    db.from('ai_reply_attempts').insert({
      account_id: job.account_id,
      job_id: job.id,
      conversation_id: job.conversation_id,
      trigger_message_id: job.trigger_message_id,
      attempt_number: job.attempt_count,
      status: 'processing',
      provider: config?.provider ?? null,
      model: config?.model ?? null,
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
    jobId: job.id,
    contextVersion: Number(job.context_version),
  });
  const latencyMs = Date.now() - startedAt;

  if (
    result.outcome === 'failed' &&
    result.retryable &&
    job.attempt_count < job.max_attempts
  ) {
    const delaySeconds = retryDelaySeconds(job.attempt_count);
    const availableAt = new Date(
      Date.now() + delaySeconds * 1000
    ).toISOString();
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
    await triggerAiReplyProcessor(delaySeconds * 1000 + 500);
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
  } else if (result.outcome === 'completed') {
    await resolveConversationIncidents(db, job);
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
  if (result.outcome === 'waiting_guidance')
    return {
      jobStatus: 'waiting_guidance',
      attemptStatus: 'waiting_guidance',
      conversationStatus: 'awaiting_guidance',
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
    conversationStatus: isTransientFailureReason(result.reason)
      ? 'idle'
      : 'failed',
    reason: result.reason,
  } as const;
}

async function recoverTransientPausedConversations(db: Db) {
  const threshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: paused, error } = await db
    .from('conversations')
    .select('id, account_id, ai_control_reason, updated_at')
    .eq('ai_control_mode', 'paused_failure')
    .eq('ai_autoreply_disabled', true)
    .lte('updated_at', threshold)
    .limit(10);
  if (error) {
    console.error(
      JSON.stringify({
        event: 'ai_transient_recovery_scan_failed',
        error: error.message,
      })
    );
    return;
  }
  for (const conversation of paused ?? []) {
    if (!isTransientFailureReason(conversation.ai_control_reason ?? '')) {
      continue;
    }
    const latestJob = await db
      .from('ai_reply_jobs')
      .select('retry_generation')
      .eq('account_id', conversation.account_id)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestJob.error || Number(latestJob.data?.retry_generation ?? 0) >= 1) {
      continue;
    }
    const recovered = await db.rpc('studiosp_enqueue_ai_owner_retry', {
      p_account_id: conversation.account_id,
      p_conversation_id: conversation.id,
      p_reason: 'owner_continue',
    });
    if (recovered.error) {
      console.error(
        JSON.stringify({
          event: 'ai_transient_recovery_failed',
          conversation_id: conversation.id,
          error: recovered.error.message,
        })
      );
      continue;
    }
    console.info(
      JSON.stringify({
        event: 'ai_transient_recovery_enqueued',
        conversation_id: conversation.id,
        previous_reason: conversation.ai_control_reason,
      })
    );
  }
}

const pausedSkipReasons = new Set([
  'assigned_to_human',
  'conversation_paused',
  'awaiting_owner_guidance',
  'conversation_closed',
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

async function openFailureAttention(db: Db, job: AiReplyJob, reason: string) {
  const transient = isTransientFailureReason(reason);
  await openOperationalFailure({
    db,
    accountId: job.account_id,
    conversationId: job.conversation_id,
    triggerMessageId: job.trigger_message_id,
    jobId: job.id,
    reasonCode: reasonCode(reason) || 'ai_reply_terminal_failure',
    summary: sanitizeError(reason),
    retryable: transient,
    deliveryState: reason.toLowerCase().includes('ambiguous')
      ? 'ambiguous'
      : 'not_started',
    blockConversation: !transient,
    context: {
      correlation_id: job.correlation_id,
      attempt_count: job.attempt_count,
      max_attempts: job.max_attempts,
    },
  });
}

export function isTransientFailureReason(reason: string) {
  const code = reasonCode(reason);
  return [
    'timeout',
    'empty_response',
    'rate_limited',
    'network_error',
    'a_openai_retornou_uma_resposta_vazia',
    'o_provedor_de_ia_demorou_demais_para_responder',
    'temporary_failure',
  ].some((candidate) => code === candidate || code.includes(candidate));
}

async function reconcileAmbiguousDeliveries(db: Db) {
  const stale = await findStaleSendingOutboxes(db).catch((error) => {
    console.error(
      '[Studiosp/IA] falha ao reconciliar envios sem confirmação:',
      error
    );
    return [];
  });
  for (const outbox of stale) {
    await db
      .from('ai_reply_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        claimed_at: null,
        lease_expires_at: null,
        outcome_reason: 'ambiguous_delivery',
        last_error: 'Resultado do envio não confirmado.',
      })
      .eq('id', outbox.job_id)
      .eq('status', 'processing');
    await openOperationalFailure({
      db,
      accountId: outbox.account_id,
      conversationId: outbox.conversation_id,
      triggerMessageId: outbox.trigger_message_id,
      jobId: outbox.job_id,
      outboxId: outbox.id,
      reasonCode: 'ambiguous_delivery',
      summary:
        'O envio ao WhatsApp pode ter sido aceito, mas o sistema não recebeu a confirmação final. É necessário decidir antes de tentar novamente.',
      retryable: false,
      deliveryState:
        outbox.sent_part_count > 0 ? 'partially_sent' : 'ambiguous',
      blockConversation: true,
      context: {
        sent_parts: outbox.sent_part_count,
        total_parts: outbox.parts.length,
      },
    });
  }
}

async function resolveConversationIncidents(db: Db, job: AiReplyJob) {
  const resolvedAt = new Date().toISOString();
  const { data: incidents } = await db
    .from('ai_incidents')
    .update({ status: 'resolved', resolved_at: resolvedAt })
    .eq('account_id', job.account_id)
    .eq('conversation_id', job.conversation_id)
    .eq('status', 'resolving')
    .select('reason_code');
  const deduplicationKeys = (incidents ?? []).map(
    () => `ai-case:${job.conversation_id}`
  );
  if (!deduplicationKeys.length) return;
  await db
    .from('attention_items')
    .update({
      status: 'resolved',
      resolved_at: resolvedAt,
      resolution: { outcome: 'ai_reply_completed', job_id: job.id },
    })
    .eq('account_id', job.account_id)
    .in('status', ['open', 'snoozed'])
    .in('deduplication_key', deduplicationKeys);
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
