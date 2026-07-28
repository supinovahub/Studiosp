-- Reliability boundary for Pedro's inbound SDR processing.
-- Separates conversation ownership, queue execution and outbound delivery,
-- while keeping every exceptional state actionable by the account owner.

alter table public.conversations
  add column if not exists ai_context_version bigint not null default 1;

alter table public.conversations
  drop constraint if exists conversations_ai_control_mode_check;
alter table public.conversations
  add constraint conversations_ai_control_mode_check check (
    ai_control_mode in (
      'ai_active',
      'human_active',
      'awaiting_guidance',
      'paused',
      'paused_failure',
      'closed'
    )
  );

alter table public.ai_reply_jobs
  add column if not exists context_version bigint not null default 1;

create table if not exists public.ai_response_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  job_id uuid not null references public.ai_reply_jobs(id) on delete cascade,
  trigger_message_id uuid not null references public.messages(id) on delete cascade,
  context_version bigint not null check (context_version > 0),
  response_fingerprint text not null,
  response_text text not null check (length(trim(response_text)) > 0),
  parts jsonb not null check (
    jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) > 0
  ),
  semantic_context jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'sending', 'sent', 'failed', 'ambiguous', 'cancelled')
  ),
  sent_part_count integer not null default 0 check (sent_part_count >= 0),
  provider_message_ids jsonb not null default '[]'::jsonb,
  send_started_at timestamptz,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id)
);

create index if not exists ai_response_outbox_stale_sending_idx
  on public.ai_response_outbox(lease_expires_at)
  where status = 'sending';
create index if not exists ai_response_outbox_conversation_idx
  on public.ai_response_outbox(conversation_id, created_at desc);
create index if not exists ai_response_outbox_account_created_idx
  on public.ai_response_outbox(account_id, created_at desc);
create index if not exists ai_response_outbox_trigger_message_idx
  on public.ai_response_outbox(trigger_message_id);

drop trigger if exists ai_response_outbox_updated_at
  on public.ai_response_outbox;
create trigger ai_response_outbox_updated_at
before update on public.ai_response_outbox
for each row execute function studiosp_private.set_updated_at();

create table if not exists public.ai_incidents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  trigger_message_id uuid references public.messages(id) on delete set null,
  job_id uuid references public.ai_reply_jobs(id) on delete set null,
  outbox_id uuid references public.ai_response_outbox(id) on delete set null,
  reason_code text not null check (reason_code ~ '^[a-z0-9_]+$'),
  severity text not null default 'critical' check (
    severity in ('info', 'warning', 'critical')
  ),
  status text not null default 'open' check (
    status in ('open', 'resolving', 'resolved', 'human_owned')
  ),
  summary text not null check (length(trim(summary)) between 3 and 2000),
  retryable boolean not null default false,
  delivery_state text not null default 'not_started' check (
    delivery_state in (
      'not_started',
      'safe_to_retry',
      'partially_sent',
      'ambiguous',
      'sent'
    )
  ),
  technical_context jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  owner_action text check (
    owner_action is null
    or owner_action in ('guidance', 'retry', 'takeover')
  ),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_incidents_one_open_reason_idx
  on public.ai_incidents(account_id, conversation_id, reason_code)
  where status in ('open', 'resolving');
create index if not exists ai_incidents_account_status_idx
  on public.ai_incidents(account_id, status, last_detected_at desc);
create index if not exists ai_incidents_conversation_idx
  on public.ai_incidents(conversation_id, created_at desc);
create index if not exists ai_incidents_opportunity_idx
  on public.ai_incidents(opportunity_id)
  where opportunity_id is not null;
create index if not exists ai_incidents_trigger_message_idx
  on public.ai_incidents(trigger_message_id)
  where trigger_message_id is not null;
create index if not exists ai_incidents_job_idx
  on public.ai_incidents(job_id)
  where job_id is not null;
create index if not exists ai_incidents_outbox_idx
  on public.ai_incidents(outbox_id)
  where outbox_id is not null;
create index if not exists ai_incidents_owner_profile_idx
  on public.ai_incidents(owner_profile_id)
  where owner_profile_id is not null;

drop trigger if exists ai_incidents_updated_at on public.ai_incidents;
create trigger ai_incidents_updated_at
before update on public.ai_incidents
for each row execute function studiosp_private.set_updated_at();

