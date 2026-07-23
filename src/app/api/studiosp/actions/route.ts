import { NextRequest, NextResponse } from 'next/server';
import {
  ForbiddenError,
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function numberOrNull(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function actionError(
  error: { message?: string; details?: string; hint?: string } | null
) {
  if (!error) return;
  console.error('[Studiosp/actions]', error);
  throw new Error(error.message || 'Não foi possível concluir a ação.');
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const body = (await request.json()) as Record<string, unknown>;
    const action = text(body.action);
    const { supabase, accountId, role, userId } = ctx;

    const profileResult = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .maybeSingle();
    actionError(profileResult.error);
    const profileId = profileResult.data?.id ?? null;

    if (action === 'opportunity_event') {
      const result = await supabase.rpc('studiosp_apply_opportunity_event', {
        p_opportunity_id: text(body.opportunityId),
        p_event_type: text(body.eventType),
        p_expected_stage: text(body.expectedStage) || null,
        p_payload:
          body.payload && typeof body.payload === 'object' ? body.payload : {},
        p_idempotency_key: crypto.randomUUID(),
        p_source_type: 'dashboard',
        p_reason: text(body.reason) || null,
      });
      actionError(result.error);
      return NextResponse.json({ opportunity: result.data });
    }

    if (action === 'resolve_attention') {
      const result = await supabase.rpc('studiosp_resolve_attention_item', {
        p_attention_item_id: text(body.attentionId),
        p_resolution:
          body.resolution && typeof body.resolution === 'object'
            ? body.resolution
            : {},
      });
      actionError(result.error);
      return NextResponse.json({ attention: result.data });
    }

    if (action === 'set_availability') {
      const result = await supabase.rpc('studiosp_set_broker_availability', {
        p_is_available: body.isAvailable === true,
        p_unavailable_until: text(body.unavailableUntil) || null,
      });
      actionError(result.error);
      return NextResponse.json({ broker: result.data });
    }

    if (action === 'respond_assignment') {
      const result = await supabase.rpc('studiosp_respond_assignment_offer', {
        p_offer_id: text(body.offerId),
        p_action: text(body.response),
        p_reason_id: text(body.reasonId) || null,
        p_notes: text(body.notes) || null,
        p_broker_profile_id: null,
        p_idempotency_key: crypto.randomUUID(),
      });
      actionError(result.error);
      return NextResponse.json({ offer: result.data });
    }

    if (!hasMinRole(role, 'admin')) {
      throw new ForbiddenError(
        'Somente o dono pode alterar esta configuração.'
      );
    }

    if (action === 'save_developer') {
      const name = text(body.name);
      if (!name)
        return NextResponse.json(
          { error: 'Informe o nome da incorporadora.' },
          { status: 400 }
        );
      const values = {
        account_id: accountId,
        name,
        normalized_name: normalizedName(name),
        description: text(body.description) || null,
        website_url: text(body.websiteUrl) || null,
        created_by: profileId,
      };
      const result = body.id
        ? await supabase
            .from('developers')
            .update(values)
            .eq('account_id', accountId)
            .eq('id', text(body.id))
            .select()
            .single()
        : await supabase.from('developers').insert(values).select().single();
      actionError(result.error);
      return NextResponse.json({ developer: result.data });
    }

    if (action === 'save_neighborhood') {
      const name = text(body.name);
      const city = text(body.city, 'São Paulo');
      const stateCode = text(body.stateCode, 'SP').toUpperCase();
      if (!name)
        return NextResponse.json(
          { error: 'Informe o nome do bairro.' },
          { status: 400 }
        );
      const values = {
        account_id: accountId,
        name,
        normalized_name: normalizedName(name),
        city,
        state_code: stateCode,
        region: text(body.region) || null,
        created_by: profileId,
      };
      const result = body.id
        ? await supabase
            .from('neighborhoods')
            .update(values)
            .eq('account_id', accountId)
            .eq('id', text(body.id))
            .select()
            .single()
        : await supabase.from('neighborhoods').insert(values).select().single();
      actionError(result.error);
      return NextResponse.json({ neighborhood: result.data });
    }

    if (action === 'save_development') {
      const name = text(body.name);
      if (!name || !body.developerId || !body.neighborhoodId) {
        return NextResponse.json(
          { error: 'Informe nome, incorporadora e bairro.' },
          { status: 400 }
        );
      }
      const values = {
        account_id: accountId,
        developer_id: text(body.developerId),
        neighborhood_id: text(body.neighborhoodId),
        name,
        normalized_name: normalizedName(name),
        internal_code: text(body.internalCode) || null,
        description: text(body.description),
        property_timing: text(body.propertyTiming, 'off_plan'),
        expected_delivery_date: text(body.expectedDeliveryDate) || null,
        highlights: Array.isArray(body.highlights)
          ? body.highlights
              .map(String)
              .map((item) => item.trim())
              .filter(Boolean)
          : text(body.highlights)
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
        knowledge_notes: text(body.knowledgeNotes) || null,
        internal_notes: text(body.internalNotes) || null,
        updated_by: profileId,
      };
      const result = body.id
        ? await supabase
            .from('developments')
            .update(values)
            .eq('account_id', accountId)
            .eq('id', text(body.id))
            .select()
            .single()
        : await supabase
            .from('developments')
            .insert({ ...values, created_by: profileId, status: 'draft' })
            .select()
            .single();
      actionError(result.error);
      return NextResponse.json({ development: result.data });
    }

    if (action === 'save_offer') {
      const label = text(body.label);
      const areaMin = numberOrNull(body.areaMin);
      if (!label || !body.developmentId || !areaMin) {
        return NextResponse.json(
          { error: 'Informe empreendimento, nome da opção e metragem.' },
          { status: 400 }
        );
      }
      const values = {
        account_id: accountId,
        development_id: text(body.developmentId),
        label,
        area_min_sqm: areaMin,
        area_max_sqm: numberOrNull(body.areaMax),
        price_from: numberOrNull(body.priceFrom),
        price_to: numberOrNull(body.priceTo),
        entry_from: numberOrNull(body.entryFrom),
        entry_to: numberOrNull(body.entryTo),
        installment_from: numberOrNull(body.installmentFrom),
        installment_to: numberOrNull(body.installmentTo),
        terms_summary: text(body.termsSummary) || null,
        property_timing: text(body.propertyTiming, 'off_plan'),
        valid_until: text(body.validUntil) || null,
        created_by: profileId,
      };
      const result = body.id
        ? await supabase
            .from('development_offers')
            .update(values)
            .eq('account_id', accountId)
            .eq('id', text(body.id))
            .select()
            .single()
        : await supabase
            .from('development_offers')
            .insert(values)
            .select()
            .single();
      actionError(result.error);
      return NextResponse.json({ offer: result.data });
    }

    if (action === 'publish_development') {
      const result = await supabase.rpc('studiosp_publish_development', {
        p_development_id: text(body.developmentId),
      });
      actionError(result.error);
      return NextResponse.json({ development: result.data });
    }

    if (action === 'archive_development') {
      const result = await supabase
        .from('developments')
        .update({ status: 'archived', updated_by: profileId })
        .eq('account_id', accountId)
        .eq('id', text(body.developmentId))
        .select()
        .single();
      actionError(result.error);
      return NextResponse.json({ development: result.data });
    }

    if (action === 'archive_media') {
      const result = await supabase
        .from('development_media')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          archived_by: profileId,
        })
        .eq('account_id', accountId)
        .eq('id', text(body.mediaId))
        .select()
        .single();
      actionError(result.error);
      return NextResponse.json({ media: result.data });
    }

    if (action === 'save_question') {
      const label = text(body.label);
      if (!label)
        return NextResponse.json(
          { error: 'Informe a pergunta.' },
          { status: 400 }
        );
      const values = {
        account_id: accountId,
        label,
        prompt_instruction:
          text(body.promptInstruction) || `Entenda naturalmente: ${label}.`,
        data_type: text(body.dataType, 'text'),
        normalization_strategy: text(
          body.normalizationStrategy,
          'free_text_v1'
        ),
        is_required: body.isRequired === true,
        is_active: body.isActive !== false,
        display_order: Number(body.displayOrder ?? 100),
      };
      const result = body.id
        ? await supabase
            .from('qualification_questions')
            .update(values)
            .eq('account_id', accountId)
            .eq('id', text(body.id))
            .select()
            .single()
        : await supabase
            .from('qualification_questions')
            .insert({
              ...values,
              key: `custom_${Date.now().toString(36)}`,
              is_system: false,
            })
            .select()
            .single();
      actionError(result.error);
      return NextResponse.json({ question: result.data });
    }

    if (action === 'save_ai_config') {
      const configId = text(body.id);
      if (!configId)
        return NextResponse.json(
          { error: 'Configuração ativa não encontrada.' },
          { status: 400 }
        );
      const result = await supabase
        .from('ai_config_versions')
        .update({
          identity_name: text(body.identityName, 'Assistente Studiosp'),
          communication_prompt: text(body.communicationPrompt),
          completion_message: text(body.completionMessage) || null,
          tone_config: {
            language: 'pt-BR',
            style: text(body.tone, 'consultivo'),
            message_length: text(body.messageLength, 'short'),
          },
        })
        .eq('account_id', accountId)
        .eq('id', configId)
        .eq('status', 'active')
        .select()
        .single();
      actionError(result.error);
      return NextResponse.json({ aiConfig: result.data });
    }

    if (action === 'save_followup_policy') {
      const result = await supabase
        .from('followup_policies')
        .update({
          name: text(body.name, 'Cadência padrão'),
          window_start: text(body.windowStart, '09:00'),
          window_end: text(body.windowEnd, '20:00'),
          steps: Array.isArray(body.steps) ? body.steps : [],
        })
        .eq('account_id', accountId)
        .eq('status', 'active')
        .select()
        .single();
      actionError(result.error);
      return NextResponse.json({ policy: result.data });
    }

    if (action === 'save_scheduling_policy') {
      const result = await supabase
        .from('scheduling_policies')
        .update({
          meeting_duration_minutes: Number(body.meetingDuration ?? 10),
          buffer_minutes: Number(body.bufferMinutes ?? 5),
          minimum_notice_minutes: Number(body.minimumNotice ?? 120),
          scheduling_horizon_days: Number(body.horizonDays ?? 7),
          broker_offer_sla_minutes: Number(body.brokerSla ?? 15),
          broker_reminder_minutes: Number(body.brokerReminder ?? 15),
          lead_cancellation_cutoff_minutes: Number(
            body.cancellationCutoff ?? 180
          ),
          routing_strategy: text(body.routingStrategy, 'round_robin'),
        })
        .eq('account_id', accountId)
        .eq('status', 'active')
        .select()
        .single();
      actionError(result.error);
      return NextResponse.json({ policy: result.data });
    }

    if (action === 'save_broker') {
      const result = await supabase
        .from('broker_profiles')
        .update({
          whatsapp_e164: text(body.whatsappE164) || null,
          whatsapp_verified_at: body.whatsappVerified
            ? new Date().toISOString()
            : null,
          routing_priority: Number(body.routingPriority ?? 100),
          max_parallel_assignments: Number(body.maxParallelAssignments ?? 1),
          is_available: body.isAvailable !== false,
          is_active: body.isActive !== false,
        })
        .eq('account_id', accountId)
        .eq('id', text(body.brokerId))
        .select()
        .single();
      actionError(result.error);
      return NextResponse.json({ broker: result.data });
    }

    if (action === 'save_window') {
      const values = {
        account_id: accountId,
        broker_profile_id: text(body.brokerId),
        weekday: Number(body.weekday),
        start_time: text(body.startTime),
        end_time: text(body.endTime),
        slot_interval_minutes: Number(body.slotInterval ?? 15),
        capacity_per_slot: Number(body.capacity ?? 1),
        created_by: profileId,
      };
      const result = body.id
        ? await supabase
            .from('guaranteed_windows')
            .update(values)
            .eq('account_id', accountId)
            .eq('id', text(body.id))
            .select()
            .single()
        : await supabase
            .from('guaranteed_windows')
            .insert(values)
            .select()
            .single();
      actionError(result.error);
      return NextResponse.json({ window: result.data });
    }

    return NextResponse.json(
      { error: 'Ação não reconhecida.' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Error && !('status' in error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
