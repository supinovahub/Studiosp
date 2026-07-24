import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendProviderText } from '@/lib/whatsapp/provider';
import { engineSendText } from '@/lib/flows/meta-send';
import { processNextDocumentAnalysis } from '@/lib/document-analysis/worker';

export const maxDuration = 60;

// Consultas administrativas abrangem várias tabelas e projeções dinâmicas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export async function GET(request: Request) {
  const expected =
    process.env.CRON_SECRET ?? process.env.AUTOMATION_CRON_SECRET;
  const supplied =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!expected || !safeMatch(supplied, expected)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const reassigned = await reassignExpiredOffers(db);
  const brokerNotifications = await notifyPendingBrokers(db);
  const followups = await sendDueFollowups(db);
  const cancellations = await cancelUncoveredAppointments(db);
  const documentAnalysis = await processNextDocumentAnalysis(db);
  return NextResponse.json({
    reassigned,
    brokerNotifications,
    followups,
    cancellations,
    documentAnalysis,
  });
}

function safeMatch(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function reassignExpiredOffers(db: ReturnType<typeof supabaseAdmin>) {
  const { data: due } = await db
    .from('assignment_offers')
    .select('*')
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString())
    .order('expires_at')
    .limit(50);
  let processed = 0;
  for (const offer of (due ?? []) as Row[]) {
    const { data: claim } = await db
      .from('assignment_offers')
      .update({ status: 'expired' })
      .eq('id', offer.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claim) continue;
    const [{ data: appointment }, { data: previousOffers }] = await Promise.all(
      [
        db
          .from('appointments')
          .select('*')
          .eq('id', offer.appointment_id)
          .maybeSingle(),
        db
          .from('assignment_offers')
          .select('broker_profile_id, attempt_order')
          .eq('appointment_id', offer.appointment_id),
      ]
    );
    if (!appointment || appointment.status !== 'reserved') continue;
    const previousIds = new Set(
      (previousOffers ?? []).map((item) => item.broker_profile_id)
    );
    const { data: candidates } = await db
      .from('broker_profiles')
      .select('*')
      .eq('account_id', offer.account_id)
      .eq('is_active', true)
      .eq('is_available', true)
      .not('whatsapp_verified_at', 'is', null)
      .order('routing_priority')
      .order('last_assignment_at', { ascending: true, nullsFirst: true })
      .limit(25);
    let next: Row | null = null;
    for (const candidate of (candidates ?? []) as Row[]) {
      if (previousIds.has(candidate.id)) continue;
      const { count } = await db
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('broker_profile_id', candidate.id)
        .in('status', ['reserved', 'broker_confirmed'])
        .lt('starts_at', appointment.ends_at)
        .gt('ends_at', appointment.starts_at);
      if (!count) {
        next = candidate;
        break;
      }
    }
    if (next) {
      const { data: policy } = await db
        .from('scheduling_policies')
        .select('broker_offer_sla_minutes')
        .eq('id', appointment.scheduling_policy_id)
        .maybeSingle();
      const expiresAt = new Date(
        Math.min(
          new Date(appointment.starts_at).getTime(),
          Date.now() + Number(policy?.broker_offer_sla_minutes ?? 15) * 60_000
        )
      ).toISOString();
      await db.from('assignment_offers').insert({
        account_id: offer.account_id,
        appointment_id: offer.appointment_id,
        broker_profile_id: next.id,
        attempt_order:
          Math.max(
            0,
            ...(previousOffers ?? []).map((item) => Number(item.attempt_order))
          ) + 1,
        channel: 'both',
        expires_at: expiresAt,
      });
    } else {
      await createAttention(db, {
        accountId: offer.account_id,
        opportunityId: appointment.opportunity_id,
        kind: 'broker_queue_exhausted',
        title: 'Reunião sem corretor disponível',
        key: `broker-queue-exhausted:${appointment.id}`,
      });
    }
    processed++;
  }
  return processed;
}

