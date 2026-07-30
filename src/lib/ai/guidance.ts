import type { SupabaseClient } from '@supabase/supabase-js';
import { assessPromptInjection } from './response-policy';
import { upsertOwnerAttention } from '@/lib/studiosp/attention';
import type { InboundDomainDecision } from './inbound-domain-policy';

type Row = Record<string, unknown>;
const INBOUND_DOMAIN_DETECTOR_VERSION = 'inbound-domain-v2';

export async function recordPromptInjectionSignal(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  messageId?: string | null;
  message: string;
}) {
  const assessment = assessPromptInjection(args.message);
  if (!assessment.detected) return assessment;
  const { error } = await args.db.from('ai_security_events').insert({
    account_id: args.accountId,
    conversation_id: args.conversationId,
    message_id: args.messageId ?? null,
    event_type: 'prompt_injection_signal',
    severity: assessment.severity,
    signals: assessment.signals,
    metadata: { action: 'blocked_and_redirected_to_business_flow' },
  });
  if (error && error.code !== '23505') {
    console.error(
      '[Studiosp/IA] falha ao registrar sinal de segurança:',
      error
    );
  }
  return assessment;
}

export async function recordInboundDomainBlock(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  messageId?: string | null;
  decision: InboundDomainDecision;
}) {
  if (args.decision.allowed) return;
  const { error } = await args.db.from('ai_security_events').insert({
    account_id: args.accountId,
    conversation_id: args.conversationId,
    message_id: args.messageId ?? null,
    event_type: 'inbound_domain_blocked',
    severity: args.decision.domain === 'manipulation' ? 'warning' : 'info',
    detector_version: INBOUND_DOMAIN_DETECTOR_VERSION,
    signals: [args.decision.domain, args.decision.reason],
    metadata: {
      action: 'blocked_before_ai',
      domain: args.decision.domain,
      reason: args.decision.reason,
      semantic: args.decision.semantic ?? null,
    },
  });
  if (error && error.code !== '23505') {
    console.error(
      '[Studiosp/IA] falha ao registrar bloqueio de domínio:',
      error
    );
  }
}

export async function enforceInboundSecurityLock(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  messageId?: string | null;
  contextStartedAt?: string | null;
  decision: InboundDomainDecision;
}) {
  if (args.decision.allowed) return { locked: false, strikeCount: 0 };

  let priorBlocksQuery = args.db
    .from('ai_security_events')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', args.accountId)
    .eq('conversation_id', args.conversationId)
    .eq('event_type', 'inbound_domain_blocked')
    .eq('detector_version', INBOUND_DOMAIN_DETECTOR_VERSION);
  if (args.messageId) {
    priorBlocksQuery = priorBlocksQuery.neq('message_id', args.messageId);
  }
  const priorBlocks = args.contextStartedAt
    ? await priorBlocksQuery.gte('created_at', args.contextStartedAt)
    : await priorBlocksQuery;
  if (priorBlocks.error) throw priorBlocks.error;

  const strikeCount = Number(priorBlocks.count ?? 0) + 1;
  const immediateLock =
    args.decision.domain === 'manipulation' ||
    args.decision.reason === 'semantic_mixed_domain';
  if (!immediateLock && strikeCount < 2) {
    return { locked: false, strikeCount };
  }

  const now = new Date().toISOString();
  const { data: opportunity } = await args.db
    .from('opportunities')
    .select('id')
    .eq('account_id', args.accountId)
    .eq('contact_id', args.contactId)
    .not('stage', 'in', '(won,lost)')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const reasonCode =
    args.decision.domain === 'manipulation'
      ? 'ai_security_manipulation'
      : 'ai_security_repeated_off_topic';
  const update = await args.db
    .from('conversations')
    .update({
      ai_autoreply_disabled: true,
      ai_control_mode: 'paused',
      ai_control_reason: reasonCode,
      ai_control_changed_at: now,
      ai_processing_status: 'paused',
      ai_processing_reason: 'security_review_required',
    })
    .eq('account_id', args.accountId)
    .eq('id', args.conversationId);
  if (update.error) throw update.error;

  await Promise.all([
    (() => {
      let jobs = args.db
        .from('ai_reply_jobs')
        .update({
          status: 'skipped',
          completed_at: now,
          claimed_at: null,
          lease_expires_at: null,
          outcome_reason: 'security_lock',
        })
        .eq('account_id', args.accountId)
        .eq('conversation_id', args.conversationId)
        .in('status', ['queued', 'retrying', 'processing']);
      if (args.messageId) {
        jobs = jobs.neq('trigger_message_id', args.messageId);
      }
      return jobs;
    })(),
    args.db
      .from('ai_response_outbox')
      .update({
        status: 'cancelled',
        lease_expires_at: null,
        last_error: 'security_lock',
      })
      .eq('account_id', args.accountId)
      .eq('conversation_id', args.conversationId)
      .in('status', ['pending', 'failed']),
    upsertOwnerAttention(args.db, {
      accountId: args.accountId,
      opportunityId: opportunity?.id ?? null,
      kind: 'ai_security_review',
      severity: 'critical',
      title: 'Conversa bloqueada por segurança',
      context: {
        conversation_id: args.conversationId,
        trigger_message_id: args.messageId ?? null,
        reason_code: reasonCode,
        domain: args.decision.domain,
        decision_reason: args.decision.reason,
        strike_count: strikeCount,
        semantic: args.decision.semantic ?? null,
      },
      dueAt: now,
      deduplicationKey: `ai-security:${args.conversationId}`,
    }),
    args.db.from('ai_security_events').upsert(
      {
        account_id: args.accountId,
        conversation_id: args.conversationId,
        message_id: args.messageId ?? null,
        event_type: 'ai_security_lock',
        severity: 'warning',
        detector_version: 'hybrid-domain-v1',
        signals: [args.decision.domain, args.decision.reason],
        metadata: {
          action: 'conversation_locked_for_owner_review',
          strike_count: strikeCount,
        },
      },
      {
        onConflict: 'account_id,message_id,event_type',
        ignoreDuplicates: true,
      }
    ),
  ]);

  return { locked: true, strikeCount };
}

