-- Pedro autonomy and operational recovery.
--
-- The migration keeps the audit trail append-only while presenting one
-- actionable case per conversation to the owner. Owner retries are new queue
-- generations, never rewrites of previous attempts.

alter table public.ai_reply_jobs
  add column if not exists retry_generation integer not null default 0
    check (retry_generation >= 0),
  add column if not exists retry_of_job_id uuid
    references public.ai_reply_jobs(id) on delete set null;

alter table public.ai_reply_jobs
  drop constraint if exists ai_reply_jobs_account_id_trigger_message_id_key;

create unique index if not exists ai_reply_jobs_trigger_generation_idx
  on public.ai_reply_jobs(account_id, trigger_message_id, retry_generation);
create index if not exists ai_reply_jobs_retry_of_idx
  on public.ai_reply_jobs(retry_of_job_id)
  where retry_of_job_id is not null;

alter table public.ai_incidents
  add column if not exists occurrence_count integer not null default 1
    check (occurrence_count > 0);

alter table public.ai_incidents
  drop constraint if exists ai_incidents_owner_action_check;
alter table public.ai_incidents
  add constraint ai_incidents_owner_action_check check (
    owner_action is null
    or owner_action in (
      'guidance',
      'retry',
      'continue',
      'takeover',
      'pause',
      'archive',
      'dismiss'
    )
  );

create table if not exists public.ai_incident_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  incident_id uuid not null references public.ai_incidents(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z0-9_]+$'),
  reason_code text not null check (reason_code ~ '^[a-z0-9_]+$'),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  summary text not null check (length(trim(summary)) between 3 and 2000),
  delivery_state text not null check (
    delivery_state in (
      'not_started',
      'safe_to_retry',
      'partially_sent',
      'ambiguous',
      'sent'
    )
  ),
  technical_context jsonb not null default '{}'::jsonb,
  job_id uuid references public.ai_reply_jobs(id) on delete set null,
  trigger_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_incident_events_incident_created_idx
  on public.ai_incident_events(incident_id, created_at desc);
create index if not exists ai_incident_events_account_created_idx
  on public.ai_incident_events(account_id, created_at desc);
create index if not exists ai_incident_events_conversation_created_idx
  on public.ai_incident_events(conversation_id, created_at desc);

alter table public.ai_incident_events enable row level security;
drop policy if exists ai_incident_events_owner_read
  on public.ai_incident_events;
create policy ai_incident_events_owner_read
on public.ai_incident_events for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

revoke all on public.ai_incident_events from public, anon, authenticated;
grant select on public.ai_incident_events to authenticated;
grant all on public.ai_incident_events to service_role;

-- Preserve every legacy incident as an event before consolidating the
-- operational view.
insert into public.ai_incident_events (
  account_id,
  incident_id,
  conversation_id,
  event_type,
  reason_code,
  severity,
  summary,
  delivery_state,
  technical_context,
  job_id,
  trigger_message_id,
  created_at
)
select
  i.account_id,
  i.id,
  i.conversation_id,
  'detected',
  i.reason_code,
  i.severity,
  i.summary,
  i.delivery_state,
  i.technical_context,
  i.job_id,
  i.trigger_message_id,
  i.first_detected_at
from public.ai_incidents i
where not exists (
  select 1
  from public.ai_incident_events e
  where e.incident_id = i.id
);

-- Keep the newest active incident as the visible case and close older
-- duplicates without deleting their audit rows.
with ranked as (
  select
    id,
    row_number() over (
      partition by account_id, conversation_id
      order by
        case severity when 'critical' then 0 when 'warning' then 1 else 2 end,
        last_detected_at desc,
        id
    ) as position
  from public.ai_incidents
  where status in ('open', 'resolving')
)
update public.ai_incidents i
set
  status = 'resolved',
  resolved_at = coalesce(i.resolved_at, now()),
  owner_action = coalesce(i.owner_action, 'archive')
from ranked r
where i.id = r.id
  and r.position > 1;

