-- Lead preparation, 10-15 minute calls and owner-controlled scheduling.

alter table public.opportunities
  add column if not exists call_brief jsonb,
  add column if not exists call_brief_updated_at timestamptz;

update public.scheduling_policies
set buffer_minutes = greatest(buffer_minutes, 10),
    updated_at = now()
where buffer_minutes < 10;

alter table public.scheduling_policies
  drop constraint if exists scheduling_policies_buffer_minutes_check;
alter table public.scheduling_policies
  add constraint scheduling_policies_buffer_minutes_check
  check (buffer_minutes between 10 and 120);

update public.scheduling_policies
set meeting_duration_minutes = 15,
    buffer_minutes = 10,
    updated_at = now()
where status = 'active';

update public.ai_config_versions
set communication_prompt = replace(
      replace(communication_prompt, '5 a 10 minutos', '10 a 15 minutos'),
      '5-10 minutos',
      '10-15 minutos'
    ),
    completion_message = case
      when completion_message is null then null
      else replace(
        replace(completion_message, '5 a 10 minutos', '10 a 15 minutos'),
        '5-10 minutos',
        '10-15 minutos'
      )
    end,
    updated_at = now()
where status = 'active'
  and (
    communication_prompt like '%5 a 10 minutos%'
    or communication_prompt like '%5-10 minutos%'
    or completion_message like '%5 a 10 minutos%'
    or completion_message like '%5-10 minutos%'
  );

