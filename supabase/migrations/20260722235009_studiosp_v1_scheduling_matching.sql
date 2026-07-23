-- Studiosp V1: matching auditável, disponibilidade, reservas e distribuição.

create table if not exists public.property_match_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  qualification_snapshot jsonb not null,
  catalog_cutoff_at timestamptz not null default now(),
  algorithm_version text not null default 'studiosp-v1',
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed')
  ),
  minimum_score numeric(5,2) not null default 60 check (minimum_score between 0 and 100),
  result_count integer not null default 0 check (result_count >= 0),
  sanitized_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_match_runs_opportunity_idx
  on public.property_match_runs(opportunity_id, created_at desc, id desc);
create index if not exists property_match_runs_account_id_idx
  on public.property_match_runs(account_id);
create index if not exists property_match_runs_pending_idx
  on public.property_match_runs(status, created_at, id)
  where status in ('queued', 'processing');

create table if not exists public.property_match_results (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  match_run_id uuid not null references public.property_match_runs(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  best_offer_id uuid references public.development_offers(id) on delete set null,
  score numeric(5,2) not null check (score between 0 and 100),
  rank integer not null check (rank > 0),
  score_breakdown jsonb not null default '{}'::jsonb,
  positive_reasons text[] not null default array[]::text[],
  alerts text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  unique (match_run_id, development_id),
  unique (match_run_id, rank)
);

create index if not exists property_match_results_account_id_idx
  on public.property_match_results(account_id);
create index if not exists property_match_results_development_id_idx
  on public.property_match_results(development_id);
create index if not exists property_match_results_best_offer_id_idx
  on public.property_match_results(best_offer_id);
create index if not exists property_match_results_run_rank_idx
  on public.property_match_results(match_run_id, rank);

create table if not exists public.scheduling_policies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  timezone text not null default 'America/Sao_Paulo',
  meeting_duration_minutes integer not null default 10 check (
    meeting_duration_minutes between 5 and 120
  ),
  buffer_minutes integer not null default 5 check (buffer_minutes between 0 and 60),
  minimum_notice_minutes integer not null default 120 check (
    minimum_notice_minutes between 0 and 10080
  ),
  scheduling_horizon_days integer not null default 7 check (
    scheduling_horizon_days between 1 and 90
  ),
  broker_offer_sla_minutes integer not null default 15 check (
    broker_offer_sla_minutes between 1 and 1440
  ),
  broker_reminder_minutes integer not null default 15 check (
    broker_reminder_minutes between 1 and 1440
  ),
  lead_cancellation_cutoff_minutes integer not null default 180 check (
    lead_cancellation_cutoff_minutes between 0 and 10080
  ),
  routing_strategy text not null default 'round_robin' check (
    routing_strategy in ('round_robin', 'priority_round_robin')
  ),
  provisional_slots_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, version),
  unique (id, account_id),
  check ((status = 'active' and published_at is not null) or status <> 'active')
);

create unique index if not exists scheduling_policies_one_active_key
  on public.scheduling_policies(account_id)
  where status = 'active';
create index if not exists scheduling_policies_created_by_idx
  on public.scheduling_policies(created_by);
create index if not exists scheduling_policies_published_by_idx
  on public.scheduling_policies(published_by);

create table if not exists public.guaranteed_windows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  broker_profile_id uuid not null references public.broker_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_interval_minutes integer not null default 15 check (
    slot_interval_minutes between 5 and 240
  ),
  capacity_per_slot integer not null default 1 check (capacity_per_slot between 1 and 20),
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  check (start_time < end_time),
  check (valid_until is null or valid_from is null or valid_from <= valid_until)
);

create index if not exists guaranteed_windows_account_weekday_idx
  on public.guaranteed_windows(account_id, weekday, is_active, start_time);
create index if not exists guaranteed_windows_broker_idx
  on public.guaranteed_windows(broker_profile_id, weekday, is_active, start_time);
create index if not exists guaranteed_windows_created_by_idx
  on public.guaranteed_windows(created_by);

create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  broker_profile_id uuid not null references public.broker_profiles(id) on delete cascade,
  exception_type text not null check (exception_type in ('blocked', 'extra_capacity')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity_delta integer,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (
    (exception_type = 'extra_capacity' and capacity_delta is not null and capacity_delta > 0)
    or (exception_type = 'blocked' and capacity_delta is null)
  )
);

