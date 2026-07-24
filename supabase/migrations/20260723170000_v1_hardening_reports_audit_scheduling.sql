-- V1 hardening: server-side report aggregation, complete availability audit,
-- and database-enforced broker scheduling concurrency.

create extension if not exists btree_gist with schema extensions;

create or replace function public.studiosp_report_summary(
  p_date_from date default null,
  p_date_to date default null,
  p_broker_id uuid default null,
  p_source_type text default null,
  p_development_id uuid default null,
  p_stage text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  with caller as (
    select p.account_id
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.account_role in ('owner', 'admin')
    limit 1
  ),
  filtered as (
    select o.*
    from public.opportunities o
    join caller c on c.account_id = o.account_id
    where (p_date_from is null or o.created_at >= p_date_from::timestamptz)
      and (p_date_to is null or o.created_at < (p_date_to + 1)::timestamptz)
      and (p_broker_id is null or o.assigned_broker_id = p_broker_id)
      and (p_source_type is null or o.source_type = p_source_type)
      and (p_stage is null or o.stage = p_stage)
      and (
        p_development_id is null
        or exists (
          select 1
          from public.property_match_results pmr
          join public.property_match_runs pmrun on pmrun.id = pmr.match_run_id
          where pmrun.opportunity_id = o.id
            and pmr.development_id = p_development_id
        )
      )
  ),
  lead_rows as (
    select jsonb_build_object(
      'id', o.id,
      'stage', o.stage,
      'source_type', o.source_type,
      'won_gross_value', o.won_gross_value,
      'created_at', o.created_at,
      'contact', jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email
      ),
      'broker', case when bp.id is null then null else jsonb_build_object(
        'id', bp.id, 'display_name', bp.display_name
      ) end
    ) as value
    from filtered o
    join public.contacts c on c.id = o.contact_id
    left join public.broker_profiles bp on bp.id = o.assigned_broker_id
    order by o.created_at desc
  ),
  stage_counts as (
    select coalesce(jsonb_agg(jsonb_build_object('key', stage, 'count', total)), '[]'::jsonb) value
    from (select stage, count(*) total from filtered group by stage order by stage) grouped
  ),
  source_counts as (
    select coalesce(jsonb_agg(jsonb_build_object('key', source_type, 'count', total)), '[]'::jsonb) value
    from (select source_type, count(*) total from filtered group by source_type order by source_type) grouped
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'leads_received', (select count(*) from filtered),
      'active_opportunities', (select count(*) from filtered where stage not in ('won', 'lost')),
      'meetings_completed', (
        select count(distinct oe.opportunity_id)
        from public.opportunity_events oe
        join filtered f on f.id = oe.opportunity_id
        where oe.event_type = 'meeting_completed'
      ),
      'confirmed_revenue', coalesce((select sum(won_gross_value) from filtered where stage = 'won'), 0),
      'won_count', (select count(*) from filtered where stage = 'won')
    ),
    'stages', (select value from stage_counts),
    'sources', (select value from source_counts),
    'leads', coalesce((select jsonb_agg(value) from lead_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.studiosp_report_summary(date, date, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.studiosp_report_summary(date, date, uuid, text, uuid, text)
  to authenticated;

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
  v_previous public.broker_profiles;
  v_profile public.broker_profiles;
begin
  select bp.* into v_previous
  from public.broker_profiles bp
  join public.profiles p on p.id = bp.profile_id
  where p.user_id = (select auth.uid())
    and bp.is_active
  for update;

  if not found then
    raise exception 'Perfil de corretor não encontrado.' using errcode = 'P0002';
  end if;
  if p_is_available and p_unavailable_until is not null then
    raise exception 'Um corretor disponível não pode ter bloqueio futuro.' using errcode = '23514';
  end if;

  update public.broker_profiles
  set is_available = p_is_available,
      unavailable_until = case when p_is_available then null else p_unavailable_until end
  where id = v_previous.id
  returning * into v_profile;

  insert into public.audit_events (
    account_id, actor_type, actor_profile_id, action, entity_type,
    entity_id, previous_data, next_data
  ) values (
    v_profile.account_id, 'user', v_profile.profile_id,
    'broker_availability_changed', 'broker_profile', v_profile.id,
    jsonb_build_object(
      'is_available', v_previous.is_available,
      'unavailable_until', v_previous.unavailable_until
    ),
    jsonb_build_object(
      'is_available', v_profile.is_available,
      'unavailable_until', v_profile.unavailable_until
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.studiosp_set_broker_availability(boolean, timestamptz)
  from public, anon;
grant execute on function public.studiosp_set_broker_availability(boolean, timestamptz)
  to authenticated;

alter table public.appointments
  add constraint appointments_no_broker_overlap
  exclude using gist (
    broker_profile_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    broker_profile_id is not null
    and status in ('reserved', 'broker_confirmed', 'reschedule_requested')
  );

