-- Owner-only AI simulator. The CRM entities remain real so qualification and
-- pipeline projections are exercised, while the application route suppresses
-- every external transport.

create table if not exists public.ai_simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null default 'Teste do Pedro',
  status text not null default 'active' check (status in ('active', 'resetting')),
  turn_count integer not null default 0 check (turn_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, owner_user_id),
  unique (conversation_id),
  unique (opportunity_id)
);

create index if not exists ai_simulation_sessions_account_idx
  on public.ai_simulation_sessions(account_id, updated_at desc);

alter table public.ai_simulation_sessions enable row level security;

drop policy if exists ai_simulation_sessions_owner_select on public.ai_simulation_sessions;
create policy ai_simulation_sessions_owner_select
  on public.ai_simulation_sessions for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and (select public.is_account_member(account_id, 'owner'))
  );

drop policy if exists ai_simulation_sessions_owner_insert on public.ai_simulation_sessions;
create policy ai_simulation_sessions_owner_insert
  on public.ai_simulation_sessions for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and (select public.is_account_member(account_id, 'owner'))
  );

drop policy if exists ai_simulation_sessions_owner_update on public.ai_simulation_sessions;
create policy ai_simulation_sessions_owner_update
  on public.ai_simulation_sessions for update to authenticated
  using (
    owner_user_id = (select auth.uid())
    and (select public.is_account_member(account_id, 'owner'))
  )
  with check (
    owner_user_id = (select auth.uid())
    and (select public.is_account_member(account_id, 'owner'))
  );

grant select, insert, update on public.ai_simulation_sessions to authenticated;
revoke all on public.ai_simulation_sessions from anon;

comment on table public.ai_simulation_sessions is
  'Owner-scoped simulator sessions backed by normal CRM records and no external delivery.';

create or replace function public.studiosp_get_or_create_simulation(
  p_account_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.ai_simulation_sessions%rowtype;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_opportunity_id uuid;
begin
  if v_user_id is null or not public.is_account_member(p_account_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  select * into v_session from public.ai_simulation_sessions
    where account_id = p_account_id and owner_user_id = v_user_id;
  if found then return to_jsonb(v_session); end if;

  insert into public.contacts (
    account_id, user_id, name, phone, source_type, source_metadata, originated_at
  ) values (
    p_account_id, v_user_id, 'Lead teste · Simulador',
    'SIM-' || left(p_account_id::text, 8) || '-' || left(v_user_id::text, 8),
    'manual', jsonb_build_object('simulator', true, 'owner_user_id', v_user_id), now()
  ) returning id into v_contact_id;

  insert into public.conversations (
    account_id, user_id, contact_id, status, ai_autoreply_disabled,
    ai_control_mode, ai_context_started_at
  ) values (
    p_account_id, v_user_id, v_contact_id, 'open', false, 'ai_active', now()
  ) returning id into v_conversation_id;

  insert into public.opportunities (
    account_id, contact_id, primary_conversation_id, source_type, source_metadata
  ) values (
    p_account_id, v_contact_id, v_conversation_id, 'manual',
    jsonb_build_object('simulator', true, 'owner_user_id', v_user_id, 'external_effects', false)
  ) returning id into v_opportunity_id;

  insert into public.ai_simulation_sessions (
    account_id, owner_user_id, contact_id, conversation_id, opportunity_id
  ) values (
    p_account_id, v_user_id, v_contact_id, v_conversation_id, v_opportunity_id
  ) returning * into v_session;
  return to_jsonb(v_session);
end;
$$;

create or replace function public.studiosp_reset_simulation(
  p_account_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.ai_simulation_sessions%rowtype;
begin
  if v_user_id is null or not public.is_account_member(p_account_id, 'owner') then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  select * into strict v_session from public.ai_simulation_sessions
    where account_id = p_account_id and owner_user_id = v_user_id for update;

  delete from public.qualification_answers where opportunity_id = v_session.opportunity_id;
  delete from public.property_match_runs where opportunity_id = v_session.opportunity_id;
  delete from public.followup_executions where opportunity_id = v_session.opportunity_id;
  delete from public.messages where conversation_id = v_session.conversation_id;

  update public.opportunities set
    stage = 'received', attention_state = 'no_action',
    qualification_status = 'not_started', meeting_status = 'not_started',
    commercial_status = 'no_proposal', assigned_broker_id = null,
    lead_summary = null, last_lead_message_at = null,
    last_outbound_message_at = null, next_action_at = null,
    stage_changed_at = now(), updated_at = now()
  where id = v_session.opportunity_id and account_id = p_account_id;

  update public.conversations set
    status = 'open', assigned_agent_id = null, last_message_text = null,
    last_message_at = null, unread_count = 0, ai_autoreply_disabled = false,
    ai_reply_count = 0, ai_context_started_at = now(),
    ai_control_mode = 'ai_active', ai_control_reason = null
  where id = v_session.conversation_id and account_id = p_account_id;

  update public.ai_simulation_sessions set
    turn_count = 0, last_error = null, updated_at = now()
  where id = v_session.id returning * into v_session;
  return to_jsonb(v_session);
end;
$$;

revoke all on function public.studiosp_get_or_create_simulation(uuid) from public, anon;
revoke all on function public.studiosp_reset_simulation(uuid) from public, anon;
grant execute on function public.studiosp_get_or_create_simulation(uuid) to authenticated;
grant execute on function public.studiosp_reset_simulation(uuid) to authenticated;