create index if not exists availability_exceptions_account_time_idx
  on public.availability_exceptions(account_id, starts_at, ends_at);
create index if not exists availability_exceptions_broker_time_idx
  on public.availability_exceptions(broker_profile_id, starts_at, ends_at);
create index if not exists availability_exceptions_created_by_idx
  on public.availability_exceptions(created_by);

create table if not exists public.guaranteed_slots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  window_id uuid references public.guaranteed_windows(id) on delete set null,
  broker_profile_id uuid not null references public.broker_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 1 check (capacity between 1 and 20),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  status text not null default 'available' check (
    status in ('available', 'blocked', 'expired')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broker_profile_id, starts_at),
  check (starts_at < ends_at),
  check (reserved_count <= capacity)
);

create index if not exists guaranteed_slots_window_id_idx
  on public.guaranteed_slots(window_id);
create index if not exists guaranteed_slots_account_available_idx
  on public.guaranteed_slots(account_id, starts_at, broker_profile_id)
  where status = 'available' and reserved_count < capacity;
create index if not exists guaranteed_slots_broker_time_idx
  on public.guaranteed_slots(broker_profile_id, starts_at, ends_at);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  scheduling_policy_id uuid not null references public.scheduling_policies(id) on delete restrict,
  slot_id uuid references public.guaranteed_slots(id) on delete restrict,
  broker_profile_id uuid references public.broker_profiles(id) on delete set null,
  status text not null default 'reserved' check (
    status in (
      'reserved', 'broker_confirmed', 'completed', 'no_show', 'cancelled',
      'reschedule_requested', 'rescheduled'
    )
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  channel text not null default 'undefined' check (channel in ('video', 'phone', 'undefined')),
  meeting_url text,
  lead_confirmed_at timestamptz,
  broker_confirmed_at timestamptz,
  calendar_provider text,
  external_calendar_id text,
  cancel_reason_id uuid references public.reason_definitions(id) on delete set null,
  cancel_reason text,
  replaces_appointment_id uuid references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  check (starts_at < ends_at),
  check ((status = 'broker_confirmed' and broker_profile_id is not null) or status <> 'broker_confirmed'),
  check ((status = 'broker_confirmed' and broker_confirmed_at is not null) or status <> 'broker_confirmed'),
  check ((status = 'cancelled' and (cancel_reason_id is not null or cancel_reason is not null)) or status <> 'cancelled')
);

create unique index if not exists appointments_one_active_per_opportunity_key
  on public.appointments(opportunity_id)
  where status in ('reserved', 'broker_confirmed', 'reschedule_requested');
create index if not exists appointments_policy_id_idx
  on public.appointments(scheduling_policy_id);
create index if not exists appointments_slot_id_idx
  on public.appointments(slot_id);
create index if not exists appointments_broker_time_idx
  on public.appointments(account_id, broker_profile_id, starts_at, ends_at);
create index if not exists appointments_account_time_idx
  on public.appointments(account_id, starts_at, status, id);
create index if not exists appointments_cancel_reason_id_idx
  on public.appointments(cancel_reason_id);
create index if not exists appointments_replaces_id_idx
  on public.appointments(replaces_appointment_id);

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null check (length(trim(event_type)) > 0),
  actor_type text not null check (
    actor_type in ('lead', 'ai', 'user', 'system', 'integration')
  ),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  source_type text not null check (
    source_type in ('whatsapp', 'dashboard', 'job', 'webhook', 'migration', 'api')
  ),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists appointment_events_idempotency_key
  on public.appointment_events(account_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists appointment_events_appointment_idx
  on public.appointment_events(appointment_id, occurred_at desc, id desc);
create index if not exists appointment_events_account_id_idx
  on public.appointment_events(account_id);
create index if not exists appointment_events_actor_profile_id_idx
  on public.appointment_events(actor_profile_id);

create table if not exists public.assignment_offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  broker_profile_id uuid not null references public.broker_profiles(id) on delete cascade,
  attempt_order integer not null check (attempt_order > 0),
  channel text not null default 'both' check (channel in ('dashboard', 'whatsapp', 'both')),
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled', 'transferred')
  ),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  reason_id uuid references public.reason_definitions(id) on delete set null,
  response_notes text,
  notification_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, attempt_order),
  check (expires_at > offered_at),
  check (
    (status in ('rejected', 'transferred') and reason_id is not null)
    or status not in ('rejected', 'transferred')
  ),
  check (
    (status in ('accepted', 'rejected', 'transferred') and responded_at is not null)
    or status not in ('accepted', 'rejected', 'transferred')
  )
);

