import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { triggerAiReplyProcessor } from '@/lib/ai/processor-trigger';
import { hasMinRole } from '@/lib/auth/roles';

type Params = { params: Promise<{ conversationId: string }> };

/**
 * POST /api/ai/autoreply/[conversationId]  (agent+)
 *
 * Toggle the AI auto-reply bot for one conversation from the inbox — the
 * "Take over" / "Resume AI" banner.
 *
 * Body: { paused: boolean, assign_to_me?: boolean }
 *   - paused: true  → pause the bot here (a human is taking over). When
 *                     `assign_to_me` is set, also assign the thread to the
 *                     caller (the usual "Take over" flow). Assignment
 *                     fires the `on_conversation_assigned` trigger.
 *   - paused: false → hand the thread back to the bot: clear the pause,
 *                     reset the per-conversation reply count so it gets
 *                     fresh slots, and clear the handoff note. If the
 *                     caller currently owns the thread, unassign it too so
 *                     the bot isn't blocked by the "human owns this" gate.
 *
 * Writes go through the RLS-scoped SSR client, so a conversation outside
 * the caller's account simply isn't found (404).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, accountId, userId, role } = await requireRole('agent');

    // Reuse the send bucket: this is a cheap per-user inbox action and
    // toggling it in a tight loop has no legitimate use.
    const limit = checkRateLimit(`ai-takeover:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const { conversationId } = await params;
    const body = await request.json().catch(() => null);
    if (body?.retry_last === true) {
      const admin = supabaseAdmin();
      const { data: conversation } = await admin
        .from('conversations')
        .select(
          'id, account_id, contact_id, user_id, ai_context_version, ai_control_mode, contacts(phone)'
        )
        .eq('id', conversationId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 }
        );
      }
      if (
        conversation.ai_control_mode === 'paused_failure' &&
        !hasMinRole(role, 'admin')
      ) {
        return NextResponse.json(
          { error: 'Somente o dono pode liberar uma falha operacional.' },
          { status: 403 }
        );
      }
      const { data: trigger } = await admin
        .from('messages')
        .select('id')
        .eq('account_id', accountId)
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!trigger) {
        return NextResponse.json(
          { error: 'Não há mensagem do cliente para reenfileirar' },
          { status: 409 }
        );
      }
      const contact = Array.isArray(conversation.contacts)
        ? conversation.contacts[0]
        : conversation.contacts;
      const { data: existing } = await admin
        .from('ai_reply_jobs')
        .select('id')
        .eq('account_id', accountId)
        .eq('trigger_message_id', trigger.id)
        .maybeSingle();
      if (existing) {
        await admin
          .from('ai_response_outbox')
          .update({ status: 'cancelled', lease_expires_at: null })
          .eq('job_id', existing.id)
          .in('status', ['pending', 'sending', 'failed', 'ambiguous']);
        await admin
          .from('ai_reply_jobs')
          .update({
            status: 'queued',
            attempt_count: 0,
            context_version: Number(conversation.ai_context_version),
            available_at: new Date().toISOString(),
            claimed_at: null,
            lease_expires_at: null,
            completed_at: null,
            outcome_reason: 'manual_retry',
            last_error: null,
          })
          .eq('id', existing.id);
      } else {
        const { error: enqueueError } = await admin.rpc(
          'enqueue_ai_reply_job',
          {
            p_account_id: accountId,
            p_conversation_id: conversationId,
            p_contact_id: conversation.contact_id,
            p_trigger_message_id: trigger.id,
            p_config_owner_user_id: conversation.user_id,
            p_sender_phone: contact?.phone ?? '',
          }
        );
        if (enqueueError) {
          console.error('[ai/autoreply] retry enqueue error:', enqueueError);
          return NextResponse.json(
            { error: 'Falha ao reenfileirar a mensagem' },
            { status: 500 }
          );
        }
      }
      await admin
        .from('conversations')
        .update({
          assigned_agent_id: null,
          ai_autoreply_disabled: false,
          ai_processing_status: 'queued',
          ai_processing_reason: 'manual_retry',
          ai_control_mode: 'ai_active',
          ai_control_reason: null,
          ai_control_changed_at: new Date().toISOString(),
          ai_reply_count: 0,
          ai_handoff_summary: null,
        })
        .eq('id', conversationId)
        .eq('account_id', accountId);
      await triggerAiReplyProcessor(0);
      return NextResponse.json({ success: true, queued: true });
    }
    if (!body || typeof body.paused !== 'boolean') {
      return NextResponse.json(
        { error: 'pausado (booleano) é obrigatório' },
        { status: 400 }
      );
    }
    const paused = body.paused as boolean;
    const assignToMe = body.assign_to_me === true;

    // Confirm the conversation is in the caller's account before writing.
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, ai_control_mode')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (convErr) {
      console.error('[ai/autoreply] conversation lookup error:', convErr);
      return NextResponse.json(
        { error: 'Falha ao carregar a conversa' },
        { status: 500 }
      );
    }
    if (!conv) {
      return NextResponse.json(
        { error: 'Conversa não encontrada' },
        { status: 404 }
      );
    }
    if (
      !paused &&
      conv.ai_control_mode === 'paused_failure' &&
      !hasMinRole(role, 'admin')
    ) {
      return NextResponse.json(
        { error: 'Somente o dono pode liberar uma falha operacional.' },
        { status: 403 }
      );
    }

    const update: Record<string, unknown> = {
      ai_autoreply_disabled: paused,
      ai_control_mode: paused
        ? assignToMe
          ? 'human_active'
          : 'paused'
        : 'ai_active',
      ai_control_reason: paused
        ? assignToMe
          ? 'human_takeover'
          : 'manual_pause'
        : null,
      ai_control_changed_at: new Date().toISOString(),
    };

    if (paused) {
      if (assignToMe) update.assigned_agent_id = userId;
    } else {
      // Resuming hands the thread *back to the bot*. Clear the pause and
      // the handoff note, and — crucially — release ANY assignment, not
      // just the caller's own: the auto-reply eligibility gate stands
      // down whenever a human is assigned, so leaving a stale assignee
      // (e.g. the agent a prior handoff routed to) would silently keep
      // the bot muted and make "Resume AI" a no-op. This is the explicit
      // choice to let the bot own the thread again.
      update.assigned_agent_id = null;
      // Give the bot a fresh reply budget on this thread. This is a
      // deliberate, manual, rate-limited action (not automatable), so it
      // can't be used to bypass the per-conversation cap at scale — it's
      // a human choosing to re-engage the assistant.
      update.ai_reply_count = 0;
      update.ai_handoff_summary = null;
      update.ai_processing_status = 'idle';
      update.ai_processing_reason = null;
    }
    if (paused) {
      update.ai_processing_status = 'paused';
      update.ai_processing_reason = 'human_takeover';
    }

    const { error: upErr } = await supabase
      .from('conversations')
      .update(update)
      .eq('id', conversationId)
      .eq('account_id', accountId);
    if (upErr) {
      console.error('[ai/autoreply] update error:', upErr);
      return NextResponse.json(
        { error: 'Falha ao atualizar a conversa' },
        { status: 500 }
      );
    }
    if (paused && conv.ai_control_mode === 'awaiting_guidance') {
      const admin = supabaseAdmin();
      const resolvedAt = new Date().toISOString();
      await Promise.all([
        admin
          .from('ai_guidance_requests')
          .update({ status: 'cancelled', resolved_at: resolvedAt })
          .eq('account_id', accountId)
          .eq('conversation_id', conversationId)
          .in('status', ['open', 'resolving']),
        admin
          .from('attention_items')
          .update({
            status: 'resolved',
            resolved_at: resolvedAt,
            resolution: { outcome: 'human_takeover' },
          })
          .eq('account_id', accountId)
          .eq('deduplication_key', `ai-guidance:${conversationId}`)
          .in('status', ['open', 'snoozed']),
      ]);
    }

    return NextResponse.json({ success: true, paused });
  } catch (err) {
    return toErrorResponse(err);
  }
}
