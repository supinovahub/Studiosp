-- Studiosp: disponibilidade pessoal do corretor, duração por perfil e
-- intervalo operacional mínimo. Os horários garantidos continuam sendo
-- definidos pela gestão; a agenda pessoal só pode restringir essa cobertura.

alter table public.broker_profiles
  add column if not exists preferred_call_duration_minutes integer
  not null default 10;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'broker_profiles_preferred_call_duration_check'
      and conrelid = 'public.broker_profiles'::regclass
  ) then
    alter table public.broker_profiles
      add constraint broker_profiles_preferred_call_duration_check
      check (preferred_call_duration_minutes in (10, 15, 20, 30, 45));
  end if;
end $$;

-- O intervalo é uma proteção global da operação. A gestão pode aumentá-lo,
-- mas nunca reduzir abaixo dos 15 minutos aprovados para todos os corretores.
update public.scheduling_policies
set buffer_minutes = 15
where buffer_minutes < 15;

alter table public.scheduling_policies
  alter column buffer_minutes set default 15;
alter table public.scheduling_policies
  drop constraint if exists scheduling_policies_buffer_minutes_check;
alter table public.scheduling_policies
  add constraint scheduling_policies_buffer_minutes_check
  check (buffer_minutes between 15 and 120);

drop policy if exists scheduling_policies_admin_read
  on public.scheduling_policies;
drop policy if exists scheduling_policies_member_read
  on public.scheduling_policies;
create policy scheduling_policies_member_read
on public.scheduling_policies
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));

create table if not exists public.broker_availability_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  broker_profile_id uuid not null
    references public.broker_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  check (start_time < end_time)
);

create index if not exists broker_availability_rules_broker_day_idx
  on public.broker_availability_rules(
    broker_profile_id, weekday, is_active, start_time
  );
create index if not exists broker_availability_rules_account_idx
  on public.broker_availability_rules(account_id, broker_profile_id);
create index if not exists broker_availability_rules_created_by_idx
  on public.broker_availability_rules(created_by);

create or replace function studiosp_private.guard_broker_availability_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.broker_profile_id::text || ':' || new.weekday::text,
      0
    )
  );

  if new.is_active and exists (
    select 1
    from public.broker_availability_rules existing
    where existing.broker_profile_id = new.broker_profile_id
      and existing.weekday = new.weekday
      and existing.is_active
      and existing.id <> new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
  ) then
    raise exception 'Os horários pessoais não podem se sobrepor.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function studiosp_private.guard_broker_availability_overlap()
  from public, anon, authenticated;

drop trigger if exists broker_availability_rules_no_overlap
  on public.broker_availability_rules;
create trigger broker_availability_rules_no_overlap
before insert or update on public.broker_availability_rules
for each row
execute function studiosp_private.guard_broker_availability_overlap();

drop trigger if exists broker_availability_rules_updated_at
  on public.broker_availability_rules;
create trigger broker_availability_rules_updated_at
before update on public.broker_availability_rules
for each row execute function studiosp_private.set_updated_at();

alter table public.broker_availability_rules enable row level security;
revoke all on public.broker_availability_rules from anon, authenticated;
grant all on public.broker_availability_rules to service_role;
grant select, insert, update, delete on public.broker_availability_rules
  to authenticated;

drop policy if exists broker_availability_rules_read
  on public.broker_availability_rules;
create policy broker_availability_rules_read
on public.broker_availability_rules
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
);

drop policy if exists broker_availability_rules_admin_all
  on public.broker_availability_rules;
create policy broker_availability_rules_admin_all
on public.broker_availability_rules
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists broker_availability_rules_broker_insert
  on public.broker_availability_rules;
create policy broker_availability_rules_broker_insert
on public.broker_availability_rules
for insert to authenticated
with check (
  broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
  and created_by =
    (select studiosp_private.current_profile_id(account_id))
);

drop policy if exists broker_availability_rules_broker_update
  on public.broker_availability_rules;
create policy broker_availability_rules_broker_update
on public.broker_availability_rules
for update to authenticated
using (
  broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
)
with check (
  broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
  and created_by =
    (select studiosp_private.current_profile_id(account_id))
);

drop policy if exists broker_availability_rules_broker_delete
  on public.broker_availability_rules;
create policy broker_availability_rules_broker_delete
on public.broker_availability_rules
for delete to authenticated
using (
  broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
);

-- Corretores podem criar e remover somente bloqueios próprios. Capacidade
-- extra continua sendo uma decisão da gestão.
drop policy if exists availability_exceptions_broker_insert
  on public.availability_exceptions;
create policy availability_exceptions_broker_insert
on public.availability_exceptions
for insert to authenticated
with check (
  exception_type = 'blocked'
  and capacity_delta is null
  and broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
  and created_by =
    (select studiosp_private.current_profile_id(account_id))
);

drop policy if exists availability_exceptions_broker_update
  on public.availability_exceptions;
