-- Durable and observable AI auto-reply processing.

alter table public.conversations
  add column if not exists ai_processing_status text not null default 'idle',
  add column if not exists ai_processing_reason text,
  add column if not exists ai_processing_job_id uuid,
  add column if not exists ai_last_inbound_at timestamptz,
  add column if not exists ai_last_attempt_at timestamptz,
  add column if not exists ai_last_response_at timestamptz;

alter table public.conversations
  drop constraint if exists conversations_ai_processing_status_check;
alter table public.conversations
  add constraint conversations_ai_processing_status_check check (
    ai_processing_status in (
      'idle', 'queued', 'processing', 'retrying', 'paused', 'handoff', 'failed'
    )
  );

create table if not exists public.ai_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  trigger_message_id uuid not null references public.messages(id) on delete cascade,
  config_owner_user_id uuid not null references auth.users(id) on delete restrict,
  sender_phone text not null,
  status text not null default 'queued' check (
    status in (
      'queued', 'processing', 'retrying', 'completed', 'skipped', 'handoff', 'failed'
    )
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  outcome_reason text,
  last_error text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, trigger_message_id)
);

alter table public.conversations
  drop constraint if exists conversations_ai_processing_job_id_fkey;
alter table public.conversations
  add constraint conversations_ai_processing_job_id_fkey
  foreign key (ai_processing_job_id)
  references public.ai_reply_jobs(id)
  on delete set null;

create table if not exists public.ai_reply_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.ai_reply_jobs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  trigger_message_id uuid not null references public.messages(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (
    status in ('processing', 'completed', 'retrying', 'skipped', 'handoff', 'failed')
  ),
  reason_code text,
  provider text,
  model text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create index if not exists ai_reply_jobs_due_idx
  on public.ai_reply_jobs(available_at, created_at)
  where status in ('queued', 'retrying');
create index if not exists ai_reply_jobs_stale_idx
  on public.ai_reply_jobs(lease_expires_at)
  where status = 'processing';
create index if not exists ai_reply_jobs_conversation_idx
  on public.ai_reply_jobs(conversation_id, created_at desc);
create index if not exists ai_reply_jobs_account_created_idx
  on public.ai_reply_jobs(account_id, created_at desc);
create index if not exists ai_reply_jobs_contact_idx
  on public.ai_reply_jobs(contact_id);
create index if not exists ai_reply_jobs_trigger_message_idx
  on public.ai_reply_jobs(trigger_message_id);
create index if not exists ai_reply_jobs_config_owner_idx
  on public.ai_reply_jobs(config_owner_user_id);
create index if not exists ai_reply_attempts_conversation_idx
  on public.ai_reply_attempts(conversation_id, created_at desc);
create index if not exists ai_reply_attempts_account_created_idx
  on public.ai_reply_attempts(account_id, created_at desc);
create index if not exists ai_reply_attempts_trigger_message_idx
  on public.ai_reply_attempts(trigger_message_id);
create index if not exists conversations_ai_processing_job_idx
  on public.conversations(ai_processing_job_id)
  where ai_processing_job_id is not null;

drop trigger if exists ai_reply_jobs_updated_at on public.ai_reply_jobs;
create trigger ai_reply_jobs_updated_at
before update on public.ai_reply_jobs
for each row execute function studiosp_private.set_updated_at();

alter table public.ai_reply_jobs enable row level security;
alter table public.ai_reply_attempts enable row level security;

drop policy if exists ai_reply_jobs_owner_read on public.ai_reply_jobs;
create policy ai_reply_jobs_owner_read on public.ai_reply_jobs
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists ai_reply_attempts_owner_read on public.ai_reply_attempts;
create policy ai_reply_attempts_owner_read on public.ai_reply_attempts
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

revoke all on public.ai_reply_jobs, public.ai_reply_attempts
from public, anon, authenticated;
grant select on public.ai_reply_jobs, public.ai_reply_attempts to authenticated;
grant all on public.ai_reply_jobs, public.ai_reply_attempts to service_role;

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
begin
  insert into public.ai_reply_jobs (
    account_id,
    conversation_id,
    contact_id,
    trigger_message_id,
    config_owner_user_id,
    sender_phone
  )
  values (
    p_account_id,
    p_conversation_id,
    p_contact_id,
    p_trigger_message_id,
    p_config_owner_user_id,
    p_sender_phone
  )
  on conflict (account_id, trigger_message_id) do update
    set updated_at = public.ai_reply_jobs.updated_at
  returning * into v_job;

  update public.conversations
  set ai_processing_status = case
        when ai_autoreply_disabled then 'paused'
        else 'queued'
      end,
      ai_processing_reason = case
        when ai_autoreply_disabled then 'conversation_paused'
        else null
      end,
      ai_processing_job_id = v_job.id,
      ai_last_inbound_at = now()
  where id = p_conversation_id
    and account_id = p_account_id;

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
  update public.ai_reply_jobs
  set status = 'retrying',
      available_at = now(),
      claimed_at = null,
      lease_expires_at = null,
      outcome_reason = 'stale_lease_recovered'
  where status = 'processing'
    and lease_expires_at < now();

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

revoke all on function public.enqueue_ai_reply_job(uuid, uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.claim_ai_reply_jobs(integer, integer)
from public, anon, authenticated;
grant execute on function public.enqueue_ai_reply_job(uuid, uuid, uuid, uuid, uuid, text)
to service_role;
grant execute on function public.claim_ai_reply_jobs(integer, integer)
to service_role;

-- Three turns cannot complete the Studiosp qualification. Existing explicit
-- higher limits are preserved; legacy/default low limits become 30 per session.
alter table public.ai_configs
  drop constraint if exists ai_configs_auto_reply_max_per_conversation_check;
alter table public.ai_configs
  alter column auto_reply_max_per_conversation set default 30;
update public.ai_configs
set auto_reply_max_per_conversation = 30
where auto_reply_max_per_conversation < 10;
alter table public.ai_configs
  add constraint ai_configs_auto_reply_max_per_conversation_check check (
    auto_reply_max_per_conversation between 10 and 50
  );