export async function loadTrustedGuidance(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
}) {
  const [conversationRules, knowledgeRules, pendingTurnGuidance] =
    await Promise.all([
      args.db
        .from('ai_guidance_rules')
        .select('scope, content, created_at')
        .eq('account_id', args.accountId)
        .eq('is_active', true)
        .eq('scope', 'conversation')
        .eq('conversation_id', args.conversationId)
        .order('created_at', { ascending: false })
        .limit(10),
      args.db
        .from('ai_guidance_rules')
        .select('scope, content, created_at')
        .eq('account_id', args.accountId)
        .eq('is_active', true)
        .eq('scope', 'knowledge')
        .is('conversation_id', null)
        .order('created_at', { ascending: false })
        .limit(10),
      args.db
        .from('ai_guidance_requests')
        .select('owner_guidance, created_at')
        .eq('account_id', args.accountId)
        .eq('conversation_id', args.conversationId)
        .eq('status', 'resolving')
        .not('owner_guidance', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
  if (
    conversationRules.error ||
    knowledgeRules.error ||
    pendingTurnGuidance.error
  ) {
    console.error(
      '[Studiosp/IA] orientações não carregadas:',
      conversationRules.error ??
        knowledgeRules.error ??
        pendingTurnGuidance.error
    );
    return [];
  }
  return [
    ...(conversationRules.data ?? []),
    ...(knowledgeRules.data ?? []),
    ...(pendingTurnGuidance.data ?? []).map((item) => ({
      scope: 'reply',
      content: item.owner_guidance,
      created_at: item.created_at,
    })),
  ]
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime()
    )
    .map(
      (item) =>
        `Orientação ${item.scope === 'knowledge' ? 'reutilizável da operação' : 'desta conversa'}: ${item.content}`
    );
}

export async function openGuidanceRequest(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  opportunityId?: string | null;
  triggerMessageId?: string | null;
  reasonCode: string;
  summary: string;
  leadMessage: string;
  context?: Row;
}) {
  const existing = await args.db
    .from('ai_guidance_requests')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('conversation_id', args.conversationId)
    .in('status', ['open', 'resolving'])
    .maybeSingle();
  let request = existing.data;
  if (!request) {
    const inserted = await args.db
      .from('ai_guidance_requests')
      .insert({
        account_id: args.accountId,
        conversation_id: args.conversationId,
        contact_id: args.contactId,
        opportunity_id: args.opportunityId ?? null,
        trigger_message_id: args.triggerMessageId ?? null,
        reason_code: args.reasonCode,
        missing_context_summary: args.summary.slice(0, 2000),
        lead_message_excerpt: args.leadMessage.slice(0, 1200),
        context: args.context ?? {},
      })
      .select()
      .single();
    if (inserted.error || !inserted.data) {
      throw inserted.error ?? new Error('guidance_request_not_created');
    }
    request = inserted.data;
  } else if (request.status === 'resolving') {
    const reopened = await args.db
      .from('ai_guidance_requests')
      .update({
        status: 'open',
        reason_code: args.reasonCode,
        missing_context_summary: args.summary.slice(0, 2000),
        lead_message_excerpt: args.leadMessage.slice(0, 1200),
      })
      .eq('id', request.id)
      .select()
      .single();
    if (reopened.error || !reopened.data) {
      throw reopened.error ?? new Error('guidance_request_not_reopened');
    }
    request = reopened.data;
  }

  await Promise.all([
    args.db
      .from('conversations')
      .update({
        ai_control_mode: 'awaiting_guidance',
        ai_control_reason: args.reasonCode,
        ai_control_changed_at: new Date().toISOString(),
        ai_processing_status: 'paused',
        ai_processing_reason: 'awaiting_owner_guidance',
      })
      .eq('account_id', args.accountId)
      .eq('id', args.conversationId),
    upsertOwnerAttention(args.db, {
      accountId: args.accountId,
      opportunityId: args.opportunityId ?? null,
      kind: 'ai_needs_guidance',
      severity: 'warning',
      title: 'Pedro precisa de contexto para responder',
      context: {
        conversation_id: args.conversationId,
        guidance_request_id: request.id,
        trigger_message_id: args.triggerMessageId ?? null,
        lead_message_excerpt: args.leadMessage.slice(0, 1200),
      },
      dueAt: new Date().toISOString(),
      deduplicationKey: `ai-case:${args.conversationId}`,
    }),
  ]);
  if (!existing.data) {
    await args.db.from('ai_guidance_messages').insert({
      account_id: args.accountId,
      request_id: request.id,
      role: 'system',
      content: args.summary.slice(0, 5000),
    });
  }
  return request;
}

export async function openOperationalFailure(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  opportunityId?: string | null;
  triggerMessageId?: string | null;
  reasonCode: string;
  summary: string;
  retryable: boolean;
  jobId?: string | null;
  outboxId?: string | null;
  deliveryState?:
    'not_started' | 'safe_to_retry' | 'partially_sent' | 'ambiguous' | 'sent';
  blockConversation?: boolean;
  context?: Row;
}) {
  const blockConversation = args.blockConversation ?? !args.retryable;
  const { data, error } = await args.db.rpc('studiosp_open_ai_incident', {
    p_account_id: args.accountId,
    p_conversation_id: args.conversationId,
    p_reason_code: args.reasonCode,
    p_summary: args.summary.slice(0, 2000),
    p_retryable: args.retryable,
    p_delivery_state:
      args.deliveryState ?? (args.retryable ? 'safe_to_retry' : 'not_started'),
    p_opportunity_id: args.opportunityId ?? null,
    p_trigger_message_id: args.triggerMessageId ?? null,
    p_job_id: args.jobId ?? null,
    p_outbox_id: args.outboxId ?? null,
    p_technical_context: args.context ?? {},
    p_block_conversation: blockConversation,
  });
  if (error) {
    console.error('[Studiosp/IA] alerta operacional não criado:', error);
  }
  return data;
}

