import type { SupabaseClient } from '@supabase/supabase-js';
import { assessPromptInjection } from './response-policy';

type Row = Record<string, unknown>;

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
    metadata: { action: 'logged_without_automatic_block' },
  });
  if (error && error.code !== '23505') {
    console.error(
      '[Studiosp/IA] falha ao registrar sinal de segurança:',
      error
    );
  }
  return assessment;
}

export async function loadTrustedGuidance(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
}) {
  const [conversationRules, knowledgeRules] = await Promise.all([
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
  ]);
  if (conversationRules.error || knowledgeRules.error) {
    console.error(
      '[Studiosp/IA] orientações não carregadas:',
      conversationRules.error ?? knowledgeRules.error
    );
    return [];
  }
  return [...(conversationRules.data ?? []), ...(knowledgeRules.data ?? [])]
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
  if (existing.data) return existing.data;

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
    args.db.from('ai_guidance_messages').insert({
      account_id: args.accountId,
      request_id: inserted.data.id,
      role: 'system',
      content: args.summary.slice(0, 5000),
    }),
    args.db.from('attention_items').upsert(
      {
        account_id: args.accountId,
        opportunity_id: args.opportunityId ?? null,
        assigned_role: 'owner',
        kind: 'ai_needs_guidance',
        severity: 'warning',
        title: 'Pedro precisa de contexto para responder',
        context: {
          conversation_id: args.conversationId,
          guidance_request_id: inserted.data.id,
          trigger_message_id: args.triggerMessageId ?? null,
          lead_message_excerpt: args.leadMessage.slice(0, 1200),
        },
        due_at: new Date().toISOString(),
        deduplication_key: `ai-guidance:${args.conversationId}`,
      },
      { onConflict: 'account_id,deduplication_key' }
    ),
  ]);
  return inserted.data;
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
  context?: Row;
}) {
  const { error } = await args.db.from('attention_items').upsert(
    {
      account_id: args.accountId,
      opportunity_id: args.opportunityId ?? null,
      assigned_role: 'owner',
      kind: 'ai_operational_failure',
      severity: args.retryable ? 'warning' : 'critical',
      title: 'Falha operacional no atendimento da IA',
      context: {
        conversation_id: args.conversationId,
        trigger_message_id: args.triggerMessageId ?? null,
        reason_code: args.reasonCode,
        summary: args.summary.slice(0, 1000),
        retryable: args.retryable,
        ...(args.context ?? {}),
      },
      due_at: new Date().toISOString(),
      deduplication_key: `ai-operational:${args.conversationId}:${args.reasonCode}`,
    },
    { onConflict: 'account_id,deduplication_key' }
  );
  if (error) {
    console.error('[Studiosp/IA] alerta operacional não criado:', error);
  }
}