alter table public.ai_response_outbox enable row level security;
alter table public.ai_incidents enable row level security;

drop policy if exists ai_incidents_owner_read on public.ai_incidents;
create policy ai_incidents_owner_read
on public.ai_incidents for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

revoke all on public.ai_response_outbox, public.ai_incidents
from public, anon, authenticated;
grant select on public.ai_incidents to authenticated;
grant all on public.ai_response_outbox, public.ai_incidents to service_role;

create or replace function public.studiosp_upsert_attention_item(
  p_account_id uuid,
  p_kind text,
  p_severity text,
  p_title text,
  p_deduplication_key text,
  p_opportunity_id uuid default null,
  p_context jsonb default '{}'::jsonb,
  p_due_at timestamptz default now()
)
returns public.attention_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.attention_items;
begin
  insert into public.attention_items (
    account_id,
    opportunity_id,
    assigned_role,
    kind,
    severity,
    status,
    title,
    context,
    due_at,
    deduplication_key
  )
  values (
    p_account_id,
    p_opportunity_id,
    'owner',
    p_kind,
    p_severity,
    'open',
    p_title,
    coalesce(p_context, '{}'::jsonb),
    p_due_at,
    p_deduplication_key
  )
  on conflict (account_id, deduplication_key)
    where deduplication_key is not null
      and status in ('open', 'snoozed')
  do update set
    opportunity_id = coalesce(excluded.opportunity_id, public.attention_items.opportunity_id),
    kind = excluded.kind,
    severity = excluded.severity,
    title = excluded.title,
    context = public.attention_items.context || excluded.context,
    due_at = excluded.due_at,
    status = 'open',
    snoozed_until = null
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.studiosp_open_ai_incident(
  p_account_id uuid,
  p_conversation_id uuid,
  p_reason_code text,
  p_summary text,
  p_retryable boolean,
  p_delivery_state text default 'not_started',
  p_opportunity_id uuid default null,
  p_trigger_message_id uuid default null,
  p_job_id uuid default null,
  p_outbox_id uuid default null,
  p_technical_context jsonb default '{}'::jsonb,
  p_block_conversation boolean default true
)
returns public.ai_incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.ai_incidents;
  v_opportunity_id uuid := p_opportunity_id;
  v_severity text := case when p_block_conversation then 'critical' else 'warning' end;
begin
  if v_opportunity_id is null then
    select o.id into v_opportunity_id
    from public.opportunities o
    where o.account_id = p_account_id
      and o.primary_conversation_id = p_conversation_id
      and o.stage not in ('won', 'lost')
    order by o.created_at desc
    limit 1;
  end if;

  insert into public.ai_incidents (
    account_id,
    conversation_id,
    opportunity_id,
    trigger_message_id,
    job_id,
    outbox_id,
    reason_code,
    severity,
    summary,
    retryable,
    delivery_state,
    technical_context
  )
  values (
    p_account_id,
    p_conversation_id,
    v_opportunity_id,
    p_trigger_message_id,
    p_job_id,
    p_outbox_id,
    p_reason_code,
    v_severity,
    left(trim(p_summary), 2000),
    p_retryable,
    p_delivery_state,
    coalesce(p_technical_context, '{}'::jsonb)
  )
  on conflict (account_id, conversation_id, reason_code)
    where status in ('open', 'resolving')
  do update set
    opportunity_id = coalesce(excluded.opportunity_id, public.ai_incidents.opportunity_id),
    trigger_message_id = coalesce(excluded.trigger_message_id, public.ai_incidents.trigger_message_id),
    job_id = coalesce(excluded.job_id, public.ai_incidents.job_id),
    outbox_id = coalesce(excluded.outbox_id, public.ai_incidents.outbox_id),
    severity = excluded.severity,
    summary = excluded.summary,
    retryable = excluded.retryable,
    delivery_state = excluded.delivery_state,
    technical_context = public.ai_incidents.technical_context || excluded.technical_context,
    last_detected_at = now()
  returning * into v_incident;

  if p_block_conversation then
    update public.conversations
    set ai_control_mode = 'paused_failure',
        ai_control_reason = p_reason_code,
        ai_control_changed_at = now(),
        ai_processing_status = 'failed',
        ai_processing_reason = p_reason_code,
        ai_handoff_summary = left(trim(p_summary), 2000)
    where id = p_conversation_id
      and account_id = p_account_id
      and assigned_agent_id is null
      and ai_control_mode <> 'human_active';
  end if;

  perform public.studiosp_upsert_attention_item(
    p_account_id,
    'ai_operational_failure',
    v_severity,
    case
      when p_delivery_state in ('ambiguous', 'partially_sent')
        then 'Pedro precisa de decisão antes de continuar'
      else 'Falha operacional no atendimento do Pedro'
    end,
    'ai-incident:' || p_conversation_id::text || ':' || p_reason_code,
    v_opportunity_id,
    jsonb_build_object(
      'incident_id', v_incident.id,
      'conversation_id', p_conversation_id,
      'trigger_message_id', p_trigger_message_id,
      'job_id', p_job_id,
      'outbox_id', p_outbox_id,
      'reason_code', p_reason_code,
      'summary', left(trim(p_summary), 1000),
      'retryable', p_retryable,
      'delivery_state', p_delivery_state
    ) || coalesce(p_technical_context, '{}'::jsonb),
    now()
  );

  return v_incident;