export async function loadResolvingGuidance(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
}) {
  const { data, error } = await args.db
    .from('ai_guidance_requests')
    .select('id, created_at, owner_guidance')
    .eq('account_id', args.accountId)
    .eq('conversation_id', args.conversationId)
    .eq('status', 'resolving')
    .not('owner_guidance', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveGuidanceAfterReply(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  requestId: string;
  responseMessageId?: string | null;
  responseText: string;
}) {
  const resolvedAt = new Date().toISOString();
  await Promise.all([
    args.db
      .from('ai_guidance_requests')
      .update({
        status: 'resolved',
        response_message_id: args.responseMessageId ?? null,
        resumed_at: resolvedAt,
        resolved_at: resolvedAt,
      })
      .eq('account_id', args.accountId)
      .eq('id', args.requestId)
      .eq('status', 'resolving'),
    args.db.from('ai_guidance_messages').insert({
      account_id: args.accountId,
      request_id: args.requestId,
      role: 'assistant',
      content: args.responseText.slice(0, 5000),
    }),
    args.db
      .from('attention_items')
      .update({
        status: 'resolved',
        resolved_at: resolvedAt,
        resolution: {
          outcome: 'owner_guidance_applied',
          guidance_request_id: args.requestId,
        },
      })
      .eq('account_id', args.accountId)
      .eq('deduplication_key', `ai-case:${args.conversationId}`)
      .in('status', ['open', 'snoozed']),
  ]);
}
