import { supabaseAdmin } from './admin-client';
import { loadAiConfig } from './config';
import { buildConversationContext } from './context';
import { retrieveKnowledge } from './knowledge';
import { generateReply } from './generate';
import { buildSystemPrompt } from './defaults';
import { buildHandoffSummary } from './handoff';
import { logAiUsage } from './usage';
import { latestUserMessage } from './query';
import { engineSendText } from '@/lib/flows/meta-send';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { classifySdrTurn, emptySdrClassification } from './sdr-classify';
import { persistSdrClassification } from './sdr-store';
import { createHash } from 'node:crypto';
import {
  prepareStudiospTurn,
  scheduleStudiospFollowups,
} from './studiosp-orchestrator';
import { isInboundAiReplyAllowed } from './inbound-allowlist';
import { splitAiMessage, waitBetweenAiMessages } from './message-parser';
import { guardPrematureMeetingOffer } from './scheduling-intent';

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string;
  conversationId: string;
  contactId: string;
  /** Sender number used by the staging-safe AI reply allowlist. */
  senderPhone: string;
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string;
  /** Exact inbound row that created the durable job. */
  triggerMessageId?: string | null;
}

export type AiDispatchResult =
  | { outcome: 'completed' }
  | { outcome: 'handoff'; reason: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; reason: string; retryable: boolean };

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs
): Promise<AiDispatchResult> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    senderPhone,
    triggerMessageId,
  } = args;

  try {
    const db = supabaseAdmin();

    const config = await loadAiConfig(db, accountId);
    if (!config || !config.autoReplyEnabled)
      return { outcome: 'skipped', reason: 'ai_config_disabled' };
    // Block before loading conversation context or calling the provider.
    if (
      !isInboundAiReplyAllowed(senderPhone, config.autoReplyAllowedNumbers)
    )
      return { outcome: 'skipped', reason: 'sender_not_allowed' };

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1);
    if (autoResponders && autoResponders.length > 0)
      return { outcome: 'skipped', reason: 'automation_has_priority' };

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select(
        'assigned_agent_id, ai_autoreply_disabled, ai_reply_count, ai_context_started_at'
      )
      .eq('id', conversationId)
      .maybeSingle();
    if (convErr)
      return {
        outcome: 'failed',
        reason: 'conversation_lookup_failed',
        retryable: true,
      };
    if (!conv) return { outcome: 'skipped', reason: 'conversation_not_found' };
    if (conv.assigned_agent_id)
      return { outcome: 'skipped', reason: 'assigned_to_human' };
    if (conv.ai_autoreply_disabled)
      return { outcome: 'skipped', reason: 'conversation_paused' };
    const contextBoundary = conv.ai_context_started_at;
    if (!conv.ai_context_started_at) {
      const newContextStartedAt = new Date().toISOString();
      const { error: contextStartError } = await db
        .from('conversations')
        .update({ ai_context_started_at: newContextStartedAt })
        .eq('id', conversationId);
      if (contextStartError) {
        return {
          outcome: 'failed',
          reason: 'conversation_context_start_failed',
          retryable: true,
        };
      }
    }
    const contextStartedAt = conv.ai_context_started_at
      ? new Date(conv.ai_context_started_at).getTime()
      : 0;
    if (
      contextStartedAt > 0 &&
      Date.now() - contextStartedAt >= 24 * 60 * 60 * 1000
    ) {
      const newContextStartedAt = new Date().toISOString();
      await db
        .from('conversations')
        .update({
          ai_reply_count: 0,
          ai_context_started_at: newContextStartedAt,
          ai_handoff_summary: null,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);
      conv.ai_reply_count = 0;
      conv.ai_context_started_at = newContextStartedAt;
    }
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) {
      await handoffForReplyLimit({
        db,
        accountId,
        conversationId,
        limit: config.autoReplyMaxPerConversation,
      });
      return { outcome: 'handoff', reason: 'session_reply_limit_reached' };
    }

    const messages = await buildConversationContext(
      db,
      conversationId,
      undefined,
      contextBoundary
    );
    if (messages.length === 0)
      return { outcome: 'skipped', reason: 'no_conversation_context' };

    const triggerQuery = db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer');
    const { data: triggerMessage } = triggerMessageId
      ? await triggerQuery.eq('id', triggerMessageId).maybeSingle()
      : await triggerQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount
    );
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`
      );
      return {
        outcome: 'failed',
        reason: 'account_rate_limited',
        retryable: true,
      };
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages)
    );

    const classification = await classifySdrTurn({ config, messages }).catch(
      (err) => {
        console.error('[ai auto-reply] SDR classification failed:', err);
        return emptySdrClassification();
      }
    );
    if (
      classification.primaryIntent === 'opt_out' ||
      classification.intents.includes('opt_out')
    ) {
      const now = new Date().toISOString();
      const { data: reactivationLeads } = await db
        .from('reactivation_leads')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId);
      const ids = (reactivationLeads ?? []).map((item) => item.id);
      await Promise.all([
        db
          .from('contacts')
          .update({ opted_out_at: now })
          .eq('account_id', accountId)
          .eq('id', contactId),
        db
          .from('reactivation_leads')
          .update({ status: 'opted_out' })
          .eq('account_id', accountId)
          .eq('contact_id', contactId),
        db
          .from('reactivation_sessions')
          .update({
            status: 'opted_out',
            ended_at: now,
            cooldown_until: null,
          })
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .eq('status', 'active'),
      ]);
      if (ids.length) {
        await db
          .from('reactivation_touches')
          .update({ status: 'cancelled', last_error: 'lead_opted_out' })
          .eq('account_id', accountId)
          .eq('status', 'scheduled')
          .in('reactivation_lead_id', ids);
      }
      await db
        .from('conversations')
        .update({ ai_autoreply_disabled: true })
        .eq('id', conversationId);
      return { outcome: 'handoff', reason: 'lead_opted_out' };
    }
    const studiosp = await prepareStudiospTurn({
      db,
      accountId,
      conversationId,
      contactId,
      triggerMessageId: triggerMessage?.id ?? null,
      config,
      messages,
    });

    const systemPrompt = buildSystemPrompt({
      internalPrompt: config.internalPrompt,
      communicationPrompt: config.communicationPrompt,
      mode: 'auto_reply',
      knowledge,
      operation: studiosp.grounding,
    });

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    });
    const responseText =
      studiosp.outboundOverride ??
      guardPrematureMeetingOffer(
        text,
        studiosp.qualificationComplete,
        studiosp.nextQualificationPrompt
      );

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    });

    if (
      !studiosp.outboundOverride &&
      (handoff || classification.requiresHandoff || !responseText)
    ) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      });
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      };
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId;
      }
      await db.from('conversations').update(update).eq('id', conversationId);
      await persistSdrClassification({
        db,
        accountId,
        conversationId,
        contactId,
        classification: { ...classification, leadStage: 'handoff' },
        productIds: [],
        outcome: 'handoff',
      });
      if (studiosp.opportunityId) {
        await db.rpc('studiosp_apply_opportunity_event', {
          p_opportunity_id: studiosp.opportunityId,
          p_event_type: 'ai_handoff',
          p_expected_stage: null,
          p_payload: { summary },
          p_idempotency_key: triggerMessage?.id
            ? `handoff:${triggerMessage.id}`
            : null,
          p_source_type: 'api',
          p_reason: 'A IA solicitou atendimento humano.',
          p_actor_type: 'ai',
          p_actor_profile_id: null,
        });
        await db.from('attention_items').upsert(
          {
            account_id: accountId,
            opportunity_id: studiosp.opportunityId,
            assigned_role: 'owner',
            kind: 'ai_handoff',
            severity: 'warning',
            title: 'Conversa transferida pela IA',
            context: { summary },
            due_at: new Date().toISOString(),
            deduplication_key: `ai-handoff:${studiosp.opportunityId}`,
          },
          { onConflict: 'account_id,deduplication_key', ignoreDuplicates: true }
        );
      }
      return { outcome: 'handoff', reason: 'model_or_policy_handoff' };
    }

    // If another customer message arrived while the model was working, this
    // answer is stale. The newest durable job will answer the entire burst.
    const { data: newestInbound, error: newestInboundError } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newestInboundError) {
      return {
        outcome: 'failed',
        reason: 'latest_inbound_lookup_failed',
        retryable: true,
      };
    }
    if (
      triggerMessageId &&
      newestInbound?.id &&
      newestInbound.id !== triggerMessageId
    ) {
      return { outcome: 'skipped', reason: 'superseded_by_newer_inbound' };
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      }
    );
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr);
      return {
        outcome: 'failed',
        reason: 'reply_slot_claim_failed',
        retryable: true,
      };
    }
    if (claimed !== true) {
      await handoffForReplyLimit({
        db,
        accountId,
        conversationId,
        limit: config.autoReplyMaxPerConversation,
      });
      return { outcome: 'handoff', reason: 'session_reply_limit_reached' };
    }

    const outboundText = compactAiReply(responseText);
    const { data: fingerprintClaimed, error: fingerprintError } = await db.rpc(
      'claim_ai_response_fingerprint',
      {
        p_account_id: accountId,
        p_conversation_id: conversationId,
        p_fingerprint: responseFingerprint(outboundText),
        p_window_seconds: 600,
      }
    );
    if (fingerprintError) {
      return {
        outcome: 'failed',
        reason: 'response_fingerprint_claim_failed',
        retryable: true,
      };
    }
    if (fingerprintClaimed !== true) {
      return { outcome: 'skipped', reason: 'duplicate_response_blocked' };
    }
    const outboundParts = splitAiMessage(outboundText);
    for (const [index, part] of outboundParts.entries()) {
      try {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: part,
          aiGenerated: true,
        });
      } catch (error) {
        if (index === 0) throw error;
        const summary =
          'Uma resposta da IA foi enviada parcialmente. Revise a conversa antes de continuar para evitar conteúdo duplicado.';
        await db
          .from('conversations')
          .update({
            ai_autoreply_disabled: true,
            ai_handoff_summary: summary,
            ai_processing_status: 'handoff',
            ai_processing_reason: 'partial_reply_send_failed',
          })
          .eq('id', conversationId)
          .eq('account_id', accountId);
        await db.from('attention_items').upsert(
          {
            account_id: accountId,
            opportunity_id: studiosp.opportunityId,
            assigned_role: 'owner',
            kind: 'ai_partial_reply',
            severity: 'critical',
            title: 'Resposta da IA enviada parcialmente',
            context: {
              conversation_id: conversationId,
              sent_parts: index,
              total_parts: outboundParts.length,
            },
            due_at: new Date().toISOString(),
            deduplication_key: `ai-partial-reply:${conversationId}`,
          },
          {
            onConflict: 'account_id,deduplication_key',
            ignoreDuplicates: true,
          }
        );
        return {
          outcome: 'failed',
          reason: 'partial_reply_send_failed',
          retryable: false,
        };
      }
      if (index < outboundParts.length - 1) {
        await waitBetweenAiMessages();
      }
    }

    await persistSdrClassification({
      db,
      accountId,
      conversationId,
      contactId,
      classification,
      productIds: [],
      responseText,
      outcome: 'replied',
    });
    await scheduleStudiospFollowups({
      db,
      accountId,
      opportunityId: studiosp.opportunityId,
    });
    return { outcome: 'completed' };
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err);
    const reason = err instanceof Error ? err.message : 'unknown_dispatch_error';
    return {
      outcome: 'failed',
      reason,
      // If the provider accepted the send but local persistence failed, an
      // automatic retry could duplicate a real WhatsApp message. Escalate for
      // reconciliation instead of guessing.
      retryable: !(
        reason.toLowerCase().includes('mensagem enviada') &&
        reason.toLowerCase().includes('salv')
      ),
    };
  }
}

export function compactAiReply(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function responseFingerprint(text: string) {
  const normalized = compactAiReply(text)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}

async function handoffForReplyLimit({
  db,
  accountId,
  conversationId,
  limit,
}: {
  db: ReturnType<typeof supabaseAdmin>;
  accountId: string;
  conversationId: string;
  limit: number;
}) {
  const summary = `A sessão atingiu o limite de segurança de ${limit} respostas da IA. O atendimento precisa de revisão humana.`;
  await db
    .from('conversations')
    .update({
      ai_autoreply_disabled: true,
      ai_handoff_summary: summary,
      ai_processing_status: 'handoff',
      ai_processing_reason: 'session_reply_limit_reached',
    })
    .eq('id', conversationId)
    .eq('account_id', accountId);

  const { data: opportunity } = await db
    .from('opportunities')
    .select('id')
    .eq('account_id', accountId)
    .eq('primary_conversation_id', conversationId)
    .not('stage', 'in', '("won","lost")')
    .maybeSingle();
  if (!opportunity) return;

  await db.from('attention_items').upsert(
    {
      account_id: accountId,
      opportunity_id: opportunity.id,
      assigned_role: 'owner',
      kind: 'ai_handoff',
      severity: 'warning',
      title: 'Limite de segurança da IA atingido',
      context: { summary, limit, conversation_id: conversationId },
      due_at: new Date().toISOString(),
      deduplication_key: `ai-reply-limit:${conversationId}`,
    },
    { onConflict: 'account_id,deduplication_key', ignoreDuplicates: true }
  );
}