create policy availability_exceptions_broker_update
on public.availability_exceptions
for update to authenticated
using (
  exception_type = 'blocked'
  and broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
)
with check (
  exception_type = 'blocked'
  and capacity_delta is null
  and broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
  and created_by =
    (select studiosp_private.current_profile_id(account_id))
);

drop policy if exists availability_exceptions_broker_delete
  on public.availability_exceptions;
create policy availability_exceptions_broker_delete
on public.availability_exceptions
for delete to authenticated
using (
  exception_type = 'blocked'
  and broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
);

-- Mantém a cobertura atual na migração: a agenda pessoal nasce igual aos
-- horários que a gestão já havia garantido e depois pode ser restringida.
insert into public.broker_availability_rules (
  account_id,
  broker_profile_id,
  weekday,
  start_time,
  end_time,
  created_by
)
select
  gw.account_id,
  gw.broker_profile_id,
  gw.weekday,
  gw.start_time,
  gw.end_time,
  gw.created_by
from public.guaranteed_windows gw
where gw.is_active
  and not exists (
    select 1
    from public.broker_availability_rules bar
    where bar.broker_profile_id = gw.broker_profile_id
      and bar.weekday = gw.weekday
      and bar.start_time = gw.start_time
      and bar.end_time = gw.end_time
      and bar.is_active
  );

create or replace function public.studiosp_replace_my_availability(
  p_rules jsonb
)
returns setof public.broker_availability_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_broker public.broker_profiles;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Informe uma agenda semanal válida.'
      using errcode = '23514';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.account_role = 'agent'
  limit 1;
  if not found then
    raise exception 'Somente corretores podem alterar a própria agenda.'
      using errcode = '42501';
  end if;

  select bp.* into v_broker
  from public.broker_profiles bp
  where bp.account_id = v_profile.account_id
    and bp.profile_id = v_profile.id
    and bp.is_active
  for update;
  if not found then
    raise exception 'Perfil operacional de corretor não encontrado.'
      using errcode = 'P0002';
  end if;

  select count(*) into v_count
  from jsonb_to_recordset(p_rules)
    as rule(weekday smallint, start_time time, end_time time);
  if v_count > 42 then
    raise exception 'A agenda semanal aceita no máximo 42 faixas.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rules)
      as rule(weekday smallint, start_time time, end_time time)
    where rule.weekday is null
      or rule.weekday not between 0 and 6
      or rule.start_time is null
      or rule.end_time is null
      or rule.start_time >= rule.end_time
  ) then
    raise exception 'Revise os dias e horários informados.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rules)
      as rule(weekday smallint, start_time time, end_time time)
    where not exists (
      select 1
      from public.guaranteed_windows gw
      where gw.account_id = v_broker.account_id
        and gw.broker_profile_id = v_broker.id
        and gw.weekday = rule.weekday
        and gw.is_active
        and rule.start_time >= gw.start_time
        and rule.end_time <= gw.end_time
    )
  ) then
    raise exception
      'Um ou mais horários estão fora dos limites definidos pela empresa.'
      using errcode = '23514';
  end if;

  delete from public.broker_availability_rules
  where broker_profile_id = v_broker.id;

  insert into public.broker_availability_rules (
    account_id,
    broker_profile_id,
    weekday,
    start_time,
    end_time,
    created_by
  )
  select
    v_broker.account_id,
    v_broker.id,
    rule.weekday,
    rule.start_time,
    rule.end_time,
    v_profile.id
  from jsonb_to_recordset(p_rules)
    as rule(weekday smallint, start_time time, end_time time);

  delete from public.guaranteed_slots
  where broker_profile_id = v_broker.id
    and starts_at > now()
    and reserved_count = 0;

  insert into public.attention_items (
    account_id,
    opportunity_id,
    assigned_profile_id,
    assigned_role,
    kind,
    severity,
    title,
    context,
    due_at,
    deduplication_key
  )
  select
    appointment.account_id,
    appointment.opportunity_id,
    v_profile.id,
    'agent',
    'schedule_conflict',
    'critical',
    'Reunião fora da nova disponibilidade',
    jsonb_build_object(
      'appointment_id', appointment.id,
      'starts_at', appointment.starts_at,
      'ends_at', appointment.ends_at
    ),
    now(),
    'broker-schedule-conflict:' || appointment.id::text
  from public.appointments appointment
  where appointment.broker_profile_id = v_broker.id
    and appointment.status = 'broker_confirmed'
    and appointment.ends_at > now()
    and not exists (
      select 1
      from public.broker_availability_rules bar
      where bar.broker_profile_id = v_broker.id
        and bar.is_active
        and bar.weekday =
          extract(
            dow from appointment.starts_at at time zone appointment.timezone
          )::smallint
        and (
          appointment.starts_at at time zone appointment.timezone
        )::time >= bar.start_time
        and (
          appointment.ends_at at time zone appointment.timezone
        )::time <= bar.end_time
    )
  on conflict do nothing;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    next_data
  ) values (
    v_broker.account_id,
    'user',
    v_profile.id,
    'broker_weekly_availability_replaced',
    'broker_profile',
    v_broker.id,
    jsonb_build_object('rules', p_rules)
  );

  return query
  select bar.*
  from public.broker_availability_rules bar
  where bar.broker_profile_id = v_broker.id
  order by bar.weekday, bar.start_time;
