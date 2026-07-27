import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';
import { buildReactivationMessageWithVariant } from './cadence';

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
  const touches =
    options.accountId || options.campaignId
      ? await claimScopedTouches(db, workerId, options)
      : await claimGlobalTouches(db, workerId, options.limit ?? 1);
  let sent = 0;
  for (const touch of touches) {
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
    try {
      const message = buildReactivationMessageWithVariant(
        lead,
        Number(touch.step_number)
      );
      const result = await engineSendText({
        accountId: String(touch.account_id),
        userId: await ownerUserId(db, String(touch.account_id)),
        conversationId: lead.conversation_id,
        contactId: lead.contact_id,
        text: message.text,
        aiGenerated: false,
      });
      const now = new Date().toISOString();
      await Promise.all([
        db
          .from('reactivation_touches')
          .update({
            status: 'sent',
            sent_at: now,
            message_id: result.whatsapp_message_id,
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
            message_id: result.whatsapp_message_id,
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
          status: Number(touch.attempt_count) >= 3 ? 'failed' : 'scheduled',
          scheduled_for: new Date(Date.now() + 15 * 60_000).toISOString(),
          last_error: message,
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
