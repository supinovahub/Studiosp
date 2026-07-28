import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText } from '@/lib/flows/meta-send';
import { processNextDocumentAnalysis } from '@/lib/document-analysis/worker';
import { sendDueReactivationTouches } from '@/lib/reactivation/worker';
import { processAiReplyQueue } from '@/lib/ai/reply-queue';
import { notifyPendingBrokers } from '@/lib/studiosp/broker-notifications';
import { generateContextualFollowup } from '@/lib/ai/followup';

export const maxDuration = 300;

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
  const reactivation = await sendDueReactivationTouches(db);
  const aiReplies = await processAiReplyQueue(db, 25);
  return NextResponse.json({
    reassigned,
    brokerNotifications,
    followups,
    cancellations,
    documentAnalysis,
    reactivation,
    aiReplies,
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
        channel: next.whatsapp_verified_at ? 'both' : 'dashboard',
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
    const { data: conversation } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled')
      .eq('account_id', followup.account_id)
      .eq('id', opportunity.primary_conversation_id)
      .maybeSingle();
    if (
      !conversation ||
      conversation.assigned_agent_id ||
      conversation.ai_autoreply_disabled
    ) {
      await db
        .from('followup_executions')
        .update({
          status: 'cancelled',
          cancel_reason: !conversation
            ? 'conversation_not_found'
            : conversation.assigned_agent_id
              ? 'assigned_to_human'
              : 'conversation_paused',
        })
        .eq('id', followup.id);
      continue;
    }
    const { data: contactControl } = await db
      .from('contacts')
      .select('automation_status')
      .eq('account_id', followup.account_id)
      .eq('id', opportunity.contact_id)
      .maybeSingle();
    if (contactControl?.automation_status === 'suppressed') {
      await db
        .from('followup_executions')
        .update({
          status: 'cancelled',
          cancel_reason: 'contact_automation_suppressed',
        })
        .eq('id', followup.id);
      continue;
    }
    const { count: totalSteps } = await db
      .from('followup_executions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', followup.account_id)
      .eq('opportunity_id', opportunity.id)
      .eq('policy_id', followup.policy_id);
    const followupText = await generateContextualFollowup({
      db,
      accountId: followup.account_id,
      conversationId: opportunity.primary_conversation_id,
      stepNumber: Number(followup.step_number),
      totalSteps: Math.max(Number(followup.step_number), totalSteps ?? 1),
      leadSummary: opportunity.lead_summary,
    });
    if (!followupText) {
      await db
        .from('followup_executions')
        .update({
          status: 'cancelled',
          cancel_reason: 'lead_replied_before_send',
        })
        .eq('id', followup.id);
      continue;
    }
    try {
      await engineSendText({
        accountId: followup.account_id,
        userId: await configOwnerUserId(db, followup.account_id),
        conversationId: opportunity.primary_conversation_id,
        contactId: opportunity.contact_id,
        text: followupText,
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