end;
$$;

revoke all on function public.studiosp_replace_my_availability(jsonb)
  from public, anon;
grant execute on function public.studiosp_replace_my_availability(jsonb)
  to authenticated;

create or replace function public.studiosp_add_my_availability_exception(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default 'Bloqueio pessoal'
)
returns public.availability_exceptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_broker public.broker_profiles;
  v_exception public.availability_exceptions;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null
    or p_starts_at >= p_ends_at
    or p_ends_at <= now()
    or p_ends_at > now() + interval '366 days'
  then
    raise exception 'Informe um período futuro válido.'
      using errcode = '23514';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.account_role = 'agent'
  limit 1;
  if not found then
    raise exception 'Somente corretores podem criar bloqueios pessoais.'
      using errcode = '42501';
  end if;

  select bp.* into v_broker
  from public.broker_profiles bp
  where bp.account_id = v_profile.account_id
    and bp.profile_id = v_profile.id
    and bp.is_active;
  if not found then
    raise exception 'Perfil operacional de corretor não encontrado.'
      using errcode = 'P0002';
  end if;

  insert into public.availability_exceptions (
    account_id,
    broker_profile_id,
    exception_type,
    starts_at,
    ends_at,
    reason,
    created_by
  ) values (
    v_broker.account_id,
    v_broker.id,
    'blocked',
    p_starts_at,
    p_ends_at,
    coalesce(nullif(trim(p_reason), ''), 'Bloqueio pessoal'),
    v_profile.id
  )
  returning * into v_exception;

  delete from public.guaranteed_slots
  where broker_profile_id = v_broker.id
    and reserved_count = 0
    and starts_at < p_ends_at
    and ends_at > p_starts_at;

  insert into public.attention_items (
    account_id,
    opportunity_id,
    assigned_profile_id,
    assigned_role,
    kind,
    severity,
    title,
    context,
    due_at,
    deduplication_key
  )
  select
    appointment.account_id,
    appointment.opportunity_id,
    v_profile.id,
    'agent',
    'schedule_conflict',
    'critical',
    'Bloqueio conflita com uma reunião confirmada',
    jsonb_build_object(
      'appointment_id', appointment.id,
      'exception_id', v_exception.id,
      'starts_at', appointment.starts_at,
      'ends_at', appointment.ends_at
    ),
    now(),
    'broker-schedule-conflict:' || appointment.id::text
  from public.appointments appointment
  where appointment.broker_profile_id = v_broker.id
    and appointment.status = 'broker_confirmed'
    and appointment.starts_at < p_ends_at
    and appointment.ends_at > p_starts_at
  on conflict do nothing;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    next_data
  ) values (
    v_broker.account_id,
    'user',
    v_profile.id,
    'broker_availability_exception_created',
    'availability_exception',
    v_exception.id,
    to_jsonb(v_exception)
  );

  return v_exception;
end;
$$;

revoke all on function public.studiosp_add_my_availability_exception(
  timestamptz, timestamptz, text
) from public, anon;
grant execute on function public.studiosp_add_my_availability_exception(
  timestamptz, timestamptz, text
) to authenticated;

create or replace function public.studiosp_delete_my_availability_exception(
  p_exception_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_broker public.broker_profiles;
  v_deleted public.availability_exceptions;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.account_role = 'agent'
  limit 1;
  select bp.* into v_broker
  from public.broker_profiles bp
  where bp.account_id = v_profile.account_id
    and bp.profile_id = v_profile.id
    and bp.is_active;

  delete from public.availability_exceptions ae
  where ae.id = p_exception_id
    and ae.account_id = v_broker.account_id
    and ae.broker_profile_id = v_broker.id
    and ae.exception_type = 'blocked'
  returning ae.* into v_deleted;
  if not found then
    raise exception 'Bloqueio não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    previous_data
  ) values (
    v_broker.account_id,
    'user',
    v_profile.id,
    'broker_availability_exception_deleted',
    'availability_exception',
    v_deleted.id,
    to_jsonb(v_deleted)
  );

  return true;
end;
$$;

revoke all on function public.studiosp_delete_my_availability_exception(uuid)
  from public, anon;
grant execute on function public.studiosp_delete_my_availability_exception(uuid)
  to authenticated;