drop index if exists public.ai_incidents_one_open_reason_idx;
create unique index if not exists ai_incidents_one_active_conversation_idx
  on public.ai_incidents(account_id, conversation_id)
  where status in ('open', 'resolving');

-- Collapse legacy AI attention cards into one visible item per conversation.
with ranked as (
  select
    id,
    row_number() over (
      partition by account_id, context->>'conversation_id'
      order by
        case severity when 'critical' then 0 when 'warning' then 1 else 2 end,
        updated_at desc,
        id
    ) as position
  from public.attention_items
  where status in ('open', 'snoozed')
    and kind in (
      'ai_needs_guidance',
      'ai_operational_failure',
      'ai_partial_reply'
    )
    and coalesce(context->>'conversation_id', '') <> ''
)
update public.attention_items a
set
  status = 'resolved',
  resolved_at = coalesce(a.resolved_at, now()),
  resolution = coalesce(a.resolution, '{}'::jsonb)
    || '{"outcome":"legacy_case_consolidated"}'::jsonb
from ranked r
where a.id = r.id
  and r.position > 1;

update public.attention_items
set deduplication_key = 'ai-case:' || (context->>'conversation_id')
where status in ('open', 'snoozed')
  and kind in (
    'ai_needs_guidance',
    'ai_operational_failure',
    'ai_partial_reply'
  )
  and coalesce(context->>'conversation_id', '') <> '';

