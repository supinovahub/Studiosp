import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';
import { waitBetweenAiMessages } from '@/lib/ai/message-parser';
import { semanticMessageMetadata } from '@/lib/ai/semantic-context';
import { buildReactivationMessageWithVariant } from './cadence';
import { waitForReactivationDelay } from './pacing';

type Row = Record<string, unknown>;

type ReactivationWorkerOptions = {
  accountId?: string;
  campaignId?: string;
  limit?: number;
};

export async function sendDueReactivationTouches(
  db: SupabaseClient,
  options: ReactivationWorkerOptions = {}
) {
  const workerId = `reactivation:${Date.now()}`;
  const limit = Math.max(1, Math.min(3, options.limit ?? 3));
  let sent = 0;
  let outboundAttempts = 0;
  for (let index = 0; index < limit; index++) {
    // Claim one item at a time. This prevents later messages from remaining
    // stuck as "processing" while this worker waits for the randomized gap.
    const touches =
      options.accountId || options.campaignId
        ? await claimScopedTouches(db, workerId, { ...options, limit: 1 })
        : await claimGlobalTouches(db, workerId, 1);
    const touch = touches[0];
    if (!touch) break;
    const { data: lead } = await db
      .from('reactivation_leads')
      .select('*')
      .eq('id', touch.reactivation_lead_id)
      .maybeSingle();
    if (
      !lead ||
      !lead.contact_id ||
      !lead.conversation_id ||
      ['replied', 'converted', 'opted_out'].includes(lead.status)
    ) {
      await cancelTouch(db, String(touch.id), 'lead_not_eligible');
      continue;
    }
    const { data: activeSession, error: sessionError } = await db
      .from('reactivation_sessions')
      .select('id,reactivation_lead_id,campaign_id')
      .eq('account_id', touch.account_id)
      .eq('contact_id', lead.contact_id)
      .eq('status', 'active')
      .maybeSingle();
    if (
      sessionError ||
      !activeSession ||
      activeSession.reactivation_lead_id !== lead.id ||
      activeSession.campaign_id !== touch.campaign_id
    ) {
      await cancelTouch(
        db,
        String(touch.id),
        sessionError ? 'session_lookup_failed' : 'inactive_reactivation_session'
      );
      continue;
    }
    const { data: contact } = await db
      .from('contacts')
      .select('opted_out_at')
      .eq('id', lead.contact_id)
      .maybeSingle();
    if (contact?.opted_out_at) {
      await Promise.all([
        db
          .from('reactivation_leads')
          .update({ status: 'opted_out' })
          .eq('id', lead.id),
        cancelTouch(db, String(touch.id), 'contact_opted_out'),
      ]);
      continue;
    }
    const sentMessageIds: string[] = [];
    try {
      if (outboundAttempts > 0) {
        await waitForReactivationDelay();
      }
      outboundAttempts++;
      const message = buildReactivationMessageWithVariant(
        lead,
        Number(touch.step_number)
      );
      const userId = await ownerUserId(db, String(touch.account_id));
      for (const [partIndex, part] of message.parts.entries()) {
        if (partIndex > 0) await waitBetweenAiMessages();
        const result = await engineSendText({
          accountId: String(touch.account_id),
          userId,
          conversationId: lead.conversation_id,
          contactId: lead.contact_id,
          text: part,
          aiGenerated: false,
          semanticContext:
            partIndex === message.parts.length - 1
              ? semanticMessageMetadata({
                  version: 1,
                  mode: 'reactivation',
                  expectedQuestionKey: null,
                  expectedResponseKind: 'reactivation_interest',
                })
              : undefined,
        });
        sentMessageIds.push(result.whatsapp_message_id);
      }
      const now = new Date().toISOString();
      await Promise.all([
        db
          .from('reactivation_touches')
          .update({
            status: 'sent',
            sent_at: now,
            message_id: sentMessageIds.at(-1) ?? null,
            last_error: null,
          })
          .eq('id', touch.id),
        db
          .from('reactivation_leads')
          .update({ status: 'contacted', last_contacted_at: now })
          .eq('id', lead.id),
        db.from('reactivation_events').insert({
          account_id: touch.account_id,
          campaign_id: touch.campaign_id,
          reactivation_lead_id: lead.id,
          event_type: `touch_${touch.step_number}_sent`,
          actor_type: 'system',
          payload: {
            message_id: sentMessageIds.at(-1) ?? null,
            message_ids: sentMessageIds,
            message_parts: message.parts.length,
            message_variant: message.variant,
          },
        }),
      ]);
      sent++;
    } catch (sendError) {
      const message =
        sendError instanceof Error
          ? sendError.message.slice(0, 500)
          : 'Falha desconhecida';
      await db
        .from('reactivation_touches')
        .update({
          status:
            sentMessageIds.length > 0 || Number(touch.attempt_count) >= 3
              ? 'failed'
              : 'scheduled',
          scheduled_for: new Date(Date.now() + 15 * 60_000).toISOString(),
          last_error:
            sentMessageIds.length > 0
              ? `partial_send_no_retry:${sentMessageIds.length}:${message}`
              : message,
        })
        .eq('id', touch.id);
    }
  }
  return sent;
}