create or replace function public.studiosp_update_my_broker_preferences(
  p_call_duration_minutes integer,
  p_dashboard_notifications boolean,
  p_whatsapp_notifications boolean
)
returns public.broker_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_broker public.broker_profiles;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_call_duration_minutes not in (10, 15, 20, 30, 45) then
    raise exception 'Selecione uma duração de reunião válida.'
      using errcode = '23514';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.account_role = 'agent'
  limit 1;
  if not found then
    raise exception 'Somente corretores podem alterar estas preferências.'
      using errcode = '42501';
  end if;

  update public.broker_profiles bp
  set preferred_call_duration_minutes = p_call_duration_minutes,
      notification_preferences =
        coalesce(bp.notification_preferences, '{}'::jsonb)
        || jsonb_build_object(
          'dashboard', coalesce(p_dashboard_notifications, true),
          'whatsapp', coalesce(p_whatsapp_notifications, true)
        )
  where bp.account_id = v_profile.account_id
    and bp.profile_id = v_profile.id
    and bp.is_active
  returning bp.* into v_broker;
  if not found then
    raise exception 'Perfil operacional de corretor não encontrado.'
      using errcode = 'P0002';
  end if;

  delete from public.guaranteed_slots
  where broker_profile_id = v_broker.id
    and starts_at > now()
    and reserved_count = 0;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    next_data
  ) values (
    v_broker.account_id,
    'user',
    v_profile.id,
    'broker_preferences_updated',
    'broker_profile',
    v_broker.id,
    jsonb_build_object(
      'preferred_call_duration_minutes',
      v_broker.preferred_call_duration_minutes,
      'notification_preferences',
      v_broker.notification_preferences
    )
  );

  return v_broker;
end;
$$;

revoke all on function public.studiosp_update_my_broker_preferences(
  integer, boolean, boolean
) from public, anon;
grant execute on function public.studiosp_update_my_broker_preferences(
  integer, boolean, boolean
) to authenticated;

