-- Studiosp V1: identidade operacional, oportunidades, eventos e atenção.
-- Esta migration é expansiva: preserva as tabelas herdadas e introduz o
-- novo modelo sem remover dados ou rotas antigas.

create schema if not exists studiosp_private;
revoke all on schema studiosp_private from public, anon;

alter table public.accounts
  add column if not exists timezone text not null default 'America/Sao_Paulo';

alter table public.contacts
  add column if not exists source_type text not null default 'other',
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists originated_at timestamptz,
  add column if not exists opted_out_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_source_type_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_source_type_check
      check (source_type in ('meta_ads', 'manual', 'referral', 'google_ads', 'other'));
  end if;
end $$;

alter table public.messages add column if not exists account_id uuid;
update public.messages m
set account_id = c.account_id
from public.conversations c
where c.id = m.conversation_id
  and m.account_id is null;
alter table public.messages alter column account_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_account_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_account_id_fkey
      foreign key (account_id) references public.accounts(id) on delete cascade;
  end if;
end $$;

alter table public.messages
  add column if not exists provider_received_at timestamptz,
  add column if not exists author_type text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_author_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_author_type_check
      check (
        author_type is null
        or author_type in ('lead', 'ai', 'broker', 'owner', 'system', 'integration')
      );
  end if;
end $$;

create index if not exists messages_account_id_idx
  on public.messages(account_id);
create unique index if not exists messages_account_provider_id_key
  on public.messages(account_id, message_id)
  where message_id is not null;

create table if not exists public.broker_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  whatsapp_e164 text,
  whatsapp_verified_at timestamptz,
  max_parallel_assignments integer not null default 1
    check (max_parallel_assignments between 1 and 50),
  routing_priority integer not null default 100
    check (routing_priority between 1 and 10000),
  is_available boolean not null default true,
  is_active boolean not null default true,
  unavailable_until timestamptz,
  notification_preferences jsonb not null default '{"dashboard":true,"whatsapp":true}'::jsonb,
  last_assignment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, profile_id),
  unique (id, account_id),
  check (whatsapp_e164 is null or whatsapp_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
  check (whatsapp_verified_at is null or whatsapp_e164 is not null)
);

create unique index if not exists broker_profiles_account_whatsapp_key
  on public.broker_profiles(account_id, whatsapp_e164)
  where whatsapp_e164 is not null;
create index if not exists broker_profiles_account_active_idx
  on public.broker_profiles(account_id, is_active, is_available, routing_priority);
create index if not exists broker_profiles_profile_id_idx
  on public.broker_profiles(profile_id);

create table if not exists public.reason_definitions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  category text not null check (
    category in ('loss', 'broker_rejection', 'transfer', 'appointment_cancellation', 'owner_override')
  ),
  code text not null check (code ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  requires_notes boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, category, code),
  unique (id, account_id)
);

create index if not exists reason_definitions_account_category_idx
  on public.reason_definitions(account_id, category, is_active, display_order);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  primary_conversation_id uuid references public.conversations(id) on delete set null,
  assigned_broker_id uuid references public.broker_profiles(id) on delete set null,
  stage text not null default 'received' check (
    stage in (
      'received', 'contacting', 'qualifying', 'qualified', 'awaiting_schedule',
      'meeting_scheduled', 'meeting_completed', 'proposal_sent', 'negotiating',
      'contract_pending', 'won', 'lost'
    )
  ),
  attention_state text not null default 'no_action' check (
    attention_state in (
      'no_action', 'awaiting_lead', 'followup_scheduled', 'followup_due',
      'awaiting_broker', 'broker_sla_expired', 'owner_attention',
      'human_takeover', 'ai_processing', 'integration_error'
    )
  ),
  qualification_status text not null default 'not_started' check (
    qualification_status in ('not_started', 'in_progress', 'completed', 'needs_review')
  ),
  meeting_status text not null default 'not_started' check (
    meeting_status in (
      'not_started', 'collecting_preference', 'slot_proposed', 'reserved',
      'confirmed', 'completed', 'no_show', 'cancelled', 'reschedule_requested'
    )
  ),
  commercial_status text not null default 'no_proposal' check (
    commercial_status in (
      'no_proposal', 'proposal_sent', 'negotiating', 'contract_sent',
      'awaiting_signature', 'signed', 'won', 'lost'
    )
  ),
  source_type text not null default 'other' check (
    source_type in ('meta_ads', 'manual', 'referral', 'google_ads', 'other')
  ),
  source_metadata jsonb not null default '{}'::jsonb,
  lead_summary text,
  lost_reason_id uuid references public.reason_definitions(id) on delete set null,
  lost_notes text,
  won_gross_value numeric(14,2) check (won_gross_value is null or won_gross_value >= 0),
  currency char(3) not null default 'BRL',
  last_lead_message_at timestamptz,
  last_outbound_message_at timestamptz,
  next_action_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  check (
    (stage in ('won', 'lost') and closed_at is not null)
    or (stage not in ('won', 'lost') and closed_at is null)
  ),
  check (stage <> 'lost' or lost_reason_id is not null)
);

create unique index if not exists opportunities_one_active_per_contact_key
  on public.opportunities(account_id, contact_id)
  where stage not in ('won', 'lost');
