import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';

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
      const text = recoveryMessage(lead, Number(touch.step_number));
      const result = await engineSendText({
        accountId: String(touch.account_id),
        userId: await ownerUserId(db, String(touch.account_id)),
        conversationId: lead.conversation_id,
        contactId: lead.contact_id,
        text,
        aiGenerated: true,
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

function recoveryMessage(lead: Row, step: number) {
  const name = typeof lead.name === 'string' ? lead.name.split(' ')[0] : null;
  const greeting = name ? `Oi, ${name}!` : 'Oi!';
  const objective =
    lead.objective === 'invest'
      ? 'investir em um studio em São Paulo'
      : lead.objective === 'live'
        ? 'comprar um studio para morar em São Paulo'
        : 'comprar um studio em São Paulo';
  const entry =
    typeof lead.entry_value === 'number'
      ? ` Você tinha considerado uma entrada próxima de ${lead.entry_value.toLocaleString(
          'pt-BR',
          { style: 'currency', currency: 'BRL' }
        )}.`
      : '';
  return [
    `${greeting} Nós já conversamos em outro momento sobre ${objective}.${entry} Isso ainda faz sentido para você?`,
    `${greeting} Passando para confirmar se você ainda está buscando um studio em São Paulo. Posso retomar de onde paramos?`,
    `${greeting} Surgiram novas possibilidades para quem está avaliando studios em São Paulo. Quer que eu atualize seu perfil e veja o que combina com seu momento?`,
    `${greeting} Vou encerrar esta retomada para não incomodar. Se ainda quiser conversar sobre studios em São Paulo, é só responder por aqui.`,
  ][Math.max(0, Math.min(3, step - 1))];
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