create or replace function public.studiosp_set_broker_availability(
  p_is_available boolean,
  p_unavailable_until timestamptz default null
)
returns public.broker_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.broker_profiles;
begin
  select bp.* into v_profile
  from public.broker_profiles bp
  join public.profiles p on p.id = bp.profile_id
  where p.user_id = (select auth.uid())
    and bp.is_active
  for update;

  if not found then
    raise exception 'Perfil de corretor não encontrado.'
      using errcode = 'P0002';
  end if;
  if p_is_available and p_unavailable_until is not null then
    raise exception 'Um corretor disponível não pode ter bloqueio futuro.'
      using errcode = '23514';
  end if;
  if not p_is_available
    and p_unavailable_until is not null
    and p_unavailable_until <= now()
  then
    raise exception 'O fim da pausa precisa estar no futuro.'
      using errcode = '23514';
  end if;

  update public.broker_profiles
  set is_available = p_is_available,
      unavailable_until =
        case when p_is_available then null else p_unavailable_until end
  where id = v_profile.id
  returning * into v_profile;

  if not p_is_available then
    delete from public.guaranteed_slots
    where broker_profile_id = v_profile.id
      and starts_at > now()
      and reserved_count = 0
      and (
        p_unavailable_until is null
        or starts_at < p_unavailable_until
      );
  end if;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    next_data
  ) values (
    v_profile.account_id,
    'user',
    v_profile.profile_id,
    'broker_availability_changed',
    'broker_profile',
    v_profile.id,
    jsonb_build_object(
      'is_available', p_is_available,
      'unavailable_until', p_unavailable_until
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.studiosp_set_broker_availability(
  boolean, timestamptz
) from public, anon;
grant execute on function public.studiosp_set_broker_availability(
  boolean, timestamptz
) to authenticated;

create or replace function public.studiosp_materialize_guaranteed_slots(
  p_account_id uuid,
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_inserted integer := 0;
  v_is_service boolean :=
    coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  if p_start_date is null or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date > p_start_date + 90
  then
    raise exception 'Intervalo de geração de horários inválido.'
      using errcode = '23514';
  end if;
  if p_account_id is null then
    raise exception 'Informe a operação para gerar os horários.'
      using errcode = '23502';
  end if;
  if not v_is_service
    and not studiosp_private.is_account_admin(p_account_id)
  then
    raise exception 'Você não tem permissão para gerar horários.'
      using errcode = '42501';
  end if;

  select sp.timezone into v_timezone
  from public.scheduling_policies sp
  where sp.account_id = p_account_id
    and sp.status = 'active';
  if v_timezone is null then
    raise exception 'Política de agenda ativa não encontrada.'
      using errcode = 'P0002';
  end if;

  -- Remove projeções ainda não reservadas para refletir imediatamente
  -- alterações de agenda, pausas, duração e bloqueios.
  delete from public.guaranteed_slots gs
  where gs.account_id = p_account_id
    and gs.reserved_count = 0
    and gs.starts_at >=
      (p_start_date::timestamp at time zone v_timezone)
    and gs.starts_at <
      ((p_end_date + 1)::timestamp at time zone v_timezone);

  with candidate_slots as (
    select
      gw.account_id,
      gw.id as window_id,
      gw.broker_profile_id,
      (
        day_value::date + slot_time::time
      ) at time zone v_timezone as starts_at,
      (
        day_value::date + slot_time::time
        + make_interval(mins => bp.preferred_call_duration_minutes)
      ) at time zone v_timezone as ends_at,
      gw.capacity_per_slot as capacity,
      sp.buffer_minutes
    from public.guaranteed_windows gw
    join public.scheduling_policies sp
      on sp.account_id = gw.account_id
      and sp.status = 'active'
    join public.broker_profiles bp
      on bp.id = gw.broker_profile_id
      and bp.account_id = gw.account_id
    cross join lateral generate_series(
      p_start_date,
      p_end_date,
      interval '1 day'
    ) day_value
    cross join lateral generate_series(
      day_value::date + gw.start_time,
      day_value::date + gw.end_time
        - make_interval(mins => bp.preferred_call_duration_minutes),
      make_interval(mins => gw.slot_interval_minutes)
    ) slot_time
    where gw.account_id = p_account_id
      and gw.is_active
      and bp.is_active
      and bp.whatsapp_verified_at is not null
      and (
        bp.is_available
        or (
          bp.unavailable_until is not null
          and (
            day_value::date + slot_time::time
          ) at time zone v_timezone >= bp.unavailable_until
        )
      )
      and extract(dow from day_value)::smallint = gw.weekday
      and (gw.valid_from is null or day_value::date >= gw.valid_from)
      and (gw.valid_until is null or day_value::date <= gw.valid_until)
      and exists (
        select 1
        from public.broker_availability_rules bar
        where bar.account_id = gw.account_id
          and bar.broker_profile_id = gw.broker_profile_id
          and bar.weekday = gw.weekday
          and bar.is_active
          and slot_time::time >= bar.start_time
          and (
            slot_time::time
            + make_interval(mins => bp.preferred_call_duration_minutes)
          )::time <= bar.end_time
      )
  ), eligible_slots as (
    select cs.*
    from candidate_slots cs
    where cs.starts_at > now()
      and not exists (
        select 1
        from public.availability_exceptions ae
        where ae.account_id = cs.account_id
          and ae.broker_profile_id = cs.broker_profile_id
          and ae.exception_type = 'blocked'
          and cs.starts_at < ae.ends_at
          and cs.ends_at > ae.starts_at
      )
      and not exists (
        select 1
        from public.guaranteed_slots occupied
        where occupied.broker_profile_id = cs.broker_profile_id
          and occupied.reserved_count > 0
          and cs.starts_at <
            occupied.ends_at
            + make_interval(mins => cs.buffer_minutes)
          and cs.ends_at
            + make_interval(mins => cs.buffer_minutes)
            > occupied.starts_at
      )
  ), inserted as (
    insert into public.guaranteed_slots (
      account_id,
      window_id,
      broker_profile_id,
      starts_at,
      ends_at,
      capacity
    )
    select
      es.account_id,
      es.window_id,
      es.broker_profile_id,
      es.starts_at,
      es.ends_at,
      least(es.capacity, 1)
    from eligible_slots es
    on conflict (broker_profile_id, starts_at) do update
      set window_id = excluded.window_id,
          ends_at = excluded.ends_at,
          capacity = greatest(
            public.guaranteed_slots.reserved_count,
            excluded.capacity
          ),
          status = case
            when public.guaranteed_slots.reserved_count = 0 then 'available'
            else public.guaranteed_slots.status
          end
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return v_inserted;
end;
$$;

revoke all on function public.studiosp_materialize_guaranteed_slots(
  uuid, date, date
) from public, anon;
grant execute on function public.studiosp_materialize_guaranteed_slots(
  uuid, date, date
) to authenticated, service_role;

create or replace function public.studiosp_reserve_guaranteed_slot(
  p_opportunity_id uuid,
  p_slot_id uuid,
  p_channel text default 'undefined',
  p_idempotency_key text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.opportunities;
  v_slot public.guaranteed_slots;
  v_policy public.scheduling_policies;
  v_appointment public.appointments;
  v_existing_event public.appointment_events;
  v_offer_expires_at timestamptz;
  v_is_service boolean :=
    coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  if p_channel not in ('video', 'phone', 'undefined') then
    raise exception 'Canal de reunião inválido.' using errcode = '23514';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing_event
    from public.appointment_events
    where idempotency_key = p_idempotency_key
    limit 1;
    if found then
      select * into v_appointment
      from public.appointments
      where id = v_existing_event.appointment_id;
      return v_appointment;
    end if;
  end if;

  select * into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
  for update;
  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;
  if v_opportunity.stage in ('won', 'lost') then
    raise exception 'A oportunidade está encerrada.'
      using errcode = '23514';
  end if;
  if not v_is_service
    and not studiosp_private.is_account_admin(v_opportunity.account_id)
  then
    raise exception 'Você não tem permissão para reservar este horário.'
      using errcode = '42501';
  end if;

  select * into v_slot
  from public.guaranteed_slots
  where id = p_slot_id
    and account_id = v_opportunity.account_id
  for update;
  if not found or v_slot.status <> 'available' then
    raise exception 'Este horário não está disponível.'
      using errcode = 'P0002';
  end if;

  select * into v_policy
  from public.scheduling_policies
  where account_id = v_opportunity.account_id
    and status = 'active'
  for share;
  if not found then
    raise exception 'Política de agenda ativa não encontrada.'
      using errcode = 'P0002';
  end if;

  if v_slot.starts_at <
      now() + make_interval(mins => v_policy.minimum_notice_minutes)
    or v_slot.starts_at >
      now() + make_interval(days => v_policy.scheduling_horizon_days)
  then
    raise exception 'O horário está fora da antecedência permitida.'
      using errcode = '23514';
  end if;
  if v_slot.reserved_count > 0 then
    raise exception 'Este corretor já recebeu uma reserva neste horário.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.broker_profiles bp
    where bp.id = v_slot.broker_profile_id
      and bp.account_id = v_slot.account_id
      and bp.is_active
      and bp.whatsapp_verified_at is not null
      and (
        bp.is_available
        or (
          bp.unavailable_until is not null
          and bp.unavailable_until <= v_slot.starts_at
        )
      )
  ) then
    raise exception 'O corretor não está disponível para este horário.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.broker_availability_rules bar
    where bar.account_id = v_slot.account_id
      and bar.broker_profile_id = v_slot.broker_profile_id
      and bar.is_active
      and bar.weekday =
        extract(
          dow from v_slot.starts_at at time zone v_policy.timezone
        )::smallint
      and (v_slot.starts_at at time zone v_policy.timezone)::time
        >= bar.start_time
      and (v_slot.ends_at at time zone v_policy.timezone)::time
        <= bar.end_time
  ) then
    raise exception 'O horário está fora da agenda pessoal do corretor.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.availability_exceptions ae
    where ae.account_id = v_slot.account_id
      and ae.broker_profile_id = v_slot.broker_profile_id
      and ae.exception_type = 'blocked'
      and v_slot.starts_at < ae.ends_at
      and v_slot.ends_at > ae.starts_at
  ) then
    raise exception 'O horário foi bloqueado.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.guaranteed_slots occupied
    where occupied.broker_profile_id = v_slot.broker_profile_id
      and occupied.id <> v_slot.id
      and occupied.reserved_count > 0
      and v_slot.starts_at <
        occupied.ends_at
        + make_interval(mins => v_policy.buffer_minutes)
      and v_slot.ends_at
        + make_interval(mins => v_policy.buffer_minutes)
        > occupied.starts_at
  ) then
    raise exception 'O intervalo de segurança deste corretor está ocupado.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.appointments a
    where a.opportunity_id = p_opportunity_id
      and a.status in (
        'reserved',
        'broker_confirmed',
        'reschedule_requested'
      )
  ) then
    raise exception 'Esta oportunidade já possui uma reunião ativa.'
      using errcode = '23505';
  end if;

  update public.guaranteed_slots
  set reserved_count = reserved_count + 1
  where id = v_slot.id;

  update public.guaranteed_slots
  set status = 'blocked'
  where broker_profile_id = v_slot.broker_profile_id
    and id <> v_slot.id
    and reserved_count = 0
    and v_slot.starts_at <
      ends_at + make_interval(mins => v_policy.buffer_minutes)
    and v_slot.ends_at
      + make_interval(mins => v_policy.buffer_minutes) > starts_at;

  insert into public.appointments (
    account_id,
    opportunity_id,
    scheduling_policy_id,
    slot_id,
    status,
    starts_at,
    ends_at,
    timezone,
    channel,
    lead_confirmed_at
  ) values (
    v_opportunity.account_id,
    v_opportunity.id,
    v_policy.id,
    v_slot.id,
    'reserved',
    v_slot.starts_at,
    v_slot.ends_at,
    v_policy.timezone,
    p_channel,
    now()
  )
  returning * into v_appointment;

  v_offer_expires_at := least(
    now() + make_interval(mins => v_policy.broker_offer_sla_minutes),
    v_slot.starts_at
  );
  if v_offer_expires_at <= now() then
    v_offer_expires_at := now() + interval '1 minute';
  end if;

  insert into public.assignment_offers (
    account_id,
    appointment_id,
    broker_profile_id,
    attempt_order,
    channel,
    expires_at
  ) values (
    v_opportunity.account_id,
    v_appointment.id,
    v_slot.broker_profile_id,
    1,
    'both',
    v_offer_expires_at
  );

  update public.opportunities
  set stage = 'meeting_scheduled',
      meeting_status = 'reserved',
      attention_state = 'awaiting_broker',
      stage_changed_at = now(),
      next_action_at = v_offer_expires_at
  where id = v_opportunity.id;

  insert into public.appointment_events (
    account_id,
    appointment_id,
    event_type,
    actor_type,
    source_type,
    idempotency_key,
    payload
  ) values (
    v_opportunity.account_id,
    v_appointment.id,
    'appointment_reserved',
    case when v_is_service then 'ai' else 'user' end,
    case when v_is_service then 'api' else 'dashboard' end,
    p_idempotency_key,
    jsonb_build_object('slot_id', v_slot.id)
  );

  insert into public.opportunity_events (
    account_id,
    opportunity_id,
    contact_id,
    conversation_id,
    event_type,
    from_stage,
    to_stage,
    actor_type,
    source_type,
    idempotency_key,
    payload
  ) values (
    v_opportunity.account_id,
    v_opportunity.id,
    v_opportunity.contact_id,
    v_opportunity.primary_conversation_id,
    'appointment_reserved',
    v_opportunity.stage,
    'meeting_scheduled',
    case when v_is_service then 'ai' else 'user' end,
    case when v_is_service then 'api' else 'dashboard' end,
    case
      when p_idempotency_key is null then null
      else p_idempotency_key || ':opportunity'
    end,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'slot_id', v_slot.id
    )
  );

  return v_appointment;