create index if not exists opportunities_contact_id_idx
  on public.opportunities(contact_id);
create index if not exists opportunities_primary_conversation_id_idx
  on public.opportunities(primary_conversation_id);
create index if not exists opportunities_assigned_broker_id_idx
  on public.opportunities(assigned_broker_id);
create index if not exists opportunities_lost_reason_id_idx
  on public.opportunities(lost_reason_id);
create index if not exists opportunities_account_stage_idx
  on public.opportunities(account_id, stage, stage_changed_at desc, id desc);
create index if not exists opportunities_broker_stage_idx
  on public.opportunities(account_id, assigned_broker_id, stage, updated_at desc);
create index if not exists opportunities_attention_idx
  on public.opportunities(account_id, attention_state, next_action_at);

create table if not exists public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null check (length(trim(event_type)) > 0),
  from_stage text,
  to_stage text,
  actor_type text not null check (
    actor_type in ('lead', 'ai', 'user', 'system', 'integration')
  ),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  source_type text not null check (
    source_type in ('whatsapp', 'dashboard', 'job', 'webhook', 'migration', 'api')
  ),
  source_id text,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (from_stage is null or from_stage in (
    'received', 'contacting', 'qualifying', 'qualified', 'awaiting_schedule',
    'meeting_scheduled', 'meeting_completed', 'proposal_sent', 'negotiating',
    'contract_pending', 'won', 'lost'
  )),
  check (to_stage is null or to_stage in (
    'received', 'contacting', 'qualifying', 'qualified', 'awaiting_schedule',
    'meeting_scheduled', 'meeting_completed', 'proposal_sent', 'negotiating',
    'contract_pending', 'won', 'lost'
  ))
);

create unique index if not exists opportunity_events_idempotency_key
  on public.opportunity_events(account_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists opportunity_events_opportunity_idx
  on public.opportunity_events(opportunity_id, occurred_at desc, id desc);
create index if not exists opportunity_events_account_idx
  on public.opportunity_events(account_id, occurred_at desc, id desc);
create index if not exists opportunity_events_contact_id_idx
  on public.opportunity_events(contact_id);
create index if not exists opportunity_events_conversation_id_idx
  on public.opportunity_events(conversation_id);
create index if not exists opportunity_events_actor_profile_id_idx
  on public.opportunity_events(actor_profile_id);

create table if not exists public.attention_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  assigned_role text check (assigned_role is null or assigned_role in ('owner', 'admin', 'agent')),
  kind text not null check (length(trim(kind)) > 0),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved', 'cancelled')),
  title text not null check (length(trim(title)) > 0),
  context jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution jsonb,
  deduplication_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved')
  )
);

create unique index if not exists attention_items_open_dedup_key
  on public.attention_items(account_id, deduplication_key)
  where deduplication_key is not null and status in ('open', 'snoozed');
create index if not exists attention_items_opportunity_id_idx
  on public.attention_items(opportunity_id);
create index if not exists attention_items_assigned_profile_id_idx
  on public.attention_items(assigned_profile_id);
create index if not exists attention_items_resolved_by_idx
  on public.attention_items(resolved_by);
create index if not exists attention_items_open_due_idx
  on public.attention_items(account_id, due_at, severity)
  where status in ('open', 'snoozed');

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_type text not null check (
    actor_type in ('ai', 'user', 'system', 'integration')
  ),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id uuid,
  previous_data jsonb,
  next_data jsonb,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists audit_events_actor_profile_id_idx
  on public.audit_events(actor_profile_id);
create index if not exists audit_events_account_created_idx
  on public.audit_events(account_id, created_at desc, id desc);
create index if not exists audit_events_entity_idx
  on public.audit_events(account_id, entity_type, entity_id, created_at desc);

create or replace function studiosp_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function studiosp_private.prevent_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de evento e auditoria são imutáveis.'
    using errcode = '55000';
end;
$$;

revoke all on function studiosp_private.set_updated_at() from public, anon, authenticated;
revoke all on function studiosp_private.prevent_event_mutation() from public, anon, authenticated;

drop trigger if exists broker_profiles_updated_at on public.broker_profiles;
create trigger broker_profiles_updated_at
before update on public.broker_profiles
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists reason_definitions_updated_at on public.reason_definitions;
create trigger reason_definitions_updated_at
before update on public.reason_definitions
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists opportunities_updated_at on public.opportunities;
create trigger opportunities_updated_at
before update on public.opportunities
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists attention_items_updated_at on public.attention_items;
create trigger attention_items_updated_at
before update on public.attention_items
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists opportunity_events_immutable on public.opportunity_events;
create trigger opportunity_events_immutable
before update or delete on public.opportunity_events
for each row execute function studiosp_private.prevent_event_mutation();

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function studiosp_private.prevent_event_mutation();

alter table public.broker_profiles enable row level security;
alter table public.reason_definitions enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_events enable row level security;
alter table public.attention_items enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.broker_profiles, public.reason_definitions,
  public.opportunities, public.opportunity_events, public.attention_items,
  public.audit_events from anon, authenticated;

grant all on public.broker_profiles, public.reason_definitions,
  public.opportunities, public.opportunity_events, public.attention_items,
  public.audit_events to service_role;