create unique index if not exists assignment_offers_one_pending_per_broker_key
  on public.assignment_offers(appointment_id, broker_profile_id)
  where status = 'pending';
create index if not exists assignment_offers_broker_pending_idx
  on public.assignment_offers(broker_profile_id, expires_at, id)
  where status = 'pending';
create index if not exists assignment_offers_account_pending_idx
  on public.assignment_offers(account_id, expires_at, id)
  where status = 'pending';
create index if not exists assignment_offers_reason_id_idx
  on public.assignment_offers(reason_id);
create index if not exists assignment_offers_message_id_idx
  on public.assignment_offers(notification_message_id);

create table if not exists public.broker_operational_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  broker_profile_id uuid not null references public.broker_profiles(id) on delete cascade,
  whatsapp_config_id uuid not null references public.whatsapp_config(id) on delete cascade,
  remote_chat_id text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, whatsapp_config_id, remote_chat_id)
);

create index if not exists broker_operational_conversations_broker_idx
  on public.broker_operational_conversations(broker_profile_id, status);
create index if not exists broker_operational_conversations_config_idx
  on public.broker_operational_conversations(whatsapp_config_id);

create or replace function studiosp_private.guard_guaranteed_window_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.broker_profile_id::text || ':' || new.weekday::text, 0)
  );

  if new.is_active and exists (
    select 1
    from public.guaranteed_windows existing
    where existing.broker_profile_id = new.broker_profile_id
      and existing.weekday = new.weekday
      and existing.is_active
      and existing.id <> new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
      and coalesce(new.valid_until, 'infinity'::date) >= coalesce(existing.valid_from, '-infinity'::date)
      and coalesce(existing.valid_until, 'infinity'::date) >= coalesce(new.valid_from, '-infinity'::date)
  ) then
    raise exception 'A disponibilidade se sobrepõe a outra janela ativa deste corretor.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function studiosp_private.guard_guaranteed_window_overlap()
  from public, anon, authenticated;

drop trigger if exists guaranteed_windows_no_overlap on public.guaranteed_windows;
create trigger guaranteed_windows_no_overlap
before insert or update on public.guaranteed_windows
for each row execute function studiosp_private.guard_guaranteed_window_overlap();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'property_match_runs', 'property_match_results', 'scheduling_policies',
    'guaranteed_windows', 'availability_exceptions', 'guaranteed_slots',
    'appointments', 'appointment_events', 'assignment_offers',
    'broker_operational_conversations'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

drop trigger if exists property_match_runs_updated_at on public.property_match_runs;
create trigger property_match_runs_updated_at
before update on public.property_match_runs
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists scheduling_policies_updated_at on public.scheduling_policies;
create trigger scheduling_policies_updated_at
before update on public.scheduling_policies
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists guaranteed_windows_updated_at on public.guaranteed_windows;
create trigger guaranteed_windows_updated_at
before update on public.guaranteed_windows
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists availability_exceptions_updated_at on public.availability_exceptions;
create trigger availability_exceptions_updated_at
before update on public.availability_exceptions
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists guaranteed_slots_updated_at on public.guaranteed_slots;
create trigger guaranteed_slots_updated_at
before update on public.guaranteed_slots
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at
before update on public.appointments
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists assignment_offers_updated_at on public.assignment_offers;
create trigger assignment_offers_updated_at
before update on public.assignment_offers
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists broker_operational_conversations_updated_at on public.broker_operational_conversations;
create trigger broker_operational_conversations_updated_at
before update on public.broker_operational_conversations
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists appointment_events_immutable on public.appointment_events;
create trigger appointment_events_immutable
before update or delete on public.appointment_events
for each row execute function studiosp_private.prevent_event_mutation();