end;
$$;

revoke all on function public.studiosp_reserve_guaranteed_slot(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.studiosp_reserve_guaranteed_slot(
  uuid, uuid, text, text
) to authenticated, service_role;

create or replace function public.studiosp_respond_assignment_offer(
  p_offer_id uuid,
  p_action text,
  p_reason_id uuid default null,
  p_notes text default null,
  p_broker_profile_id uuid default null,
  p_idempotency_key text default null
)
returns public.assignment_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.assignment_offers;
  v_appointment public.appointments;
  v_broker_id uuid;
  v_next_broker_id uuid;
  v_next_order integer;
  v_policy public.scheduling_policies;
  v_is_service boolean :=
    coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  if p_action not in ('accept', 'reject', 'transfer') then
    raise exception 'Resposta de oferta inválida.'
      using errcode = '23514';
  end if;

  select * into v_offer
  from public.assignment_offers
  where id = p_offer_id
  for update;
  if not found then
    raise exception 'Oferta não encontrada.' using errcode = 'P0002';
  end if;

  v_broker_id := case
    when v_is_service then p_broker_profile_id
    else studiosp_private.current_broker_id(v_offer.account_id)
  end;
  if v_broker_id is null or v_broker_id <> v_offer.broker_profile_id then
    raise exception 'Esta oferta não pertence a este corretor.'
      using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    return v_offer;
  end if;
  if v_offer.expires_at <= now() then
    update public.assignment_offers
    set status = 'expired'
    where id = v_offer.id
    returning * into v_offer;
    return v_offer;
  end if;
  if p_action in ('reject', 'transfer') and (
    p_reason_id is null
    or not exists (
      select 1
      from public.reason_definitions reason
      where reason.id = p_reason_id
        and reason.account_id = v_offer.account_id
        and reason.category in ('broker_rejection', 'transfer')
        and reason.is_active
        and (p_notes is not null or not reason.requires_notes)
    )
  ) then
    raise exception 'Informe um motivo válido.' using errcode = '23514';
  end if;

  select * into v_appointment
  from public.appointments
  where id = v_offer.appointment_id
  for update;
  select * into v_policy
  from public.scheduling_policies
  where id = v_appointment.scheduling_policy_id;

  if p_action = 'accept' then
    update public.assignment_offers
    set status = 'accepted',
        responded_at = now(),
        response_notes = p_notes
    where id = v_offer.id
    returning * into v_offer;

    update public.assignment_offers
    set status = 'cancelled'
    where appointment_id = v_offer.appointment_id
      and id <> v_offer.id
      and status = 'pending';

    update public.appointments
    set status = 'broker_confirmed',
        broker_profile_id = v_broker_id,
        broker_confirmed_at = now()
    where id = v_appointment.id;

    update public.opportunities
    set assigned_broker_id = v_broker_id,
        meeting_status = 'confirmed',
        attention_state = 'no_action',
        next_action_at = v_appointment.starts_at
    where id = v_appointment.opportunity_id;

    update public.broker_profiles
    set last_assignment_at = now()
    where id = v_broker_id;
  else
    update public.assignment_offers
    set status =
          case
            when p_action = 'transfer' then 'transferred'
            else 'rejected'
          end,
        responded_at = now(),
        reason_id = p_reason_id,
        response_notes = p_notes
    where id = v_offer.id
    returning * into v_offer;

    select broker.id into v_next_broker_id
    from public.broker_profiles broker
    where broker.account_id = v_offer.account_id
      and broker.is_active
      and broker.whatsapp_verified_at is not null
      and (
        broker.is_available
        or (
          broker.unavailable_until is not null
          and broker.unavailable_until <= v_appointment.starts_at
        )
      )
      and broker.id <> v_broker_id
      and not exists (
        select 1
        from public.assignment_offers previous
        where previous.appointment_id = v_offer.appointment_id
          and previous.broker_profile_id = broker.id
      )
      and exists (
        select 1
        from public.guaranteed_windows company_window
        where company_window.account_id = broker.account_id
          and company_window.broker_profile_id = broker.id
          and company_window.is_active
          and company_window.weekday =
            extract(
              dow
              from v_appointment.starts_at at time zone v_policy.timezone
            )::smallint
          and (
            v_appointment.starts_at at time zone v_policy.timezone
          )::time >= company_window.start_time
          and (
            v_appointment.ends_at at time zone v_policy.timezone
          )::time <= company_window.end_time
      )
      and exists (
        select 1
        from public.broker_availability_rules personal_window
        where personal_window.account_id = broker.account_id
          and personal_window.broker_profile_id = broker.id
          and personal_window.is_active
          and personal_window.weekday =
            extract(
              dow
              from v_appointment.starts_at at time zone v_policy.timezone
            )::smallint
          and (
            v_appointment.starts_at at time zone v_policy.timezone
          )::time >= personal_window.start_time
          and (
            v_appointment.ends_at at time zone v_policy.timezone
          )::time <= personal_window.end_time
      )
      and not exists (
        select 1
        from public.availability_exceptions exception
        where exception.account_id = broker.account_id
          and exception.broker_profile_id = broker.id
          and exception.exception_type = 'blocked'
          and v_appointment.starts_at < exception.ends_at
          and v_appointment.ends_at > exception.starts_at
      )
      and not exists (
        select 1
        from public.appointments conflict
        where conflict.broker_profile_id = broker.id
          and conflict.status in ('reserved', 'broker_confirmed')
          and v_appointment.starts_at <
            conflict.ends_at
            + make_interval(mins => v_policy.buffer_minutes)
          and v_appointment.ends_at
            + make_interval(mins => v_policy.buffer_minutes)
            > conflict.starts_at
      )
    order by
      broker.routing_priority,
      broker.last_assignment_at nulls first,
      broker.id
    limit 1
    for update skip locked;

    if v_next_broker_id is not null then
      select coalesce(max(attempt_order), 0) + 1 into v_next_order
      from public.assignment_offers
      where appointment_id = v_offer.appointment_id;

      insert into public.assignment_offers (
        account_id,
        appointment_id,
        broker_profile_id,
        attempt_order,
        channel,
        expires_at
      ) values (
        v_offer.account_id,
        v_offer.appointment_id,
        v_next_broker_id,
        v_next_order,
        'both',
        least(
          now() + make_interval(mins => v_policy.broker_offer_sla_minutes),
          greatest(
            v_appointment.starts_at,
            now() + interval '1 minute'
          )
        )
      );
    else
      insert into public.attention_items (
        account_id,
        opportunity_id,
        assigned_role,
        kind,
        severity,
        title,
        context,
        due_at,
        deduplication_key
      ) values (
        v_offer.account_id,
        v_appointment.opportunity_id,
        'owner',
        'broker_queue_exhausted',
        'critical',
        'Reunião sem corretor responsável',
        jsonb_build_object('appointment_id', v_appointment.id),
        now(),
        'broker-queue-exhausted:' || v_appointment.id::text
      )
      on conflict do nothing;

      update public.opportunities
      set attention_state = 'owner_attention',
          next_action_at = now()
      where id = v_appointment.opportunity_id;
    end if;
  end if;

  insert into public.appointment_events (
    account_id,
    appointment_id,
    event_type,
    actor_type,
    actor_profile_id,
    source_type,
    idempotency_key,
    payload
  ) values (
    v_offer.account_id,
    v_offer.appointment_id,
    case p_action
      when 'accept' then 'broker_accepted'
      when 'transfer' then 'broker_transfer_requested'
      else 'broker_rejected'
    end,
    'user',
    (
      select broker.profile_id
      from public.broker_profiles broker
      where broker.id = v_broker_id
    ),
    case when v_is_service then 'whatsapp' else 'dashboard' end,
    p_idempotency_key,
    jsonb_build_object(
      'offer_id', v_offer.id,
      'reason_id', p_reason_id,
      'notes', p_notes
    )
  )
  on conflict do nothing;

  return v_offer;
end;
$$;

revoke all on function public.studiosp_respond_assignment_offer(
  uuid, text, uuid, text, uuid, text
) from public, anon;
grant execute on function public.studiosp_respond_assignment_offer(
  uuid, text, uuid, text, uuid, text
) to authenticated, service_role;

comment on table public.broker_availability_rules is
  'Faixas semanais pessoais do corretor, sempre limitadas pelos horários garantidos da empresa.';
comment on column public.broker_profiles.preferred_call_duration_minutes is
  'Duração esperada da conversa; o intervalo global da política é aplicado separadamente.';