create table if not exists public.ai_account_rate_windows (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  used_slots integer not null default 0 check (used_slots >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_account_rate_windows enable row level security;
revoke all on public.ai_account_rate_windows from public, anon, authenticated;
grant all on public.ai_account_rate_windows to service_role;

create or replace function public.studiosp_claim_ai_account_rate_slot(
  p_account_id uuid,
  p_limit integer default 40,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  insert into public.ai_account_rate_windows (
    account_id,
    window_started_at,
    used_slots,
    updated_at
  )
  values (p_account_id, now(), 1, now())
  on conflict (account_id) do update set
    window_started_at = case
      when public.ai_account_rate_windows.window_started_at
        <= now() - make_interval(
          secs => greatest(1, least(coalesce(p_window_seconds, 60), 3600))
        )
      then now()
      else public.ai_account_rate_windows.window_started_at
    end,
    used_slots = case
      when public.ai_account_rate_windows.window_started_at
        <= now() - make_interval(
          secs => greatest(1, least(coalesce(p_window_seconds, 60), 3600))
        )
      then 1
      else public.ai_account_rate_windows.used_slots + 1
    end,
    updated_at = now()
  where public.ai_account_rate_windows.window_started_at
      <= now() - make_interval(
        secs => greatest(1, least(coalesce(p_window_seconds, 60), 3600))
      )
    or public.ai_account_rate_windows.used_slots
      < greatest(1, least(coalesce(p_limit, 40), 1000))
  returning true into v_claimed;

  return coalesce(v_claimed, false);
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
    context_version,
    retry_generation
  )
  values (
    p_account_id,
    p_conversation_id,
    p_contact_id,
    p_trigger_message_id,
    p_config_owner_user_id,
    p_sender_phone,
    now() + interval '8 seconds',
    v_context_version,
    0
  )
  on conflict (account_id, trigger_message_id, retry_generation) do update
    set updated_at = public.ai_reply_jobs.updated_at
  returning * into v_job;

  update public.ai_reply_jobs
  set
    status = 'skipped',
    completed_at = now(),
    outcome_reason = 'superseded_by_newer_inbound',
    superseded_by_job_id = v_job.id
  where conversation_id = p_conversation_id
    and id <> v_job.id
    and status in ('queued', 'retrying');

  update public.conversations
  set
    ai_processing_status = case
      when ai_autoreply_disabled then 'paused' else 'queued' end,
    ai_processing_reason = case
      when ai_autoreply_disabled then 'conversation_paused' else null end,
    ai_processing_job_id = v_job.id,
    ai_last_inbound_at = now()
  where id = p_conversation_id and account_id = p_account_id;

  return v_job;
end;
$$;

create or replace function public.studiosp_enqueue_ai_owner_retry(
  p_account_id uuid,
  p_conversation_id uuid,
  p_reason text default 'owner_continue'
)
returns public.ai_reply_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_trigger public.messages;
  v_previous public.ai_reply_jobs;
  v_active public.ai_reply_jobs;
  v_job public.ai_reply_jobs;
  v_contact_phone text;
  v_outbox_state text;
  v_generation integer;
begin
  select * into v_conversation
  from public.conversations
  where id = p_conversation_id and account_id = p_account_id
  for update;
  if not found then
    raise exception 'Conversa não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_trigger
  from public.messages
  where account_id = p_account_id
    and conversation_id = p_conversation_id
    and sender_type = 'customer'
  order by created_at desc, id desc
  limit 1;
  if not found then
    raise exception 'Não há mensagem do lead para retomar.'
      using errcode = 'P0002';
  end if;

  select * into v_active
  from public.ai_reply_jobs
  where account_id = p_account_id
    and trigger_message_id = v_trigger.id
    and status in ('queued', 'retrying', 'processing')
  order by retry_generation desc
  limit 1;
  if found then
    return v_active;
  end if;

  select * into v_previous
  from public.ai_reply_jobs
  where account_id = p_account_id
    and trigger_message_id = v_trigger.id
  order by retry_generation desc, created_at desc
  limit 1;

  select o.status into v_outbox_state
  from public.ai_response_outbox o
  join public.ai_reply_jobs j on j.id = o.job_id
  where j.account_id = p_account_id
    and j.trigger_message_id = v_trigger.id
    and o.status in ('sent', 'sending', 'ambiguous')
  order by o.created_at desc
  limit 1;
  if v_outbox_state = 'sent' then
    raise exception
      'Esta resposta já foi enviada. Abra a conversa antes de iniciar uma nova ação.'
      using errcode = 'P0001';
  end if;
  if v_outbox_state in ('sending', 'ambiguous') then
    raise exception
      'O envio anterior ainda precisa de conferência antes de continuar.'
      using errcode = 'P0001';
  end if;

  select phone into v_contact_phone
  from public.contacts
  where id = v_conversation.contact_id and account_id = p_account_id;

  v_generation := coalesce(v_previous.retry_generation, -1) + 1;
  insert into public.ai_reply_jobs (
    account_id,
    conversation_id,
    contact_id,
    trigger_message_id,
    config_owner_user_id,
    sender_phone,
    status,
    available_at,
    context_version,
    retry_generation,
    retry_of_job_id,
    max_attempts,
    outcome_reason
  )
  values (
    p_account_id,
    p_conversation_id,
    v_conversation.contact_id,
    v_trigger.id,
    v_conversation.user_id,
    coalesce(v_contact_phone, ''),
    'queued',
    now(),
    v_conversation.ai_context_version,
    v_generation,
    v_previous.id,
    coalesce(v_previous.max_attempts, 3),
    case
      when p_reason in ('owner_guidance', 'owner_retry', 'owner_continue')
        then p_reason
      else 'owner_continue'
    end
  )
  returning * into v_job;

  update public.conversations
  set
    assigned_agent_id = null,
    ai_autoreply_disabled = false,
    ai_control_mode = 'ai_active',
    ai_control_reason = null,
    ai_control_changed_at = now(),
    ai_processing_status = 'queued',
    ai_processing_reason = coalesce(p_reason, 'owner_continue'),
    ai_processing_job_id = v_job.id
  where id = p_conversation_id and account_id = p_account_id;

  return v_job;
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
  on conflict (account_id, conversation_id)
    where status in ('open', 'resolving')
  do update set
    opportunity_id = coalesce(excluded.opportunity_id, public.ai_incidents.opportunity_id),
    trigger_message_id = coalesce(excluded.trigger_message_id, public.ai_incidents.trigger_message_id),
    job_id = coalesce(excluded.job_id, public.ai_incidents.job_id),
    outbox_id = coalesce(excluded.outbox_id, public.ai_incidents.outbox_id),
    reason_code = excluded.reason_code,
    severity = case
      when public.ai_incidents.severity = 'critical' then 'critical'
      else excluded.severity
    end,
    summary = excluded.summary,
    retryable = excluded.retryable,
    delivery_state = excluded.delivery_state,
    technical_context = public.ai_incidents.technical_context || excluded.technical_context,
    occurrence_count = public.ai_incidents.occurrence_count + 1,
    last_detected_at = now(),
    status = 'open'
  returning * into v_incident;

  insert into public.ai_incident_events (
    account_id,
    incident_id,
    conversation_id,
    event_type,
    reason_code,
    severity,
    summary,
    delivery_state,
    technical_context,
    job_id,
    trigger_message_id
  )
  values (
    p_account_id,
    v_incident.id,
    p_conversation_id,
    'detected',
    p_reason_code,
    v_severity,
    left(trim(p_summary), 2000),
    p_delivery_state,
    coalesce(p_technical_context, '{}'::jsonb),
    p_job_id,
    p_trigger_message_id
  );

  if p_block_conversation then
    update public.conversations
    set
      ai_control_mode = 'paused_failure',
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
    case
      when p_delivery_state in ('ambiguous', 'partially_sent')
        then 'ai_partial_reply'
      else 'ai_operational_failure'
    end,
    v_incident.severity,
    case
      when p_delivery_state in ('ambiguous', 'partially_sent')
        then 'Pedro precisa de decisão antes de continuar'
      when p_block_conversation
        then 'Pedro precisa de uma decisão nesta conversa'
      else 'O atendimento do Pedro está demorando'
    end,
    'ai-case:' || p_conversation_id::text,
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
      'delivery_state', p_delivery_state,
      'occurrence_count', v_incident.occurrence_count
    ) || coalesce(p_technical_context, '{}'::jsonb),
    now()
  );

  return v_incident;