async function notifyPendingBrokers(db: ReturnType<typeof supabaseAdmin>) {
  const { data: offers } = await db
    .from('assignment_offers')
    .select('*')
    .eq('status', 'pending')
    .is('notified_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('offered_at')
    .limit(30);
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
      await sendProviderText({
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
        .update({ notified_at: new Date().toISOString() })
        .eq('id', offer.id);
      sent++;
    } catch (error) {
      console.error('[Studiosp/cron] notificação do corretor falhou:', error);
    }
  }
  return sent;
}

async function sendDueFollowups(db: ReturnType<typeof supabaseAdmin>) {
  const { data: due, error } = await db.rpc('studiosp_claim_due_followups', {
    p_worker_id: `vercel:${Date.now()}`,
    p_limit: 25,
  });
  if (error) return 0;
  let sent = 0;
  for (const followup of (due ?? []) as Row[]) {
    const { data: opportunity } = await db
      .from('opportunities')
      .select('*')
      .eq('id', followup.opportunity_id)
      .maybeSingle();
    if (
      !opportunity ||
      ['won', 'lost', 'meeting_scheduled'].includes(opportunity.stage)
    ) {
      await db
        .from('followup_executions')
        .update({
          status: 'cancelled',
          cancel_reason: 'opportunity_not_eligible',
        })
        .eq('id', followup.id);
      continue;
    }
    const messages = [
      'Oi! Passando para saber se você conseguiu ver minha última mensagem 😊',
      'Posso continuar te ajudando a encontrar oportunidades que façam sentido para o seu momento?',
      'Se ainda estiver buscando, me diga por aqui e retomamos de onde paramos.',
      'Vou pausar por enquanto para não te incomodar. Quando quiser retomar, é só me chamar por aqui.',
    ];
    try {
      await engineSendText({
        accountId: followup.account_id,
        userId: await configOwnerUserId(db, followup.account_id),
        conversationId: opportunity.primary_conversation_id,
        contactId: opportunity.contact_id,
        text: messages[
          Math.min(messages.length - 1, Number(followup.step_number) - 1)
        ],
        aiGenerated: true,
      });
      await db
        .from('followup_executions')
        .update({ status: 'sent' })
        .eq('id', followup.id);
      const { data: next } = await db
        .from('followup_executions')
        .select('scheduled_for')
        .eq('opportunity_id', opportunity.id)
        .eq('status', 'scheduled')
        .order('scheduled_for')
        .limit(1)
        .maybeSingle();
      await db
        .from('opportunities')
        .update({
          last_outbound_message_at: new Date().toISOString(),
          attention_state: next ? 'followup_scheduled' : 'awaiting_lead',
          next_action_at: next?.scheduled_for ?? null,
        })
        .eq('id', opportunity.id);
      sent++;
    } catch (sendError) {
      await db
        .from('followup_executions')
        .update({
          status: 'failed',
          last_error:
            sendError instanceof Error
              ? sendError.message.slice(0, 500)
              : 'Falha desconhecida',
        })
        .eq('id', followup.id);
    }
  }
  return sent;
}

async function cancelUncoveredAppointments(
  db: ReturnType<typeof supabaseAdmin>
) {
  const cutoff = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
  const { data: appointments } = await db
    .from('appointments')
    .select('*')
    .eq('status', 'reserved')
    .gt('starts_at', new Date().toISOString())
    .lte('starts_at', cutoff)
    .order('starts_at')
    .limit(30);
  let cancelled = 0;
  for (const appointment of (appointments ?? []) as Row[]) {
    const { count: pending } = await db
      .from('assignment_offers')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointment.id)
      .eq('status', 'pending');
    if (pending) continue;
    const { data: opportunity } = await db
      .from('opportunities')
      .select('*')
      .eq('id', appointment.opportunity_id)
      .maybeSingle();
    if (!opportunity) continue;
    try {
      await engineSendText({
        accountId: appointment.account_id,
        userId: await configOwnerUserId(db, appointment.account_id),
        conversationId: opportunity.primary_conversation_id,
        contactId: opportunity.contact_id,
        text: 'Tivemos um imprevisto com o corretor e não vamos conseguir manter o horário combinado. Sinto muito por isso. Uma pessoa da nossa equipe vai falar com você por aqui para reorganizar o melhor horário.',
        aiGenerated: true,
      });
    } catch (error) {
      console.error(
        '[Studiosp/cron] aviso de cancelamento não enviado:',
        error
      );
      continue;
    }
    await Promise.all([
      db
        .from('appointments')
        .update({
          status: 'cancelled',
          cancel_reason: 'Cobertura não confirmada até três horas antes.',
        })
        .eq('id', appointment.id),
      db
        .from('opportunities')
        .update({
          meeting_status: 'cancelled',
          attention_state: 'human_takeover',
          next_action_at: new Date().toISOString(),
        })
        .eq('id', opportunity.id),
      createAttention(db, {
        accountId: appointment.account_id,
        opportunityId: opportunity.id,
        kind: 'appointment_uncovered',
        title: 'Reagendamento humano necessário',
        key: `appointment-uncovered:${appointment.id}`,
      }),
    ]);
    cancelled++;
  }
  return cancelled;
}

async function configOwnerUserId(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string
) {
  const { data } = await db
    .from('whatsapp_config')
    .select('user_id')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!data?.user_id)
    throw new Error('Responsável pela conexão do WhatsApp não encontrado.');
  return data.user_id;
}

async function createAttention(
  db: ReturnType<typeof supabaseAdmin>,
  args: {
    accountId: string;
    opportunityId: string;
    kind: string;
    title: string;
    key: string;
  }
) {
  return db.from('attention_items').upsert(
    {
      account_id: args.accountId,
      opportunity_id: args.opportunityId,
      assigned_role: 'owner',
      kind: args.kind,
      severity: 'critical',
      title: args.title,
      due_at: new Date().toISOString(),
      deduplication_key: args.key,
    },
    { onConflict: 'account_id,deduplication_key', ignoreDuplicates: true }
  );
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
