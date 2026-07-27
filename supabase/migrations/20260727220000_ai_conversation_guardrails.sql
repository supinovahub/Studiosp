-- Conversational idempotency and one active reactivation per contact.

alter table public.conversations
  add column if not exists ai_last_response_fingerprint text,
  add column if not exists ai_last_response_fingerprint_at timestamptz;

alter table public.ai_reply_jobs
  add column if not exists superseded_by_job_id uuid
    references public.ai_reply_jobs(id) on delete set null;

create index if not exists ai_reply_jobs_superseded_by_idx
  on public.ai_reply_jobs(superseded_by_job_id)
  where superseded_by_job_id is not null;

create table if not exists public.reactivation_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  campaign_id uuid not null references public.reactivation_campaigns(id) on delete cascade,
  reactivation_lead_id uuid not null references public.reactivation_leads(id) on delete cascade,
  status text not null default 'active' check (
    status in ('active', 'replied', 'cancelled', 'completed', 'opted_out')
  ),
  known_context jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  replied_at timestamptz,
  ended_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reactivation_sessions_one_active_contact_idx
  on public.reactivation_sessions(account_id, contact_id)
  where status = 'active';
create index if not exists reactivation_sessions_conversation_idx
  on public.reactivation_sessions(conversation_id, created_at desc);
create index if not exists reactivation_sessions_campaign_idx
  on public.reactivation_sessions(campaign_id);
create index if not exists reactivation_sessions_lead_idx
  on public.reactivation_sessions(reactivation_lead_id);
create index if not exists reactivation_sessions_opportunity_idx
  on public.reactivation_sessions(opportunity_id);

drop trigger if exists reactivation_sessions_updated_at
  on public.reactivation_sessions;
create trigger reactivation_sessions_updated_at
before update on public.reactivation_sessions
for each row execute function studiosp_private.set_updated_at();

alter table public.reactivation_sessions enable row level security;
drop policy if exists reactivation_sessions_owner_read
  on public.reactivation_sessions;
create policy reactivation_sessions_owner_read
on public.reactivation_sessions for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

revoke all on public.reactivation_sessions from public, anon, authenticated;
grant select on public.reactivation_sessions to authenticated;
grant all on public.reactivation_sessions to service_role;

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
    account_id, conversation_id, contact_id, trigger_message_id,
    config_owner_user_id, sender_phone, available_at
  )
  values (
    p_account_id, p_conversation_id, p_contact_id, p_trigger_message_id,
    p_config_owner_user_id, p_sender_phone, now() + interval '8 seconds'
  )
  on conflict (account_id, trigger_message_id) do update
    set updated_at = public.ai_reply_jobs.updated_at
  returning * into v_job;

  -- A burst is one conversational turn. Preserve every job for audit, but
  -- only the latest inbound may produce an outbound reply.
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

create or replace function public.claim_ai_response_fingerprint(
  p_account_id uuid,
  p_conversation_id uuid,
  p_fingerprint text,
  p_window_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.conversations
  set ai_last_response_fingerprint = p_fingerprint,
      ai_last_response_fingerprint_at = now()
  where id = p_conversation_id
    and account_id = p_account_id
    and (
      ai_last_response_fingerprint is distinct from p_fingerprint
      or ai_last_response_fingerprint_at is null
      or ai_last_response_fingerprint_at <
        now() - make_interval(secs => greatest(30, least(p_window_seconds, 3600)))
    );
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.claim_ai_response_fingerprint(uuid, uuid, text, integer)
from public, anon, authenticated;
grant execute on function public.claim_ai_response_fingerprint(uuid, uuid, text, integer)
to service_role;

revoke all on function public.enqueue_ai_reply_job(uuid, uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.enqueue_ai_reply_job(uuid, uuid, uuid, uuid, uuid, text)
to service_role;