create or replace function public.studiosp_schedule_manual_appointment(
  p_opportunity_id uuid,
  p_host_profile_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default 15,
  p_channel text default 'phone',
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_actor_profile_id uuid;
  v_host_profile public.profiles;
  v_host_broker public.broker_profiles;
  v_policy public.scheduling_policies;
  v_appointment public.appointments;
  v_existing_event public.appointment_events;
  v_previous_stage text;
  v_ends_at timestamptz;
begin
  select p.id, p.account_id
  into v_actor_profile_id, v_account_id
  from public.profiles p
  where p.user_id = (select auth.uid())
  limit 1;

  if v_actor_profile_id is null
    or not studiosp_private.is_account_admin(v_account_id)
  then
    raise exception 'Somente o dono pode agendar uma call manualmente.'
      using errcode = '42501';
  end if;

  if p_duration_minutes < 10 or p_duration_minutes > 15 then
    raise exception 'A duração deve estar entre 10 e 15 minutos.'
      using errcode = '23514';
  end if;
  if p_channel not in ('video', 'phone', 'undefined') then
    raise exception 'Canal de reunião inválido.' using errcode = '23514';
  end if;
  if p_starts_at <= now() then
    raise exception 'O horário precisa estar no futuro.' using errcode = '23514';
  end if;

  if p_idempotency_key is not null then
    select ae.* into v_existing_event
    from public.appointment_events ae
    where ae.account_id = v_account_id
      and ae.idempotency_key = p_idempotency_key
    limit 1;
    if found then
      select a.* into v_appointment
      from public.appointments a
      where a.id = v_existing_event.appointment_id;
      return v_appointment;
    end if;
  end if;

  select p.* into v_host_profile
  from public.profiles p
  where p.id = p_host_profile_id
    and p.account_id = v_account_id
  for share;
  if not found then
    raise exception 'Responsável não encontrado nesta conta.' using errcode = 'P0002';
  end if;

  insert into public.broker_profiles (
    account_id, profile_id, display_name, is_available, is_active,
    notification_preferences, routing_priority
  ) values (
    v_account_id,
    v_host_profile.id,
    coalesce(nullif(trim(v_host_profile.full_name), ''), v_host_profile.email, 'Responsável'),
    false,
    true,
    '{"dashboard":true,"whatsapp":false,"automatic_routing":false}'::jsonb,
    10000
  )
  on conflict (account_id, profile_id) do update
    set display_name = excluded.display_name,
        is_active = true
  returning * into v_host_broker;

  select sp.* into v_policy
  from public.scheduling_policies sp
  where sp.account_id = v_account_id
    and sp.status = 'active'
  order by sp.version desc
  limit 1
  for share;
  if not found then
    raise exception 'Política de agenda ativa não encontrada.' using errcode = 'P0002';
  end if;

  select o.stage into v_previous_stage
  from public.opportunities o
  where o.id = p_opportunity_id
    and o.account_id = v_account_id
  for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;
  if v_previous_stage in ('won', 'lost') then
    raise exception 'A oportunidade está encerrada.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.appointments a
    where a.opportunity_id = p_opportunity_id
      and a.status in ('reserved', 'broker_confirmed', 'reschedule_requested')
  ) then
    raise exception 'Esta oportunidade já possui uma reunião ativa.'
      using errcode = '23505';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);
  if exists (
    select 1
    from public.appointments a
    where a.account_id = v_account_id
      and a.broker_profile_id = v_host_broker.id
      and a.status in ('reserved', 'broker_confirmed')
      and p_starts_at < a.ends_at + make_interval(mins => v_policy.buffer_minutes)
      and v_ends_at + make_interval(mins => v_policy.buffer_minutes) > a.starts_at
  ) then
    raise exception 'O responsável já possui uma call ou intervalo de segurança nesse período.'
      using errcode = '23P01';
  end if;

  insert into public.appointments (
    account_id, opportunity_id, scheduling_policy_id, broker_profile_id,
    status, starts_at, ends_at, timezone, channel, lead_confirmed_at,
    broker_confirmed_at
  ) values (
    v_account_id, p_opportunity_id, v_policy.id, v_host_broker.id,
    'broker_confirmed', p_starts_at, v_ends_at, v_policy.timezone, p_channel,
    now(), now()
  )
  returning * into v_appointment;

  update public.opportunities
  set assigned_broker_id = v_host_broker.id,
      stage = 'meeting_scheduled',
      meeting_status = 'confirmed',
      attention_state = 'no_action',
      stage_changed_at = now(),
      next_action_at = p_starts_at,
      updated_at = now()
  where id = p_opportunity_id;

  insert into public.appointment_events (
    account_id, appointment_id, event_type, actor_type, actor_profile_id,
    source_type, idempotency_key, payload
  ) values (
    v_account_id, v_appointment.id, 'appointment_reserved', 'user',
    v_actor_profile_id, 'dashboard', p_idempotency_key,
    jsonb_build_object(
      'manual', true,
      'host_profile_id', p_host_profile_id,
      'duration_minutes', p_duration_minutes,
      'notes', p_notes
    )
  );

  insert into public.opportunity_events (
    account_id, opportunity_id, contact_id, conversation_id, event_type,
    from_stage, to_stage, actor_type, actor_profile_id, source_type,
    idempotency_key, payload
  )
  select
    o.account_id, o.id, o.contact_id, o.primary_conversation_id,
    'appointment_reserved', v_previous_stage, 'meeting_scheduled', 'user',
    v_actor_profile_id, 'dashboard',
    case when p_idempotency_key is null then null else p_idempotency_key || ':opportunity' end,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'manual', true,
      'host_profile_id', p_host_profile_id,
      'notes', p_notes
    )
  from public.opportunities o
  where o.id = p_opportunity_id;

  insert into public.audit_events (
    account_id, actor_type, actor_profile_id, action, entity_type, entity_id,
    next_data, reason
  ) values (
    v_account_id, 'user', v_actor_profile_id, 'appointment manually scheduled',
    'appointment', v_appointment.id,
    jsonb_build_object(
      'opportunity_id', p_opportunity_id,
      'host_profile_id', p_host_profile_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at
    ),
    p_notes
  );

  update public.attention_items
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_actor_profile_id,
      resolution = jsonb_build_object(
        'appointment_id', v_appointment.id,
        'resolution', 'manual_schedule'
      ),
      updated_at = now()
  where account_id = v_account_id
    and opportunity_id = p_opportunity_id
    and kind = 'schedule_exception'
    and status in ('open', 'snoozed');

  return v_appointment;
end;
$$;

revoke all on function public.studiosp_schedule_manual_appointment(
  uuid, uuid, timestamptz, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.studiosp_schedule_manual_appointment(
  uuid, uuid, timestamptz, integer, text, text, text
) to authenticated;

comment on function public.studiosp_schedule_manual_appointment(
  uuid, uuid, timestamptz, integer, text, text, text
) is 'Agenda uma call manual pelo dono, com conflito, intervalo, auditoria e responsável explícito.';
