import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';
import { buildReactivationMessage } from './cadence';

type Row = Record<string, unknown>;

export async function sendDueReactivationTouches(db: SupabaseClient) {
  const { data: touches, error } = await db.rpc(
    'studiosp_claim_reactivation_touches',
    { p_worker_id: `reactivation:${Date.now()}`, p_limit: 20 }
  );
  if (error) {
    console.error('[Reativação] falha ao reivindicar fila:', error);
    return 0;
  }
  let sent = 0;
  for (const touch of (touches ?? []) as Row[]) {
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
      const text = buildReactivationMessage(lead, Number(touch.step_number));
      const result = await engineSendText({
        accountId: String(touch.account_id),
        userId: await ownerUserId(db, String(touch.account_id)),
        conversationId: lead.conversation_id,
        contactId: lead.contact_id,
        text,
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
          payload: { message_id: result.whatsapp_message_id },
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
