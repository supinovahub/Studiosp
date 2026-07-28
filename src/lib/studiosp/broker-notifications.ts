import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendProviderText } from '@/lib/whatsapp/provider';

type Row = Record<string, unknown>;

export async function notifyPendingBrokers(
  db: SupabaseClient,
  options: { appointmentId?: string; limit?: number } = {}
) {
  let offersQuery = db
    .from('assignment_offers')
    .select('*')
    .eq('status', 'pending')
    .is('notified_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('offered_at')
    .limit(options.limit ?? 30);
  if (options.appointmentId) {
    offersQuery = offersQuery.eq('appointment_id', options.appointmentId);
  }
  const { data: offers } = await offersQuery;
  let sent = 0;
  for (const offer of (offers ?? []) as Row[]) {
    const [{ data: broker }, { data: appointment }, { data: config }] =
      await Promise.all([
        db
          .from('broker_profiles')
          .select('*')
          .eq('id', offer.broker_profile_id)
          .maybeSingle(),
        db
          .from('appointments')
          .select('*')
          .eq('id', offer.appointment_id)
          .maybeSingle(),
        db
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', offer.account_id)
          .maybeSingle(),
      ]);
    if (!broker?.whatsapp_e164 || !appointment || !config) continue;
    const { data: opportunity } = await db
      .from('opportunities')
      .select('id, lead_summary, contact_id')
      .eq('id', appointment.opportunity_id)
      .maybeSingle();
    const { data: contact } = opportunity
      ? await db
          .from('contacts')
          .select('name, phone')
          .eq('id', opportunity.contact_id)
          .maybeSingle()
      : { data: null };
    const { data: matchRun } = opportunity
      ? await db
          .from('property_match_runs')
          .select('result_count')
          .eq('opportunity_id', opportunity.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    const text = [
      `Olá, ${broker.display_name}. Estou reservando uma call para ${formatDate(appointment.starts_at)}. Você consegue atender?`,
      `Lead: ${contact?.name ?? contact?.phone ?? 'sem nome'}.`,
      opportunity?.lead_summary ? `Resumo: ${opportunity.lead_summary}` : null,
      `Oportunidades compatíveis: ${matchRun?.result_count ?? 0}.`,
      'Responda “sim” para aceitar, “não + motivo” para rejeitar ou “transferir + motivo”.',
    ]
      .filter(Boolean)
      .join('\n\n');
    await db
      .from('assignment_offers')
      .update({
        last_notification_attempt_at: new Date().toISOString(),
        notification_attempts: Number(offer.notification_attempts ?? 0) + 1,
      })
      .eq('id', offer.id);
    try {
      const result = await sendProviderText({
        config: {
          provider: config.provider,
          phone_number_id: config.phone_number_id,
          uazapi_base_url: config.uazapi_base_url,
          accessToken: decrypt(config.access_token),
        },
        to: broker.whatsapp_e164,
        text,
      });
      await db
        .from('assignment_offers')
        .update({
          notified_at: new Date().toISOString(),
          notification_message_id: result.messageId,
        })
        .eq('id', offer.id);
      sent++;
    } catch (error) {
      console.error('[Studiosp/corretor] notificação falhou:', error);
    }
  }
  return sent;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}