async function claimGlobalTouches(
  db: SupabaseClient,
  workerId: string,
  limit: number
): Promise<Row[]> {
  const { data, error } = await db.rpc('studiosp_claim_reactivation_touches', {
    p_worker_id: workerId,
    p_limit: Math.max(1, Math.min(20, limit)),
  });
  if (error) {
    console.error('[Reativação] falha ao reivindicar fila:', error);
    return [];
  }
  return (data ?? []) as Row[];
}

/**
 * Claims due work for the authenticated account without allowing an admin
 * heartbeat to advance another tenant's campaign. The conditional UPDATE is
 * the concurrency guard: only one caller can move a row from scheduled to
 * processing.
 */
async function claimScopedTouches(
  db: SupabaseClient,
  workerId: string,
  options: ReactivationWorkerOptions
): Promise<Row[]> {
  let query = db
    .from('reactivation_touches')
    .select(
      '*,reactivation_campaigns!inner(status),reactivation_leads!inner(status)'
    )
    .eq('status', 'scheduled')
    .eq('reactivation_campaigns.status', 'active')
    .in('reactivation_leads.status', ['queued', 'contacted'])
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for')
    .order('id')
    .limit(Math.max(1, Math.min(20, options.limit ?? 1)));
  if (options.accountId) query = query.eq('account_id', options.accountId);
  if (options.campaignId) query = query.eq('campaign_id', options.campaignId);
  const { data: candidates, error } = await query;
  if (error) {
    console.error('[Reativação] falha ao consultar fila da conta:', error);
    return [];
  }

  const claimed: Row[] = [];
  for (const candidate of (candidates ?? []) as Row[]) {
    const { data } = await db
      .from('reactivation_touches')
      .update({
        status: 'processing',
        claimed_at: new Date().toISOString(),
        worker_id: workerId,
        attempt_count: Number(candidate.attempt_count ?? 0) + 1,
      })
      .eq('id', candidate.id)
      .eq('status', 'scheduled')
      .select()
      .maybeSingle();
    if (data) claimed.push(data as Row);
  }
  return claimed;
}

async function ownerUserId(db: SupabaseClient, accountId: string) {
  const { data } = await db
    .from('whatsapp_config')
    .select('user_id')
    .eq('account_id', accountId)
    .single();
  if (!data?.user_id)
    throw new Error('Responsável pelo WhatsApp não encontrado.');
  return data.user_id;
}

async function cancelTouch(db: SupabaseClient, id: string, reason: string) {
  return db
    .from('reactivation_touches')
    .update({ status: 'cancelled', last_error: reason })
    .eq('id', id);
}