end;
$$;

create or replace function public.studiosp_cancel_reactivation_on_inbound(
  p_account_id uuid,
  p_contact_id uuid,
  p_conversation_id uuid,
  p_trigger_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.reactivation_sessions;
  v_cancelled integer := 0;
begin
  select * into v_session
  from public.reactivation_sessions
  where account_id = p_account_id
    and contact_id = p_contact_id
    and conversation_id = p_conversation_id
    and status = 'active'
  order by started_at desc
  limit 1
  for update;

  if not found then
    return 0;
  end if;

  update public.reactivation_touches
  set status = 'cancelled',
      last_error = 'lead_replied',
      claimed_at = null,
      worker_id = null
  where account_id = p_account_id
    and reactivation_lead_id = v_session.reactivation_lead_id
    and status in ('scheduled', 'processing');
  get diagnostics v_cancelled = row_count;

  update public.reactivation_leads
  set status = 'replied'
  where account_id = p_account_id
    and id = v_session.reactivation_lead_id
    and status in ('queued', 'contacted');

  update public.reactivation_sessions
  set status = 'replied',
      replied_at = now(),
      ended_at = now(),
      cooldown_until = null
  where id = v_session.id
    and status = 'active';

  insert into public.reactivation_events (
    account_id,
    campaign_id,
    reactivation_lead_id,
    event_type,
    actor_type,
    payload
  )
  values (
    p_account_id,
    v_session.campaign_id,
    v_session.reactivation_lead_id,
    'lead_replied_cadence_cancelled',
    'lead',
    jsonb_build_object(
      'conversation_id', p_conversation_id,
      'trigger_message_id', p_trigger_message_id,
      'cancelled_touches', v_cancelled
    )
  );

  return v_cancelled;
end;
$$;

create or replace function public.enqueue_ai_reply_job(
  p_account_id uuid,
  p_conversation_id uuid,
  p_contact_id uuid,
  p_trigger_message_id uuid,
  p_config_owner_user_id uuid,
  p_sender_phone text
)
returns public.ai_reply_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_reply_jobs;
  v_context_version bigint;
begin
  select ai_context_version into v_context_version
  from public.conversations
  where id = p_conversation_id and account_id = p_account_id
  for update;

  if not found then
    raise exception 'Conversa não encontrada para enfileirar a resposta.'
      using errcode = 'P0002';
  end if;

  insert into public.ai_reply_jobs (
    account_id,
    conversation_id,
    contact_id,
    trigger_message_id,
    config_owner_user_id,
    sender_phone,
    available_at,
    context_version
  )
  values (
    p_account_id,
    p_conversation_id,
    p_contact_id,
    p_trigger_message_id,
    p_config_owner_user_id,
    p_sender_phone,
    now() + interval '8 seconds',
    v_context_version
  )
  on conflict (account_id, trigger_message_id) do update
    set updated_at = public.ai_reply_jobs.updated_at
  returning * into v_job;

  update public.ai_reply_jobs
  set status = 'skipped',
      completed_at = now(),
      outcome_reason = 'superseded_by_newer_inbound',
      superseded_by_job_id = v_job.id
  where conversation_id = p_conversation_id
    and id <> v_job.id
    and status in ('queued', 'retrying');

  update public.conversations
  set ai_processing_status = case
        when ai_autoreply_disabled then 'paused' else 'queued' end,
      ai_processing_reason = case
        when ai_autoreply_disabled then 'conversation_paused' else null end,
      ai_processing_job_id = v_job.id,
      ai_last_inbound_at = now()
  where id = p_conversation_id and account_id = p_account_id;

  return v_job;
end;
$$;

create or replace function public.claim_ai_reply_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.ai_reply_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_reply_jobs j
  set status = 'retrying',
      available_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      outcome_reason = 'stale_lease_recovered'
  where j.status = 'processing'
    and j.lease_expires_at < now()
    and not exists (
      select 1
      from public.ai_response_outbox o
      where o.job_id = j.id
        and o.status in ('sending', 'sent', 'ambiguous')
    );

  return query
  with due as (
    select j.id
    from public.ai_reply_jobs j
    where j.status in ('queued', 'retrying')
      and j.available_at <= now()
      and not exists (
        select 1
        from public.ai_reply_jobs active
        where active.conversation_id = j.conversation_id
          and active.status = 'processing'
      )
      and not exists (
        select 1
        from public.ai_reply_jobs earlier
        where earlier.conversation_id = j.conversation_id
          and earlier.status in ('queued', 'retrying')
          and earlier.available_at <= now()
          and (earlier.created_at, earlier.id) < (j.created_at, j.id)
      )
    order by j.available_at, j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.ai_reply_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(
        secs => greatest(30, least(coalesce(p_lease_seconds, 120), 600))
      )
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

create or replace function studiosp_private.increment_ai_context_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ai_context_started_at is distinct from old.ai_context_started_at
    and new.ai_control_reason = 'reactivation_started'
  then
    new.ai_context_version := old.ai_context_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_increment_ai_context_version
  on public.conversations;
create trigger conversations_increment_ai_context_version
before update of ai_context_started_at, ai_control_reason
on public.conversations
for each row execute function studiosp_private.increment_ai_context_version();

-- paused_failure must remain a real pause even when another column is updated.
create or replace function studiosp_private.sync_conversation_ai_control()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'closed' then
    new.ai_control_mode := 'closed';
    new.ai_control_reason := coalesce(new.ai_control_reason, 'conversation_closed');
  elsif new.assigned_agent_id is not null
    and (
      old.assigned_agent_id is distinct from new.assigned_agent_id
      or new.ai_control_mode = 'ai_active'
    )
  then
    new.ai_control_mode := 'human_active';
    new.ai_control_reason := coalesce(new.ai_control_reason, 'human_assignment');
  elsif old.assigned_agent_id is not null
    and new.assigned_agent_id is null
    and new.ai_control_mode = old.ai_control_mode
  then
    new.ai_control_mode := 'paused';
    new.ai_control_reason := 'human_released_without_ai_resume';
  end if;

  new.ai_autoreply_disabled :=
    new.ai_control_mode in (
      'human_active',
      'paused',
      'paused_failure',
      'closed'
    );
  if new.ai_control_mode is distinct from old.ai_control_mode
    or new.ai_control_reason is distinct from old.ai_control_reason
  then
    new.ai_control_changed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.studiosp_upsert_attention_item(
  uuid, text, text, text, text, uuid, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.studiosp_open_ai_incident(
  uuid, uuid, text, text, boolean, text, uuid, uuid, uuid, uuid, jsonb, boolean
) from public, anon, authenticated;
revoke all on function public.studiosp_cancel_reactivation_on_inbound(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.studiosp_upsert_attention_item(
  uuid, text, text, text, text, uuid, jsonb, timestamptz
) to service_role;
grant execute on function public.studiosp_open_ai_incident(
  uuid, uuid, text, text, boolean, text, uuid, uuid, uuid, uuid, jsonb, boolean
) to service_role;
grant execute on function public.studiosp_cancel_reactivation_on_inbound(
  uuid, uuid, uuid, uuid
) to service_role;

revoke all on function public.enqueue_ai_reply_job(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.claim_ai_reply_jobs(integer, integer)
from public, anon, authenticated;
grant execute on function public.enqueue_ai_reply_job(
  uuid, uuid, uuid, uuid, uuid, text
) to service_role;
grant execute on function public.claim_ai_reply_jobs(integer, integer)
to service_role;
