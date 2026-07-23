import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import type { StudiospLead } from '@/lib/studiosp/types';

// A resposta agrega projeções heterogêneas de várias tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function assertQuery<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string
): T {
  if (result.error) {
    console.error(`[Studiosp/data] ${context}:`, result.error);
    throw new Error(`Falha ao carregar ${context}.`);
  }
  return (result.data ?? []) as T;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const view = request.nextUrl.searchParams.get('view') ?? 'overview';
    const id = request.nextUrl.searchParams.get('id');
    const { supabase, accountId, role, userId } = ctx;

    const profileResult = await supabase
      .from('profiles')
      .select('id, full_name, email, account_role')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    const profileId = profileResult.data?.id ?? null;

    const currentBrokerResult = profileId
      ? await supabase
          .from('broker_profiles')
          .select('id')
          .eq('account_id', accountId)
          .eq('profile_id', profileId)
          .eq('is_active', true)
          .maybeSingle()
      : { data: null, error: null };
    if (currentBrokerResult.error) throw currentBrokerResult.error;
    const brokerProfileId = currentBrokerResult.data?.id ?? null;

    const response: Record<string, unknown> = {
      view,
      role,
      profileId,
      brokerProfileId,
    };

    const opportunityViews = new Set([
      'overview',
      'my-day',
      'leads',
      'pipeline',
      'lead',
      'agenda',
      'followups',
      'reports',
      'attention',
    ]);

    let leads: StudiospLead[] = [];
    let leadRows: Row[] = [];
    let contacts: Row[] = [];
    let brokers: Row[] = [];

    if (opportunityViews.has(view)) {
      let opportunitiesQuery = supabase
        .from('opportunities')
        .select('*')
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
        .limit(view === 'lead' ? 1 : 500);
      if (view === 'lead' && id)
        opportunitiesQuery = opportunitiesQuery.eq('id', id);
      if (role === 'agent' && brokerProfileId) {
        opportunitiesQuery = opportunitiesQuery.eq(
          'assigned_broker_id',
          brokerProfileId
        );
      }
      leadRows = assertQuery<Row[]>(await opportunitiesQuery, 'oportunidades');

      const contactIds = [
        ...new Set(leadRows.map((row) => row.contact_id).filter(Boolean)),
      ];
      const brokerIds = [
        ...new Set(
          leadRows.map((row) => row.assigned_broker_id).filter(Boolean)
        ),
      ];
      if (contactIds.length) {
        contacts = assertQuery<Row[]>(
          await supabase
            .from('contacts')
            .select('id, name, phone, email')
            .eq('account_id', accountId)
            .in('id', contactIds),
          'contatos'
        );
      }
      if (brokerIds.length) {
        brokers = assertQuery<Row[]>(
          await supabase
            .from('broker_profiles')
            .select('id, display_name, whatsapp_e164, profile_id')
            .eq('account_id', accountId)
            .in('id', brokerIds),
          'corretores'
        );
      }
      const contactMap = new Map(contacts.map((row) => [row.id, row]));
      const brokerMap = new Map(brokers.map((row) => [row.id, row]));
      leads = leadRows.map((row) => ({
        ...row,
        contact: contactMap.get(row.contact_id) ?? null,
        broker: brokerMap.get(row.assigned_broker_id) ?? null,
      })) as StudiospLead[];
      response.leads = leads;
      if (view === 'lead') response.lead = leads[0] ?? null;
    }

    if (['overview', 'my-day', 'attention', 'lead'].includes(view)) {
      let attentionQuery = supabase
        .from('attention_items')
        .select('*')
        .eq('account_id', accountId)
        .in('status', ['open', 'snoozed'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(100);
      if (view === 'lead' && id)
        attentionQuery = attentionQuery.eq('opportunity_id', id);
      const attention = assertQuery<Row[]>(await attentionQuery, 'pendências');
      const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
      response.attention = attention.map((item) => ({
        ...item,
        lead: leadMap.get(item.opportunity_id) ?? null,
      }));
    }

    if (['overview', 'my-day', 'agenda', 'lead'].includes(view)) {
      let appointmentsQuery = supabase
        .from('appointments')
        .select('*')
        .eq('account_id', accountId)
        .order('starts_at', { ascending: true })
        .limit(200);
      if (view === 'lead' && id)
        appointmentsQuery = appointmentsQuery.eq('opportunity_id', id);
      if (role === 'agent' && brokerProfileId) {
        appointmentsQuery = appointmentsQuery.eq(
          'broker_profile_id',
          brokerProfileId
        );
      }
      const appointments = assertQuery<Row[]>(
        await appointmentsQuery,
        'agenda'
      );
      const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
      const brokerMap = new Map(brokers.map((broker) => [broker.id, broker]));
      response.appointments = appointments.map((appointment) => ({
        ...appointment,
        lead: leadMap.get(appointment.opportunity_id) ?? null,
        broker: brokerMap.get(appointment.broker_profile_id) ?? null,
      }));
    }

    if (['overview', 'lead', 'reports'].includes(view)) {
      let eventsQuery = supabase
        .from('opportunity_events')
        .select('*')
        .eq('account_id', accountId)
        .order('occurred_at', { ascending: false })
        .limit(view === 'reports' ? 500 : 100);
      if (view === 'lead' && id)
        eventsQuery = eventsQuery.eq('opportunity_id', id);
      response.events = assertQuery<Row[]>(
        await eventsQuery,
        'histórico operacional'
      );
    }

    if (view === 'lead' && id) {
      const [questionResult, answerResult, matchRunResult, reasonResult] =
        await Promise.all([
          supabase
            .from('qualification_questions')
            .select('*')
            .eq('account_id', accountId)
            .eq('is_active', true)
            .order('display_order'),
          supabase
            .from('qualification_answers')
            .select('*')
            .eq('account_id', accountId)
            .eq('opportunity_id', id)
            .eq('is_current', true),
          supabase
            .from('property_match_runs')
            .select('*')
            .eq('account_id', accountId)
            .eq('opportunity_id', id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('reason_definitions')
            .select('*')
            .eq('account_id', accountId)
            .eq('is_active', true)
            .order('display_order'),
        ]);
      response.questions = assertQuery<Row[]>(
        questionResult,
        'perguntas de qualificação'
      );
      response.answers = assertQuery<Row[]>(
        answerResult,
        'respostas de qualificação'
      );
      response.reasons = assertQuery<Row[]>(
        reasonResult,
        'motivos operacionais'
      );
      if (matchRunResult.error) throw matchRunResult.error;
      if (matchRunResult.data) {
        const matchResult = await supabase
          .from('property_match_results')
          .select('*')
          .eq('account_id', accountId)
          .eq('match_run_id', matchRunResult.data.id)
          .order('rank');
        const matchRows = assertQuery<Row[]>(
          matchResult,
          'imóveis compatíveis'
        );
        const developmentIds = [
          ...new Set(matchRows.map((row) => row.development_id)),
        ];
        const offerIds = [
          ...new Set(matchRows.map((row) => row.best_offer_id).filter(Boolean)),
        ];
        const [developmentResult, offerResult] = await Promise.all([
          developmentIds.length
            ? supabase
                .from('developments')
                .select(
                  'id, name, description, property_timing, highlights, developer_id, neighborhood_id'
                )
                .eq('account_id', accountId)
                .in('id', developmentIds)
            : Promise.resolve({ data: [], error: null }),
          offerIds.length
            ? supabase
                .from('development_offers')
                .select('*')
                .eq('account_id', accountId)
                .in('id', offerIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const matchedDevelopments = assertQuery<Row[]>(
          developmentResult,
          'empreendimentos compatíveis'
        );
        const matchedOffers = assertQuery<Row[]>(
          offerResult,
          'condições compatíveis'
        );
        const developmentMap = new Map(
          matchedDevelopments.map((row) => [row.id, row])
        );
        const offerMap = new Map(matchedOffers.map((row) => [row.id, row]));
        response.matches = matchRows.map((row) => ({
          ...row,
          development: developmentMap.get(row.development_id) ?? null,
          offer: offerMap.get(row.best_offer_id) ?? null,
        }));
      } else response.matches = [];
    }

    if (view === 'followups') {
      const [policyResult, executionResult] = await Promise.all([
        supabase
          .from('followup_policies')
          .select('*')
          .eq('account_id', accountId)
          .order('version', { ascending: false }),
        supabase
          .from('followup_executions')
          .select('*')
          .eq('account_id', accountId)
          .order('scheduled_for', { ascending: true })
          .limit(300),
      ]);
      response.followupPolicies = assertQuery<Row[]>(
        policyResult,
        'políticas de follow-up'
      );
      response.followups = assertQuery<Row[]>(executionResult, 'follow-ups');
    }

    if (view === 'developments') {
      const [developerResult, neighborhoodResult, developmentResult] =
        await Promise.all([
          supabase
            .from('developers')
            .select('*')
            .eq('account_id', accountId)
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('neighborhoods')
            .select('*')
            .eq('account_id', accountId)
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('developments')
            .select('*')
            .eq('account_id', accountId)
            .neq('status', 'archived')
            .order('updated_at', { ascending: false }),
        ]);
      const developmentRows = assertQuery<Row[]>(
        developmentResult,
        'empreendimentos'
      );
      const developmentIds = developmentRows.map((row) => row.id);
      const [offerResult, mediaResult] = developmentIds.length
        ? await Promise.all([
            supabase
              .from('development_offers')
              .select('*')
              .eq('account_id', accountId)
              .in('development_id', developmentIds)
              .order('display_order'),
            supabase
              .from('development_media')
              .select('*')
              .eq('account_id', accountId)
              .in('development_id', developmentIds)
              .neq('status', 'archived')
              .order('display_order'),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];
      const mediaRows = assertQuery<Row[]>(mediaResult, 'mídias');
      let mediaVersions: Row[] = [];
      if (mediaRows.length) {
        mediaVersions = assertQuery<Row[]>(
          await supabase
            .from('development_media_versions')
            .select('*')
            .eq('account_id', accountId)
            .in(
              'media_id',
              mediaRows.map((row) => row.id)
            ),
          'arquivos'
        );
      }
      response.developers = assertQuery<Row[]>(
        developerResult,
        'incorporadoras'
      );
      response.neighborhoods = assertQuery<Row[]>(
        neighborhoodResult,
        'bairros'
      );
      response.developments = developmentRows;
      response.offers = assertQuery<Row[]>(offerResult, 'condições comerciais');
      response.media = mediaRows;
      response.mediaVersions = mediaVersions;
    }

    if (view === 'team') {
      const [
        brokerResult,
        profilesResult,
        windowsResult,
        offersResult,
        reasonsResult,
        appointmentsResult,
      ] = await Promise.all([
        supabase
          .from('broker_profiles')
          .select('*')
          .eq('account_id', accountId)
          .order('display_name'),
        supabase
          .from('profiles')
          .select('id, full_name, email, account_role, avatar_url')
          .eq('account_id', accountId)
          .order('full_name'),
        supabase
          .from('guaranteed_windows')
          .select('*')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .order('weekday'),
        supabase
          .from('assignment_offers')
          .select('*')
          .eq('account_id', accountId)
          .order('offered_at', { ascending: false })
          .limit(200),
        supabase
          .from('reason_definitions')
          .select('*')
          .eq('account_id', accountId)
          .in('category', ['broker_rejection', 'transfer'])
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('appointments')
          .select('*')
          .eq('account_id', accountId)
          .order('starts_at', { ascending: false })
          .limit(200),
      ]);
      response.brokers = assertQuery<Row[]>(brokerResult, 'corretores');
      response.profiles = assertQuery<Row[]>(profilesResult, 'equipe');
      response.windows = assertQuery<Row[]>(windowsResult, 'disponibilidade');
      response.assignmentOffers = assertQuery<Row[]>(
        offersResult,
        'distribuições'
      );
      response.reasons = assertQuery<Row[]>(
        reasonsResult,
        'motivos de distribuição'
      );
      response.appointments = assertQuery<Row[]>(
        appointmentsResult,
        'reuniões da equipe'
      );
    }

    if (view === 'intelligence' || view === 'settings') {
      const [
        questionsResult,
        optionsResult,
        aiResult,
        runsResult,
        followupResult,
        scheduleResult,
        reasonResult,
      ] = await Promise.all([
        supabase
          .from('qualification_questions')
          .select('*')
          .eq('account_id', accountId)
          .order('display_order'),
        supabase
          .from('qualification_question_options')
          .select('*')
          .eq('account_id', accountId)
          .order('display_order'),
        supabase
          .from('ai_config_versions')
          .select('*')
          .eq('account_id', accountId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('ai_runs')
          .select(
            'id, purpose, status, provider, model, latency_ms, input_tokens, output_tokens, sanitized_error, created_at'
          )
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('followup_policies')
          .select('*')
          .eq('account_id', accountId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('scheduling_policies')
          .select('*')
          .eq('account_id', accountId)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('reason_definitions')
          .select('*')
          .eq('account_id', accountId)
          .order('category')
          .order('display_order'),
      ]);
      response.questions = assertQuery<Row[]>(questionsResult, 'perguntas');
      response.questionOptions = assertQuery<Row[]>(
        optionsResult,
        'opções de resposta'
      );
      if (aiResult.error) throw aiResult.error;
      if (runsResult.error) throw runsResult.error;
      if (followupResult.error) throw followupResult.error;
      if (scheduleResult.error) throw scheduleResult.error;
      response.aiConfig = aiResult.data;
      response.aiRuns = runsResult.data ?? [];
      response.followupPolicies = followupResult.data
        ? [followupResult.data]
        : [];
      response.schedulingPolicy = scheduleResult.data;
      response.reasons = assertQuery<Row[]>(
        reasonResult,
        'motivos operacionais'
      );
    }

    if (view === 'reports') {
      const auditResult = await supabase
        .from('audit_events')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(300);
      response.audit = assertQuery<Row[]>(auditResult, 'auditoria');
    }

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Falha ao carregar')
    ) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return toErrorResponse(error);
  }
}