end;
$$;

create or replace function public.studiosp_reconcile_stale_reactivation_sessions(
  p_account_id uuid,
  p_contact_id uuid default null,
  p_campaign_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    select s.id
    from public.reactivation_sessions s
    join public.reactivation_campaigns c on c.id = s.campaign_id
    where s.account_id = p_account_id
      and s.status = 'active'
      and (p_contact_id is null or s.contact_id = p_contact_id)
      and (p_campaign_id is null or s.campaign_id = p_campaign_id)
      and (
        c.status in ('completed', 'cancelled', 'archived')
        or c.archived_at is not null
      )
    for update of s
  )
  update public.reactivation_sessions s
  set
    status = 'cancelled',
    ended_at = coalesce(s.ended_at, now()),
    cooldown_until = null
  from stale
  where s.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.studiosp_claim_ai_account_rate_slot(
  uuid, integer, integer
) from public, anon, authenticated;
revoke all on function public.studiosp_enqueue_ai_owner_retry(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.studiosp_reconcile_stale_reactivation_sessions(
  uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.studiosp_claim_ai_account_rate_slot(
  uuid, integer, integer
) to service_role;
grant execute on function public.studiosp_enqueue_ai_owner_retry(
  uuid, uuid, text
) to service_role;
grant execute on function public.studiosp_reconcile_stale_reactivation_sessions(
  uuid, uuid, uuid
) to service_role;

revoke all on function public.enqueue_ai_reply_job(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.enqueue_ai_reply_job(
  uuid, uuid, uuid, uuid, uuid, text
) to service_role;

revoke all on function public.studiosp_open_ai_incident(
  uuid, uuid, text, text, boolean, text, uuid, uuid, uuid, uuid, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.studiosp_open_ai_incident(
  uuid, uuid, text, text, boolean, text, uuid, uuid, uuid, uuid, jsonb, boolean
) to service_role;
