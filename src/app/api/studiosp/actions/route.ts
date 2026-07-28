import { NextRequest, NextResponse } from 'next/server';
import {
  ForbiddenError,
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import {
  isValidBrokerWhatsApp,
  normalizeBrokerWhatsApp,
} from '@/lib/studiosp/broker-phone';
import {
  SendMessageError,
  sendMessageToConversation,
} from '@/lib/whatsapp/send-message';
import {
  prepareQualificationQuestionInput,
  qualificationLabelFingerprint,
} from '@/lib/ai/qualification-question-config';

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

    if (action === 'complete_broker_call') {
      const result = await supabase.rpc('studiosp_complete_broker_call', {
        p_opportunity_id: text(body.opportunityId),
        p_expected_stage: text(body.expectedStage),
        p_outcome: text(body.outcome),
        p_notes: text(body.notes) || null,
        p_reason_id: text(body.reasonId) || null,
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

    if (action === 'register_own_broker_whatsapp') {
      if (role !== 'agent') {
        throw new ForbiddenError(
          'Somente corretores podem confirmar o WhatsApp operacional.'
        );
      }
      const whatsappE164 = normalizeBrokerWhatsApp(body.whatsappE164);
      if (!isValidBrokerWhatsApp(whatsappE164)) {
        return NextResponse.json(
          { error: 'Informe um WhatsApp válido com DDI.' },
          { status: 400 }
        );
      }
      const result = await supabase.rpc(
        'studiosp_register_my_broker_whatsapp',
        {
          p_whatsapp_e164: whatsappE164,
        }
      );
      if (result.error?.code === '23505') {
        return NextResponse.json(
          { error: 'Este WhatsApp já pertence a outro corretor.' },
          { status: 409 }
        );
      }
      actionError(result.error);
      return NextResponse.json({ broker: result.data });
    }

    if (!hasMinRole(role, 'admin')) {
      throw new ForbiddenError(
        'Somente o dono pode alterar esta configuração.'
      );
    }

    if (action === 'schedule_manual_appointment') {
      const opportunityId = text(body.opportunityId);
      const hostProfileId = text(body.hostProfileId);
      const startsAt = text(body.startsAt);
      const durationMinutes = Number(body.durationMinutes ?? 15);
      if (!opportunityId || !hostProfileId || !startsAt) {
        return NextResponse.json(
          { error: 'Informe lead, responsável, data e horário.' },
          { status: 400 }
        );
      }
      if (durationMinutes < 10 || durationMinutes > 15) {
        return NextResponse.json(
          { error: 'A duração deve estar entre 10 e 15 minutos.' },
          { status: 400 }
        );
      }
      const idempotencyKey = crypto.randomUUID();
      const result = await supabase.rpc(
        'studiosp_schedule_manual_appointment',
        {
          p_opportunity_id: opportunityId,
          p_host_profile_id: hostProfileId,
          p_starts_at: startsAt,
          p_duration_minutes: durationMinutes,
          p_channel: text(body.channel, 'phone'),
          p_notes: text(body.notes) || null,
          p_idempotency_key: idempotencyKey,
        }
      );
      actionError(result.error);

      let notificationWarning: string | null = null;
      if (body.notifyLead === true) {
        const opportunityResult = await supabase
          .from('opportunities')
          .select('primary_conversation_id')
          .eq('account_id', accountId)
          .eq('id', opportunityId)
          .single();
        actionError(opportunityResult.error);
        const conversationId =
          opportunityResult.data?.primary_conversation_id ?? null;
        if (!conversationId) {
          notificationWarning =
            'A call foi agendada, mas o lead não possui conversa ativa para receber a confirmação.';
        } else {
          const appointment = result.data as {
            starts_at?: string;
            timezone?: string;
          };
          const starts = new Date(String(appointment.starts_at));
          const formatted = new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: appointment.timezone ?? 'America/Sao_Paulo',
          }).format(starts);
          try {
            await sendMessageToConversation(supabase, accountId, {
              conversationId,
              messageType: 'text',
              contentText: `Sua conversa de 10 a 15 minutos está confirmada para ${formatted}.`,
            });
          } catch (error) {
            notificationWarning =
              'A call foi agendada, mas a confirmação não chegou ao WhatsApp. Revise a conversa.';
            console.error(
              '[Studiosp/actions] falha ao notificar agendamento manual:',
              error instanceof SendMessageError ? error.code : error
            );
            await supabase.from('attention_items').upsert(
              {
                account_id: accountId,
                opportunity_id: opportunityId,
                assigned_role: 'owner',
                kind: 'manual_schedule_notification_failed',
                severity: 'critical',
                title: 'Confirmação de call não enviada ao lead',
                context: {
                  appointment_id: (result.data as { id?: string })?.id ?? null,
                  conversation_id: conversationId,
                },
                due_at: new Date().toISOString(),
                deduplication_key: `manual-schedule-notification:${(result.data as { id?: string })?.id ?? opportunityId}`,
              },
              {
                onConflict: 'account_id,deduplication_key',
                ignoreDuplicates: true,
              }
            );
          }
        }
      }
      return NextResponse.json({
        appointment: result.data,
        notificationWarning,
      });
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
      const questionId = text(body.id) || null;
      const values = prepareQualificationQuestionInput(body);
      const [questionsResult, existingResult] = await Promise.all([
        supabase
          .from('qualification_questions')
          .select('id, label')
          .eq('account_id', accountId),
        questionId
          ? supabase
              .from('qualification_questions')
              .select(
                'id, key, data_type, normalization_strategy, is_required, is_active, is_system'
              )
              .eq('account_id', accountId)
              .eq('id', questionId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      actionError(questionsResult.error);
      actionError(existingResult.error);
      const existing = existingResult.data;
      if (questionId && !existing) {
        return NextResponse.json(
          { error: 'Informação de qualificação não encontrada.' },
          { status: 404 }
        );
      }
      const fingerprint = qualificationLabelFingerprint(values.label);
      const duplicate = (questionsResult.data ?? []).find(
        (question) =>
          question.id !== questionId &&
          qualificationLabelFingerprint(question.label) === fingerprint
      );
      if (duplicate) {
        return NextResponse.json(
          {
            error:
              'Já existe uma informação com esse nome. Edite a existente ou escolha outro nome.',
          },
          { status: 409 }
        );
      }
      if (
        existing?.is_system &&
        (values.dataType !== existing.data_type ||
          values.isRequired !== existing.is_required ||
          values.isActive !== existing.is_active ||
          values.visibilityCondition.mode !== 'always')
      ) {
        return NextResponse.json(
          {
            error:
              'Objetivos essenciais não podem ser desativados nem ter seu tipo ou obrigatoriedade alterados.',
          },
          { status: 400 }
        );
      }
      if (
        values.visibilityCondition.mode === 'answer_matches' &&
        values.visibilityCondition.question_key === existing?.key
      ) {
        return NextResponse.json(
          { error: 'Uma informação não pode depender dela mesma.' },
          { status: 400 }
        );
      }
      const result = await supabase.rpc(
        'studiosp_save_qualification_question',
        {
          p_account_id: accountId,
          p_question_id: questionId,
          p_label: values.label,
          p_prompt_instruction: values.promptInstruction,
          p_data_type: values.dataType,
          p_normalization_strategy: existing?.is_system
            ? existing.normalization_strategy
            : values.normalizationStrategy,
          p_is_required: values.isRequired,
          p_is_active: values.isActive,
          p_display_order: values.displayOrder,
          p_validation_schema: values.validationSchema,
          p_visibility_condition: values.visibilityCondition,
          p_options: values.options,
        }
      );
      actionError(result.error);
      return NextResponse.json({ question: result.data });
    }

    if (action === 'reorder_qualification_questions') {
      const questionIds = Array.isArray(body.questionIds)
        ? body.questionIds.map((value) => text(value)).filter(Boolean)
        : [];
      if (!questionIds.length) {
        return NextResponse.json(
          { error: 'Informe a nova ordem das informações.' },
          { status: 400 }
        );
      }
      const result = await supabase.rpc(
        'studiosp_reorder_qualification_questions',
        {
          p_account_id: accountId,
          p_question_ids: questionIds,
        }
      );
      actionError(result.error);
      return NextResponse.json({ questions: result.data });
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
          identity_name: text(body.identityName, 'Sofia'),
          communication_prompt: text(body.communicationPrompt),
          completion_message: text(body.completionMessage) || null,
          tone_config: {
            language: 'pt-BR',
            style: text(body.tone, 'consultivo'),
            message_length: text(body.messageLength, 'short'),
            adapt_to_lead: body.adaptToLead !== false,
            allow_contextual_laughter: body.allowContextualLaughter !== false,
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

    if (action === 'save_ai_reply_allowlist') {
      const rawNumbers = Array.isArray(body.numbers) ? body.numbers : [];
      const numbers = [
        ...new Set(
          rawNumbers
            .map((value) => text(value).replace(/\D/g, ''))
            .filter((value) => value.length >= 8 && value.length <= 15)
            .map((value) => `+${value}`)
        ),
      ].slice(0, 50);
      const result = await supabase
        .from('ai_configs')
        .update({ auto_reply_allowed_numbers: numbers })
        .eq('account_id', accountId)
        .select('auto_reply_allowed_numbers')
        .single();
      actionError(result.error);
      return NextResponse.json({
        allowedNumbers: result.data?.auto_reply_allowed_numbers ?? [],
      });
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
      const whatsappE164 = normalizeBrokerWhatsApp(body.whatsappE164) || null;
      if (whatsappE164 && !isValidBrokerWhatsApp(whatsappE164)) {
        return NextResponse.json(
          { error: 'Informe um WhatsApp válido com DDI.' },
          { status: 400 }
        );
      }
      const whatsappVerified =
        Boolean(whatsappE164) && body.whatsappVerified === true;
      const isAvailable = body.isAvailable !== false && whatsappVerified;
      const result = await supabase
        .from('broker_profiles')
        .update({
          whatsapp_e164: whatsappE164,
          whatsapp_verified_at: whatsappVerified
            ? new Date().toISOString()
            : null,
          routing_priority: Number(body.routingPriority ?? 100),
          max_parallel_assignments: Number(body.maxParallelAssignments ?? 1),
          is_available: isAvailable,
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
