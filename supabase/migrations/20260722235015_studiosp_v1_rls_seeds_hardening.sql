-- Studiosp V1: identidade de acesso, RLS, operações atômicas, seeds e backfill.

create or replace function studiosp_private.current_profile_id(p_account_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.account_id = p_account_id
    and p.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function studiosp_private.current_broker_id(p_account_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select bp.id
  from public.broker_profiles bp
  join public.profiles p on p.id = bp.profile_id
  where bp.account_id = p_account_id
    and p.account_id = p_account_id
    and p.user_id = (select auth.uid())
    and bp.is_active
  limit 1;
$$;

create or replace function studiosp_private.is_account_admin(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.account_id = p_account_id
      and p.user_id = (select auth.uid())
      and p.account_role in ('owner', 'admin')
  );
$$;

create or replace function studiosp_private.is_account_owner(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.account_id = p_account_id
      and p.user_id = (select auth.uid())
      and p.account_role = 'owner'
  );
$$;

create or replace function studiosp_private.is_account_member(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.account_id = p_account_id
      and p.user_id = (select auth.uid())
  );
$$;

create or replace function studiosp_private.can_access_opportunity(
  p_account_id uuid,
  p_opportunity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    studiosp_private.is_account_admin(p_account_id)
    or exists (
      select 1
      from public.opportunities o
      where o.id = p_opportunity_id
        and o.account_id = p_account_id
        and o.assigned_broker_id = studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_access_appointment(
  p_account_id uuid,
  p_appointment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    studiosp_private.is_account_admin(p_account_id)
    or exists (
      select 1
      from public.appointments a
      where a.id = p_appointment_id
        and a.account_id = p_account_id
        and a.broker_profile_id = studiosp_private.current_broker_id(p_account_id)
    )
    or exists (
      select 1
      from public.assignment_offers ao
      where ao.appointment_id = p_appointment_id
        and ao.account_id = p_account_id
        and ao.broker_profile_id = studiosp_private.current_broker_id(p_account_id)
        and ao.status = 'pending'
    );
$$;

create or replace function studiosp_private.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function studiosp_private.current_profile_id(uuid) from public, anon;
revoke all on function studiosp_private.current_broker_id(uuid) from public, anon;
revoke all on function studiosp_private.is_account_admin(uuid) from public, anon;
revoke all on function studiosp_private.is_account_owner(uuid) from public, anon;
revoke all on function studiosp_private.is_account_member(uuid) from public, anon;
revoke all on function studiosp_private.can_access_opportunity(uuid, uuid) from public, anon;
revoke all on function studiosp_private.can_access_appointment(uuid, uuid) from public, anon;
revoke all on function studiosp_private.safe_uuid(text) from public, anon;

grant usage on schema studiosp_private to authenticated, service_role;
grant execute on function studiosp_private.current_profile_id(uuid) to authenticated, service_role;
grant execute on function studiosp_private.current_broker_id(uuid) to authenticated, service_role;
grant execute on function studiosp_private.is_account_admin(uuid) to authenticated, service_role;
grant execute on function studiosp_private.is_account_owner(uuid) to authenticated, service_role;
grant execute on function studiosp_private.is_account_member(uuid) to authenticated, service_role;
grant execute on function studiosp_private.can_access_opportunity(uuid, uuid) to authenticated, service_role;
grant execute on function studiosp_private.can_access_appointment(uuid, uuid) to authenticated, service_role;
grant execute on function studiosp_private.safe_uuid(text) to authenticated, service_role;

-- Reforça vínculos compostos usados nas fronteiras mais sensíveis.
create unique index if not exists profiles_id_account_id_key
  on public.profiles(id, account_id);
create unique index if not exists contacts_id_account_id_key
  on public.contacts(id, account_id);
create unique index if not exists conversations_id_account_id_key
  on public.conversations(id, account_id);
create unique index if not exists messages_id_account_id_key
  on public.messages(id, account_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'broker_profiles_profile_account_fkey') then
    alter table public.broker_profiles
      add constraint broker_profiles_profile_account_fkey
      foreign key (profile_id, account_id) references public.profiles(id, account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_contact_account_fkey') then
    alter table public.opportunities
      add constraint opportunities_contact_account_fkey
      foreign key (contact_id, account_id) references public.contacts(id, account_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_conversation_account_fkey') then
    alter table public.opportunities
      add constraint opportunities_conversation_account_fkey
      foreign key (primary_conversation_id, account_id) references public.conversations(id, account_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_broker_account_fkey') then
    alter table public.opportunities
      add constraint opportunities_broker_account_fkey
      foreign key (assigned_broker_id, account_id) references public.broker_profiles(id, account_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_reason_account_fkey') then
    alter table public.opportunities
      add constraint opportunities_reason_account_fkey
      foreign key (lost_reason_id, account_id) references public.reason_definitions(id, account_id);
  end if;
end $$;

-- Políticas do núcleo operacional.
drop policy if exists broker_profiles_read on public.broker_profiles;
create policy broker_profiles_read on public.broker_profiles
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));
drop policy if exists broker_profiles_admin_insert on public.broker_profiles;
create policy broker_profiles_admin_insert on public.broker_profiles
for insert to authenticated
with check ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists broker_profiles_admin_update on public.broker_profiles;
create policy broker_profiles_admin_update on public.broker_profiles
for update to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists broker_profiles_admin_delete on public.broker_profiles;
create policy broker_profiles_admin_delete on public.broker_profiles
for delete to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists reason_definitions_read on public.reason_definitions;
create policy reason_definitions_read on public.reason_definitions
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));
drop policy if exists reason_definitions_admin_insert on public.reason_definitions;
create policy reason_definitions_admin_insert on public.reason_definitions
for insert to authenticated
with check ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists reason_definitions_admin_update on public.reason_definitions;
create policy reason_definitions_admin_update on public.reason_definitions
for update to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists opportunities_read on public.opportunities;
create policy opportunities_read on public.opportunities
for select to authenticated
using ((select studiosp_private.can_access_opportunity(account_id, id)));

drop policy if exists opportunity_events_read on public.opportunity_events;
create policy opportunity_events_read on public.opportunity_events
for select to authenticated
using ((select studiosp_private.can_access_opportunity(account_id, opportunity_id)));

drop policy if exists attention_items_read on public.attention_items;
create policy attention_items_read on public.attention_items
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or assigned_profile_id = (select studiosp_private.current_profile_id(account_id))
  or (
    opportunity_id is not null
    and (select studiosp_private.can_access_opportunity(account_id, opportunity_id))
  )
);

drop policy if exists audit_events_owner_read on public.audit_events;
create policy audit_events_owner_read on public.audit_events
for select to authenticated
using ((select studiosp_private.is_account_owner(account_id)));

grant select on public.broker_profiles, public.reason_definitions,
  public.opportunities, public.opportunity_events, public.attention_items,
  public.audit_events to authenticated;
grant insert, update, delete on public.broker_profiles to authenticated;
grant insert, update on public.reason_definitions to authenticated;

-- Qualificação, IA e follow-up.
drop policy if exists qualification_questions_read on public.qualification_questions;
create policy qualification_questions_read on public.qualification_questions
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));
drop policy if exists qualification_questions_admin_all on public.qualification_questions;
create policy qualification_questions_admin_all on public.qualification_questions
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists qualification_options_read on public.qualification_question_options;
create policy qualification_options_read on public.qualification_question_options
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));
drop policy if exists qualification_options_admin_all on public.qualification_question_options;
create policy qualification_options_admin_all on public.qualification_question_options
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists qualification_answers_read on public.qualification_answers;
create policy qualification_answers_read on public.qualification_answers
for select to authenticated
using ((select studiosp_private.can_access_opportunity(account_id, opportunity_id)));

drop policy if exists ai_config_versions_owner_read on public.ai_config_versions;
create policy ai_config_versions_owner_read on public.ai_config_versions
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists ai_config_versions_owner_write on public.ai_config_versions;
create policy ai_config_versions_owner_write on public.ai_config_versions
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists ai_runs_owner_read on public.ai_runs;
create policy ai_runs_owner_read on public.ai_runs
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists ai_tool_calls_owner_read on public.ai_tool_calls;
create policy ai_tool_calls_owner_read on public.ai_tool_calls
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists audio_transcriptions_read on public.audio_transcriptions;
create policy audio_transcriptions_read on public.audio_transcriptions
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.opportunities o on o.primary_conversation_id = c.id
    where m.id = audio_transcriptions.message_id
      and o.account_id = audio_transcriptions.account_id
      and o.assigned_broker_id = studiosp_private.current_broker_id(audio_transcriptions.account_id)
  )
);

drop policy if exists followup_policies_admin_read on public.followup_policies;
create policy followup_policies_admin_read on public.followup_policies
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists followup_policies_admin_all on public.followup_policies;
create policy followup_policies_admin_all on public.followup_policies
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists followup_executions_read on public.followup_executions;
create policy followup_executions_read on public.followup_executions
for select to authenticated
using ((select studiosp_private.can_access_opportunity(account_id, opportunity_id)));

grant select on public.qualification_questions,
  public.qualification_question_options, public.qualification_answers,
  public.ai_config_versions, public.ai_runs, public.ai_tool_calls,
  public.audio_transcriptions, public.followup_policies,
  public.followup_executions to authenticated;
grant insert, update, delete on public.qualification_questions,
  public.qualification_question_options, public.ai_config_versions,
  public.followup_policies to authenticated;

-- Catálogo e biblioteca de mídias.
drop policy if exists developers_read on public.developers;
create policy developers_read on public.developers
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (is_active and (select studiosp_private.is_account_member(account_id)))
);
drop policy if exists developers_admin_all on public.developers;
create policy developers_admin_all on public.developers
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists neighborhoods_read on public.neighborhoods;
create policy neighborhoods_read on public.neighborhoods
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (is_active and (select studiosp_private.is_account_member(account_id)))
);
drop policy if exists neighborhoods_admin_all on public.neighborhoods;
create policy neighborhoods_admin_all on public.neighborhoods
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists neighborhood_aliases_read on public.neighborhood_aliases;
create policy neighborhood_aliases_read on public.neighborhood_aliases
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));
drop policy if exists neighborhood_aliases_admin_all on public.neighborhood_aliases;
create policy neighborhood_aliases_admin_all on public.neighborhood_aliases
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists developments_read on public.developments;
create policy developments_read on public.developments
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (
    status = 'published'
    and (select studiosp_private.is_account_member(account_id))
  )
);
drop policy if exists developments_admin_all on public.developments;
create policy developments_admin_all on public.developments
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists development_offers_read on public.development_offers;
create policy development_offers_read on public.development_offers
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or exists (
    select 1 from public.developments d
    where d.id = development_offers.development_id
      and d.account_id = development_offers.account_id
      and d.status = 'published'
      and development_offers.is_active
      and (development_offers.valid_until is null or development_offers.valid_until >= current_date)
      and studiosp_private.is_account_member(development_offers.account_id)
  )
);
drop policy if exists development_offers_admin_all on public.development_offers;
create policy development_offers_admin_all on public.development_offers
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists development_media_read on public.development_media;
create policy development_media_read on public.development_media
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (
    visibility in ('broker', 'shareable')
    and status = 'published'
    and exists (
      select 1 from public.developments d
      where d.id = development_media.development_id
        and d.account_id = development_media.account_id
        and d.status = 'published'
    )
    and (select studiosp_private.is_account_member(account_id))
  )
);
drop policy if exists development_media_admin_all on public.development_media;
create policy development_media_admin_all on public.development_media
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists development_media_versions_read on public.development_media_versions;
create policy development_media_versions_read on public.development_media_versions
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or exists (
    select 1
    from public.development_media dm
    join public.developments d on d.id = dm.development_id
    where dm.id = development_media_versions.media_id
      and dm.account_id = development_media_versions.account_id
      and dm.visibility in ('broker', 'shareable')
      and dm.status = 'published'
      and d.status = 'published'
      and studiosp_private.is_account_member(development_media_versions.account_id)
  )
);
drop policy if exists development_media_versions_admin_all on public.development_media_versions;
create policy development_media_versions_admin_all on public.development_media_versions
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

grant select on public.developers, public.neighborhoods,
  public.neighborhood_aliases, public.developments, public.development_offers,
  public.development_media, public.development_media_versions to authenticated;
grant insert, update, delete on public.developers, public.neighborhoods,
  public.neighborhood_aliases, public.developments, public.development_offers,
  public.development_media, public.development_media_versions to authenticated;

drop policy if exists development_media_storage_select on storage.objects;
create policy development_media_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'development-media'
  and (
    studiosp_private.is_account_admin(
      studiosp_private.safe_uuid((storage.foldername(name))[1])
    )
    or exists (
      select 1
      from public.development_media_versions dmv
      join public.development_media dm on dm.id = dmv.media_id
      join public.developments d on d.id = dm.development_id
      where dmv.bucket_id = storage.objects.bucket_id
        and dmv.object_path = storage.objects.name
        and dm.visibility in ('broker', 'shareable')
        and dm.status = 'published'
        and d.status = 'published'
        and studiosp_private.is_account_member(dmv.account_id)
    )
  )
);

drop policy if exists development_media_storage_insert on storage.objects;
create policy development_media_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'development-media'
  and studiosp_private.is_account_admin(
    studiosp_private.safe_uuid((storage.foldername(name))[1])
  )
);

drop policy if exists development_media_storage_update on storage.objects;
create policy development_media_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'development-media'
  and studiosp_private.is_account_admin(
    studiosp_private.safe_uuid((storage.foldername(name))[1])
  )
)
with check (
  bucket_id = 'development-media'
  and studiosp_private.is_account_admin(
    studiosp_private.safe_uuid((storage.foldername(name))[1])
  )
);

drop policy if exists development_media_storage_delete on storage.objects;
create policy development_media_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'development-media'
  and studiosp_private.is_account_admin(
    studiosp_private.safe_uuid((storage.foldername(name))[1])
  )
);

-- Matching e agenda.
drop policy if exists property_match_runs_read on public.property_match_runs;
create policy property_match_runs_read on public.property_match_runs
for select to authenticated
using ((select studiosp_private.can_access_opportunity(account_id, opportunity_id)));
drop policy if exists property_match_results_read on public.property_match_results;
create policy property_match_results_read on public.property_match_results
for select to authenticated
using (
  exists (
    select 1 from public.property_match_runs pmr
    where pmr.id = property_match_results.match_run_id
      and pmr.account_id = property_match_results.account_id
      and studiosp_private.can_access_opportunity(pmr.account_id, pmr.opportunity_id)
  )
);

drop policy if exists scheduling_policies_admin_read on public.scheduling_policies;
create policy scheduling_policies_admin_read on public.scheduling_policies
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));
drop policy if exists scheduling_policies_admin_all on public.scheduling_policies;
create policy scheduling_policies_admin_all on public.scheduling_policies
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists guaranteed_windows_read on public.guaranteed_windows;
create policy guaranteed_windows_read on public.guaranteed_windows
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id = (select studiosp_private.current_broker_id(account_id))
);
drop policy if exists guaranteed_windows_admin_all on public.guaranteed_windows;
create policy guaranteed_windows_admin_all on public.guaranteed_windows
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists availability_exceptions_read on public.availability_exceptions;
create policy availability_exceptions_read on public.availability_exceptions
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id = (select studiosp_private.current_broker_id(account_id))
);
drop policy if exists availability_exceptions_admin_all on public.availability_exceptions;
create policy availability_exceptions_admin_all on public.availability_exceptions
for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists guaranteed_slots_read on public.guaranteed_slots;
create policy guaranteed_slots_read on public.guaranteed_slots
for select to authenticated
using ((select studiosp_private.is_account_member(account_id)));

drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments
for select to authenticated
using ((select studiosp_private.can_access_appointment(account_id, id)));
drop policy if exists appointment_events_read on public.appointment_events;
create policy appointment_events_read on public.appointment_events
for select to authenticated
using ((select studiosp_private.can_access_appointment(account_id, appointment_id)));
drop policy if exists assignment_offers_read on public.assignment_offers;
create policy assignment_offers_read on public.assignment_offers
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id = (select studiosp_private.current_broker_id(account_id))
);
drop policy if exists broker_operational_conversations_read on public.broker_operational_conversations;
create policy broker_operational_conversations_read on public.broker_operational_conversations
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id = (select studiosp_private.current_broker_id(account_id))
);

grant select on public.property_match_runs, public.property_match_results,
  public.scheduling_policies, public.guaranteed_windows,
  public.availability_exceptions, public.guaranteed_slots,
  public.appointments, public.appointment_events, public.assignment_offers,
  public.broker_operational_conversations to authenticated;
grant insert, update, delete on public.scheduling_policies,
  public.guaranteed_windows, public.availability_exceptions to authenticated;

-- Cria ou localiza uma oportunidade ativa sem duplicar webhooks concorrentes.
create or replace function public.studiosp_create_opportunity(
  p_contact_id uuid,
  p_conversation_id uuid default null,
  p_source_type text default 'other',
  p_source_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_opportunity public.opportunities;
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
  v_profile_id uuid;
begin
  select c.account_id into v_account_id
  from public.contacts c
  where c.id = p_contact_id;

  if v_account_id is null then
    raise exception 'Contato não encontrado.' using errcode = 'P0002';
  end if;

  if not v_is_service and not studiosp_private.is_account_admin(v_account_id) then
    raise exception 'Você não tem permissão para criar esta oportunidade.' using errcode = '42501';
  end if;

  if p_conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and c.account_id = v_account_id
      and c.contact_id = p_contact_id
  ) then
    raise exception 'A conversa não pertence a este contato.' using errcode = '23514';
  end if;

  if p_idempotency_key is not null then
    select o.* into v_opportunity
    from public.opportunity_events e
    join public.opportunities o on o.id = e.opportunity_id
    where e.account_id = v_account_id
      and e.idempotency_key = p_idempotency_key
    limit 1;
    if found then return v_opportunity; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('studiosp:opportunity:' || p_contact_id::text, 0)
  );

  select o.* into v_opportunity
  from public.opportunities o
  where o.account_id = v_account_id
    and o.contact_id = p_contact_id
    and o.stage not in ('won', 'lost')
  for update;

  if found then
    return v_opportunity;
  end if;

  v_profile_id := studiosp_private.current_profile_id(v_account_id);

  insert into public.opportunities (
    account_id, contact_id, primary_conversation_id, source_type,
    source_metadata, last_lead_message_at
  )
  values (
    v_account_id, p_contact_id, p_conversation_id, p_source_type,
    coalesce(p_source_metadata, '{}'::jsonb), now()
  )
  returning * into v_opportunity;

  insert into public.opportunity_events (
    account_id, opportunity_id, contact_id, conversation_id, event_type,
    to_stage, actor_type, actor_profile_id, source_type, idempotency_key, payload
  )
  values (
    v_account_id, v_opportunity.id, p_contact_id, p_conversation_id,
    'lead_received', 'received',
    case when v_is_service then 'integration' else 'user' end,
    v_profile_id,
    case when v_is_service then 'webhook' else 'dashboard' end,
    p_idempotency_key,
    jsonb_build_object('source_type', p_source_type, 'source_metadata', p_source_metadata)
  );

  return v_opportunity;
end;
$$;

revoke all on function public.studiosp_create_opportunity(uuid, uuid, text, jsonb, text)
  from public, anon;
grant execute on function public.studiosp_create_opportunity(uuid, uuid, text, jsonb, text)
  to authenticated, service_role;

create or replace function public.studiosp_record_qualification_answer(
  p_opportunity_id uuid,
  p_question_id uuid,
  p_raw_text text,
  p_normalized_value jsonb,
  p_confidence numeric,
  p_status text default 'provisional',
  p_source_message_id uuid default null,
  p_ai_run_id uuid default null,
  p_idempotency_key text default null
)
returns public.qualification_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_answer public.qualification_answers;
  v_version integer;
  v_profile_id uuid;
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
  v_completed boolean;
begin
  select o.account_id into v_account_id
  from public.opportunities o
  where o.id = p_opportunity_id;

  if v_account_id is null then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if not v_is_service and not studiosp_private.is_account_admin(v_account_id) then
    raise exception 'Você não tem permissão para registrar respostas.' using errcode = '42501';
  end if;

  if p_status not in ('provisional', 'confirmed', 'rejected') then
    raise exception 'Status de resposta inválido.' using errcode = '23514';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'A confiança deve estar entre zero e um.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.qualification_questions q
    where q.id = p_question_id and q.account_id = v_account_id and q.is_active
  ) then
    raise exception 'Pergunta inválida para esta operação.' using errcode = '23514';
  end if;

  if p_idempotency_key is not null then
    select qa.* into v_answer
    from public.qualification_answers qa
    where qa.account_id = v_account_id
      and qa.idempotency_key = p_idempotency_key;
    if found then return v_answer; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'studiosp:qualification:' || p_opportunity_id::text || ':' || p_question_id::text,
      0
    )
  );

  select coalesce(max(qa.version), 0) + 1 into v_version
  from public.qualification_answers qa
  where qa.opportunity_id = p_opportunity_id
    and qa.question_id = p_question_id;

  update public.qualification_answers
  set is_current = false,
      status = case when status in ('provisional', 'confirmed') then 'superseded' else status end
  where opportunity_id = p_opportunity_id
    and question_id = p_question_id
    and is_current;

  v_profile_id := studiosp_private.current_profile_id(v_account_id);

  insert into public.qualification_answers (
    account_id, opportunity_id, question_id, version, status, raw_text,
    normalized_value, confidence, source_message_id, extracted_by_run_id,
    confirmed_by, confirmed_at, idempotency_key
  )
  values (
    v_account_id, p_opportunity_id, p_question_id, v_version, p_status,
    p_raw_text, coalesce(p_normalized_value, '{}'::jsonb), p_confidence,
    p_source_message_id, p_ai_run_id,
    case when p_status = 'confirmed' then v_profile_id end,
    case when p_status = 'confirmed' then now() end,
    p_idempotency_key
  )
  returning * into v_answer;

  insert into public.opportunity_events (
    account_id, opportunity_id, event_type, actor_type, actor_profile_id,
    source_type, source_id, idempotency_key, payload
  )
  values (
    v_account_id, p_opportunity_id, 'qualification_answered',
    case when v_is_service then 'ai' else 'user' end,
    v_profile_id,
    case when v_is_service then 'api' else 'dashboard' end,
    p_source_message_id::text,
    case when p_idempotency_key is null then null else p_idempotency_key || ':event' end,
    jsonb_build_object(
      'question_id', p_question_id,
      'answer_id', v_answer.id,
      'status', p_status,
      'confidence', p_confidence
    )
  );

  select
    not exists (
      select 1
      from public.qualification_questions q
      where q.account_id = v_account_id
        and q.is_active
        and q.is_required
        and not exists (
          select 1 from public.qualification_answers qa
          where qa.opportunity_id = p_opportunity_id
            and qa.question_id = q.id
            and qa.is_current
            and qa.status = 'confirmed'
        )
    )
    and exists (
      select 1
      from public.qualification_answers qa
      join public.qualification_questions q on q.id = qa.question_id
      where qa.opportunity_id = p_opportunity_id
        and qa.is_current
        and qa.status = 'confirmed'
        and q.key in ('entry_budget', 'monthly_installment_budget')
    )
  into v_completed;

  if v_completed then
    update public.opportunities
    set qualification_status = 'completed',
        stage = case when stage in ('received', 'contacting', 'qualifying') then 'qualified' else stage end,
        stage_changed_at = case when stage in ('received', 'contacting', 'qualifying') then now() else stage_changed_at end,
        attention_state = 'no_action'
    where id = p_opportunity_id;

    insert into public.opportunity_events (
      account_id, opportunity_id, event_type, to_stage, actor_type,
      actor_profile_id, source_type, idempotency_key, payload
    )
    values (
      v_account_id, p_opportunity_id, 'qualification_completed', 'qualified',
      case when v_is_service then 'ai' else 'user' end,
      v_profile_id,
      case when v_is_service then 'api' else 'dashboard' end,
      case when p_idempotency_key is null then null else p_idempotency_key || ':completed' end,
      jsonb_build_object('trigger_answer_id', v_answer.id)
    )
    on conflict do nothing;
  else
    update public.opportunities
    set qualification_status = 'in_progress',
        stage = case when stage in ('received', 'contacting') then 'qualifying' else stage end,
        stage_changed_at = case when stage in ('received', 'contacting') then now() else stage_changed_at end
    where id = p_opportunity_id;
  end if;

  return v_answer;
end;
$$;

revoke all on function public.studiosp_record_qualification_answer(
  uuid, uuid, text, jsonb, numeric, text, uuid, uuid, text
) from public, anon;
grant execute on function public.studiosp_record_qualification_answer(
  uuid, uuid, text, jsonb, numeric, text, uuid, uuid, text
) to authenticated, service_role;

create or replace function public.studiosp_resolve_attention_item(
  p_attention_item_id uuid,
  p_resolution jsonb default '{}'::jsonb
)
returns public.attention_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.attention_items;
  v_profile_id uuid;
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  select * into v_item
  from public.attention_items
  where id = p_attention_item_id
  for update;

  if not found then
    raise exception 'Pendência não encontrada.' using errcode = 'P0002';
  end if;

  v_profile_id := studiosp_private.current_profile_id(v_item.account_id);
  if not v_is_service
    and not studiosp_private.is_account_admin(v_item.account_id)
    and v_item.assigned_profile_id is distinct from v_profile_id
    and (
      v_item.opportunity_id is null
      or not studiosp_private.can_access_opportunity(v_item.account_id, v_item.opportunity_id)
    )
  then
    raise exception 'Você não tem permissão para resolver esta pendência.' using errcode = '42501';
  end if;

  update public.attention_items
  set status = 'resolved', resolved_at = now(), resolved_by = v_profile_id,
      resolution = coalesce(p_resolution, '{}'::jsonb)
  where id = p_attention_item_id
  returning * into v_item;

  insert into public.audit_events (
    account_id, actor_type, actor_profile_id, action, entity_type,
    entity_id, next_data
  ) values (
    v_item.account_id,
    case when v_is_service then 'system' else 'user' end,
    v_profile_id, 'attention_resolved', 'attention_item', v_item.id,
    jsonb_build_object('resolution', p_resolution)
  );

  return v_item;
end;
$$;

revoke all on function public.studiosp_resolve_attention_item(uuid, jsonb)
  from public, anon;
grant execute on function public.studiosp_resolve_attention_item(uuid, jsonb)
  to authenticated, service_role;

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
    raise exception 'Perfil de corretor não encontrado.' using errcode = 'P0002';
  end if;
  if p_is_available and p_unavailable_until is not null then
    raise exception 'Um corretor disponível não pode ter bloqueio futuro.' using errcode = '23514';
  end if;

  update public.broker_profiles
  set is_available = p_is_available,
      unavailable_until = case when p_is_available then null else p_unavailable_until end
  where id = v_profile.id
  returning * into v_profile;

  insert into public.audit_events (
    account_id, actor_type, actor_profile_id, action, entity_type,
    entity_id, next_data
  ) values (
    v_profile.account_id, 'user', v_profile.profile_id,
    'broker_availability_changed', 'broker_profile', v_profile.id,
    jsonb_build_object(
      'is_available', p_is_available,
      'unavailable_until', p_unavailable_until
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.studiosp_set_broker_availability(boolean, timestamptz)
  from public, anon;
grant execute on function public.studiosp_set_broker_availability(boolean, timestamptz)
  to authenticated;

create or replace function public.studiosp_publish_development(p_development_id uuid)
returns public.developments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_development public.developments;
  v_profile_id uuid;
begin
  select * into v_development
  from public.developments
  where id = p_development_id
  for update;

  if not found then
    raise exception 'Empreendimento não encontrado.' using errcode = 'P0002';
  end if;
  if not studiosp_private.is_account_admin(v_development.account_id) then
    raise exception 'Você não tem permissão para publicar.' using errcode = '42501';
  end if;
  if length(trim(v_development.description)) = 0 then
    raise exception 'Adicione uma descrição antes de publicar.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.developers d
    where d.id = v_development.developer_id and d.is_active
  ) or not exists (
    select 1 from public.neighborhoods n
    where n.id = v_development.neighborhood_id and n.is_active
  ) then
    raise exception 'Incorporadora e bairro precisam estar ativos.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.development_offers offer
    where offer.development_id = v_development.id
      and offer.account_id = v_development.account_id
      and offer.is_active
      and (offer.valid_until is null or offer.valid_until >= current_date)
  ) then
    raise exception 'Cadastre ao menos uma opção comercial ativa e válida.' using errcode = '23514';
  end if;

  v_profile_id := studiosp_private.current_profile_id(v_development.account_id);
  update public.developments
  set status = 'published', published_at = now(), updated_by = v_profile_id
  where id = p_development_id
  returning * into v_development;

  insert into public.audit_events (
    account_id, actor_type, actor_profile_id, action, entity_type,
    entity_id, next_data
  ) values (
    v_development.account_id, 'user', v_profile_id,
    'development_published', 'development', v_development.id,
    jsonb_build_object('status', 'published')
  );

  return v_development;
end;
$$;

revoke all on function public.studiosp_publish_development(uuid)
  from public, anon;
grant execute on function public.studiosp_publish_development(uuid)
  to authenticated;

create or replace function public.studiosp_apply_opportunity_event(
  p_opportunity_id uuid,
  p_event_type text,
  p_expected_stage text default null,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_source_type text default 'dashboard',
  p_reason text default null,
  p_actor_type text default null,
  p_actor_profile_id uuid default null
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.opportunities;
  v_existing_event public.opportunity_events;
  v_target_stage text;
  v_from_stage text;
  v_profile_id uuid;
  v_actor_type text;
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
  v_is_admin boolean;
  v_is_assigned_broker boolean;
  v_reason_id uuid;
  v_reason_requires_notes boolean;
  v_value numeric(14,2);
begin
  if p_idempotency_key is not null then
    select * into v_existing_event
    from public.opportunity_events
    where idempotency_key = p_idempotency_key
    limit 1;
    if found then
      select * into v_opportunity
      from public.opportunities where id = v_existing_event.opportunity_id;
      return v_opportunity;
    end if;
  end if;

  select * into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;
  v_from_stage := v_opportunity.stage;
  if p_expected_stage is not null and v_opportunity.stage <> p_expected_stage then
    raise exception 'A etapa mudou enquanto a ação era confirmada. Atualize a página e tente novamente.'
      using errcode = '40001';
  end if;

  if v_is_service then
    v_actor_type := coalesce(p_actor_type, 'system');
    v_profile_id := p_actor_profile_id;
    if v_actor_type not in ('ai', 'user', 'system', 'integration') then
      raise exception 'Tipo de ator inválido.' using errcode = '23514';
    end if;
    if v_profile_id is not null and not exists (
      select 1 from public.profiles p
      where p.id = v_profile_id and p.account_id = v_opportunity.account_id
    ) then
      raise exception 'Ator não pertence a esta operação.' using errcode = '23514';
    end if;
  else
    v_actor_type := 'user';
    v_profile_id := studiosp_private.current_profile_id(v_opportunity.account_id);
    if v_profile_id is null then
      raise exception 'Perfil não encontrado.' using errcode = '42501';
    end if;
  end if;

  v_is_admin := case
    when v_is_service and v_actor_type <> 'user' then true
    else studiosp_private.is_account_admin(v_opportunity.account_id)
  end;
  v_is_assigned_broker := v_opportunity.assigned_broker_id is not null
    and v_opportunity.assigned_broker_id = (
      select bp.id from public.broker_profiles bp
      where bp.profile_id = v_profile_id
        and bp.account_id = v_opportunity.account_id
      limit 1
    );

  if v_actor_type = 'ai' and p_event_type in (
    'meeting_completed', 'meeting_no_show', 'proposal_sent',
    'negotiation_started', 'contract_sent', 'contract_signed',
    'sale_confirmed', 'lead_lost', 'owner_override', 'opportunity_reopened'
  ) then
    raise exception 'A IA não pode confirmar fatos humanos.' using errcode = '42501';
  end if;

  if not v_is_service and not v_is_admin and not (
    v_is_assigned_broker and p_event_type in (
      'meeting_completed', 'meeting_no_show', 'proposal_sent',
      'negotiation_started', 'contract_sent', 'contract_signed',
      'sale_confirmed', 'lead_lost', 'appointment_reschedule_requested'
    )
  ) then
    raise exception 'Esta ação não está disponível para você.' using errcode = '42501';
  end if;

  v_target_stage := case p_event_type
    when 'lead_received' then 'received'
    when 'contact_attempted' then 'contacting'
    when 'qualification_started' then 'qualifying'
    when 'qualification_completed' then 'qualified'
    when 'schedule_preference_recorded' then 'awaiting_schedule'
    when 'appointment_reserved' then 'meeting_scheduled'
    when 'appointment_confirmed' then 'meeting_scheduled'
    when 'meeting_completed' then 'meeting_completed'
    when 'proposal_sent' then 'proposal_sent'
    when 'negotiation_started' then 'negotiating'
    when 'contract_sent' then 'contract_pending'
    when 'contract_signed' then 'contract_pending'
    when 'sale_confirmed' then 'won'
    when 'lead_lost' then 'lost'
    when 'opportunity_reopened' then coalesce(p_payload->>'to_stage', 'received')
    when 'owner_override' then p_payload->>'to_stage'
    else null
  end;

  if p_event_type in ('owner_override', 'opportunity_reopened') then
    if not v_is_admin or p_reason is null or length(trim(p_reason)) < 5 then
      raise exception 'A exceção do dono exige uma justificativa.' using errcode = '23514';
    end if;
  elsif v_opportunity.stage in ('won', 'lost') then
    raise exception 'A oportunidade está encerrada.' using errcode = '23514';
  end if;

  if v_target_stage is not null and v_target_stage not in (
    'received', 'contacting', 'qualifying', 'qualified', 'awaiting_schedule',
    'meeting_scheduled', 'meeting_completed', 'proposal_sent', 'negotiating',
    'contract_pending', 'won', 'lost'
  ) then
    raise exception 'Etapa de destino inválida.' using errcode = '23514';
  end if;

  if p_event_type = 'meeting_completed' then
    if not exists (
      select 1 from public.appointments a
      where a.opportunity_id = p_opportunity_id
        and a.status in ('reserved', 'broker_confirmed')
        and a.starts_at <= now()
    ) then
      raise exception 'A reunião só pode ser concluída após o horário agendado.' using errcode = '23514';
    end if;
    update public.appointments
    set status = 'completed'
    where id = (
      select a.id from public.appointments a
      where a.opportunity_id = p_opportunity_id
        and a.status in ('reserved', 'broker_confirmed')
      order by a.starts_at desc
      limit 1
    );
  end if;

  if p_event_type = 'meeting_no_show' then
    if not exists (
      select 1 from public.appointments a
      where a.opportunity_id = p_opportunity_id
        and a.starts_at <= now()
        and a.status in ('reserved', 'broker_confirmed')
    ) then
      raise exception 'A ausência só pode ser registrada após o horário agendado.' using errcode = '23514';
    end if;
    update public.appointments
    set status = 'no_show'
    where id = (
      select a.id from public.appointments a
      where a.opportunity_id = p_opportunity_id
        and a.status in ('reserved', 'broker_confirmed')
      order by a.starts_at desc
      limit 1
    );
  end if;

  if p_event_type = 'lead_lost' then
    v_reason_id := studiosp_private.safe_uuid(p_payload->>'reason_id');
    select r.requires_notes into v_reason_requires_notes
    from public.reason_definitions r
    where r.id = v_reason_id
      and r.account_id = v_opportunity.account_id
      and r.category = 'loss'
      and r.is_active;
    if not found then
      raise exception 'Selecione um motivo de perda válido.' using errcode = '23514';
    end if;
    if v_reason_requires_notes and (p_reason is null or length(trim(p_reason)) < 3) then
      raise exception 'Este motivo exige uma observação.' using errcode = '23514';
    end if;
  end if;

  if p_event_type = 'sale_confirmed' and nullif(p_payload->>'gross_value', '') is not null then
    begin
      v_value := (p_payload->>'gross_value')::numeric(14,2);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Valor bruto inválido.' using errcode = '23514';
    end;
    if v_value < 0 then
      raise exception 'O valor bruto não pode ser negativo.' using errcode = '23514';
    end if;
  end if;

  update public.opportunities
  set stage = coalesce(v_target_stage, stage),
      stage_changed_at = case when v_target_stage is distinct from stage then now() else stage_changed_at end,
      meeting_status = case p_event_type
        when 'appointment_reserved' then 'reserved'
        when 'appointment_confirmed' then 'confirmed'
        when 'meeting_completed' then 'completed'
        when 'meeting_no_show' then 'no_show'
        when 'appointment_cancelled' then 'cancelled'
        when 'appointment_reschedule_requested' then 'reschedule_requested'
        else meeting_status
      end,
      commercial_status = case p_event_type
        when 'proposal_sent' then 'proposal_sent'
        when 'negotiation_started' then 'negotiating'
        when 'contract_sent' then 'contract_sent'
        when 'contract_signed' then 'signed'
        when 'sale_confirmed' then 'won'
        when 'lead_lost' then 'lost'
        else commercial_status
      end,
      lost_reason_id = case when p_event_type = 'lead_lost' then v_reason_id else lost_reason_id end,
      lost_notes = case when p_event_type = 'lead_lost' then p_reason else lost_notes end,
      won_gross_value = case when p_event_type = 'sale_confirmed' then v_value else won_gross_value end,
      closed_at = case
        when v_target_stage in ('won', 'lost') then now()
        when p_event_type = 'opportunity_reopened' then null
        else closed_at
      end,
      attention_state = case
        when p_event_type = 'ai_handoff' then 'human_takeover'
        when p_event_type = 'integration_failed' then 'integration_error'
        when v_target_stage in ('won', 'lost') then 'no_action'
        else attention_state
      end
  where id = p_opportunity_id
  returning * into v_opportunity;

  insert into public.opportunity_events (
    account_id, opportunity_id, contact_id, conversation_id, event_type,
    from_stage, to_stage, actor_type, actor_profile_id, source_type,
    idempotency_key, payload
  ) values (
    v_opportunity.account_id, v_opportunity.id, v_opportunity.contact_id,
    v_opportunity.primary_conversation_id, p_event_type,
    case when v_target_stage is null then null else v_from_stage end,
    v_target_stage, v_actor_type, v_profile_id, p_source_type,
    p_idempotency_key,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
  );

  insert into public.audit_events (
    account_id, actor_type, actor_profile_id, action, entity_type,
    entity_id, next_data, reason
  ) values (
    v_opportunity.account_id,
    case when v_actor_type = 'ai' then 'ai'
         when v_actor_type = 'integration' then 'integration'
         when v_actor_type = 'user' then 'user'
         else 'system' end,
    v_profile_id, p_event_type, 'opportunity', v_opportunity.id,
    jsonb_build_object('stage', v_opportunity.stage), p_reason
  );

  return v_opportunity;
end;
$$;

revoke all on function public.studiosp_apply_opportunity_event(
  uuid, text, text, jsonb, text, text, text, text, uuid
) from public, anon;
grant execute on function public.studiosp_apply_opportunity_event(
  uuid, text, text, jsonb, text, text, text, text, uuid
) to authenticated, service_role;

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
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  if p_start_date is null or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date > p_start_date + 90
  then
    raise exception 'Intervalo de geração de horários inválido.' using errcode = '23514';
  end if;

  if p_account_id is null then
    raise exception 'Informe a operação para gerar os horários.' using errcode = '23502';
  end if;

  if not v_is_service then
    if not studiosp_private.is_account_admin(p_account_id) then
      raise exception 'Você não tem permissão para gerar horários.' using errcode = '42501';
    end if;
  end if;

  select sp.timezone into v_timezone
  from public.scheduling_policies sp
  where sp.account_id = p_account_id and sp.status = 'active';

  if v_timezone is null then
    raise exception 'Política de agenda ativa não encontrada.' using errcode = 'P0002';
  end if;

  with candidate_slots as (
    select
      gw.account_id,
      gw.id as window_id,
      gw.broker_profile_id,
      (
        day_value::date + slot_time::time
      ) at time zone coalesce(v_timezone, 'America/Sao_Paulo') as starts_at,
      (
        day_value::date + slot_time::time
        + make_interval(mins => sp.meeting_duration_minutes)
      ) at time zone coalesce(v_timezone, 'America/Sao_Paulo') as ends_at,
      gw.capacity_per_slot as capacity
    from public.guaranteed_windows gw
    join public.scheduling_policies sp
      on sp.account_id = gw.account_id and sp.status = 'active'
    cross join lateral generate_series(p_start_date, p_end_date, interval '1 day') day_value
    cross join lateral generate_series(
      day_value::date + gw.start_time,
      day_value::date + gw.end_time - make_interval(mins => sp.meeting_duration_minutes),
      make_interval(mins => gw.slot_interval_minutes)
    ) slot_time
    where gw.account_id = p_account_id
      and gw.is_active
      and extract(dow from day_value)::smallint = gw.weekday
      and (gw.valid_from is null or day_value::date >= gw.valid_from)
      and (gw.valid_until is null or day_value::date <= gw.valid_until)
  ), inserted as (
    insert into public.guaranteed_slots (
      account_id, window_id, broker_profile_id, starts_at, ends_at, capacity
    )
    select cs.account_id, cs.window_id, cs.broker_profile_id,
      cs.starts_at, cs.ends_at, cs.capacity
    from candidate_slots cs
    where cs.starts_at > now()
      and not exists (
        select 1 from public.availability_exceptions ae
        where ae.account_id = cs.account_id
          and ae.broker_profile_id = cs.broker_profile_id
          and ae.exception_type = 'blocked'
          and cs.starts_at < ae.ends_at
          and cs.ends_at > ae.starts_at
      )
    on conflict (broker_profile_id, starts_at) do update
      set window_id = excluded.window_id,
          ends_at = excluded.ends_at,
          capacity = greatest(public.guaranteed_slots.reserved_count, excluded.capacity),
          status = case
            when public.guaranteed_slots.status = 'expired' then 'available'
            else public.guaranteed_slots.status
          end
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return v_inserted;
end;
$$;

revoke all on function public.studiosp_materialize_guaranteed_slots(uuid, date, date)
  from public, anon;
grant execute on function public.studiosp_materialize_guaranteed_slots(uuid, date, date)
  to authenticated, service_role;

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
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
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
      select * into v_appointment from public.appointments
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
    raise exception 'A oportunidade está encerrada.' using errcode = '23514';
  end if;
  if not v_is_service and not studiosp_private.is_account_admin(v_opportunity.account_id) then
    raise exception 'Você não tem permissão para reservar este horário.' using errcode = '42501';
  end if;

  select * into v_slot
  from public.guaranteed_slots
  where id = p_slot_id
    and account_id = v_opportunity.account_id
  for update;
  if not found or v_slot.status <> 'available' then
    raise exception 'Este horário não está disponível.' using errcode = 'P0002';
  end if;

  select * into v_policy
  from public.scheduling_policies
  where account_id = v_opportunity.account_id
    and status = 'active'
  for share;
  if not found then
    raise exception 'Política de agenda ativa não encontrada.' using errcode = 'P0002';
  end if;
  if v_slot.starts_at < now() + make_interval(mins => v_policy.minimum_notice_minutes)
    or v_slot.starts_at > now() + make_interval(days => v_policy.scheduling_horizon_days)
  then
    raise exception 'O horário está fora da antecedência ou do horizonte permitido.' using errcode = '23514';
  end if;
  if v_slot.reserved_count >= v_slot.capacity then
    raise exception 'A capacidade deste horário foi preenchida.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.availability_exceptions ae
    where ae.account_id = v_slot.account_id
      and ae.broker_profile_id = v_slot.broker_profile_id
      and ae.exception_type = 'blocked'
      and v_slot.starts_at < ae.ends_at
      and v_slot.ends_at > ae.starts_at
  ) then
    raise exception 'O horário foi bloqueado.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.appointments a
    where a.opportunity_id = p_opportunity_id
      and a.status in ('reserved', 'broker_confirmed', 'reschedule_requested')
  ) then
    raise exception 'Esta oportunidade já possui uma reunião ativa.' using errcode = '23505';
  end if;

  update public.guaranteed_slots
  set reserved_count = reserved_count + 1
  where id = v_slot.id;

  insert into public.appointments (
    account_id, opportunity_id, scheduling_policy_id, slot_id,
    status, starts_at, ends_at, timezone, channel, lead_confirmed_at
  ) values (
    v_opportunity.account_id, v_opportunity.id, v_policy.id, v_slot.id,
    'reserved', v_slot.starts_at, v_slot.ends_at, v_policy.timezone,
    p_channel, now()
  ) returning * into v_appointment;

  v_offer_expires_at := least(
    now() + make_interval(mins => v_policy.broker_offer_sla_minutes),
    v_slot.starts_at
  );
  if v_offer_expires_at <= now() then
    v_offer_expires_at := now() + interval '1 minute';
  end if;

  insert into public.assignment_offers (
    account_id, appointment_id, broker_profile_id, attempt_order,
    channel, expires_at
  ) values (
    v_opportunity.account_id, v_appointment.id, v_slot.broker_profile_id,
    1, 'both', v_offer_expires_at
  );

  update public.opportunities
  set stage = 'meeting_scheduled',
      meeting_status = 'reserved',
      attention_state = 'awaiting_broker',
      stage_changed_at = now(),
      next_action_at = v_offer_expires_at
  where id = v_opportunity.id;

  insert into public.appointment_events (
    account_id, appointment_id, event_type, actor_type, source_type,
    idempotency_key, payload
  ) values (
    v_opportunity.account_id, v_appointment.id, 'appointment_reserved',
    case when v_is_service then 'ai' else 'user' end,
    case when v_is_service then 'api' else 'dashboard' end,
    p_idempotency_key,
    jsonb_build_object('slot_id', v_slot.id)
  );

  insert into public.opportunity_events (
    account_id, opportunity_id, contact_id, conversation_id, event_type,
    from_stage, to_stage, actor_type, source_type, idempotency_key, payload
  ) values (
    v_opportunity.account_id, v_opportunity.id, v_opportunity.contact_id,
    v_opportunity.primary_conversation_id, 'appointment_reserved',
    v_opportunity.stage, 'meeting_scheduled',
    case when v_is_service then 'ai' else 'user' end,
    case when v_is_service then 'api' else 'dashboard' end,
    case when p_idempotency_key is null then null else p_idempotency_key || ':opportunity' end,
    jsonb_build_object('appointment_id', v_appointment.id, 'slot_id', v_slot.id)
  );

  return v_appointment;
end;
$$;

revoke all on function public.studiosp_reserve_guaranteed_slot(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.studiosp_reserve_guaranteed_slot(uuid, uuid, text, text)
  to authenticated, service_role;

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
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
begin
  if p_action not in ('accept', 'reject', 'transfer') then
    raise exception 'Resposta de oferta inválida.' using errcode = '23514';
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
    raise exception 'Esta oferta não pertence a este corretor.' using errcode = '42501';
  end if;

  if v_offer.status <> 'pending' then
    return v_offer;
  end if;
  if v_offer.expires_at <= now() then
    update public.assignment_offers
    set status = 'expired'
    where id = v_offer.id
    returning * into v_offer;
    raise exception 'O prazo desta oferta terminou.' using errcode = '23514';
  end if;
  if p_action in ('reject', 'transfer') and (
    p_reason_id is null or not exists (
      select 1 from public.reason_definitions r
      where r.id = p_reason_id
        and r.account_id = v_offer.account_id
        and r.category in ('broker_rejection', 'transfer')
        and r.is_active
        and (p_notes is not null or not r.requires_notes)
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
    set status = 'accepted', responded_at = now(), response_notes = p_notes
    where id = v_offer.id
    returning * into v_offer;

    update public.assignment_offers
    set status = 'cancelled'
    where appointment_id = v_offer.appointment_id
      and id <> v_offer.id
      and status = 'pending';

    update public.appointments
    set status = 'broker_confirmed', broker_profile_id = v_broker_id,
        broker_confirmed_at = now()
    where id = v_appointment.id;

    update public.opportunities
    set assigned_broker_id = v_broker_id,
        meeting_status = 'confirmed', attention_state = 'no_action',
        next_action_at = v_appointment.starts_at
    where id = v_appointment.opportunity_id;

    update public.broker_profiles
    set last_assignment_at = now()
    where id = v_broker_id;
  else
    update public.assignment_offers
    set status = case when p_action = 'transfer' then 'transferred' else 'rejected' end,
        responded_at = now(), reason_id = p_reason_id, response_notes = p_notes
    where id = v_offer.id
    returning * into v_offer;

    select bp.id into v_next_broker_id
    from public.broker_profiles bp
    where bp.account_id = v_offer.account_id
      and bp.is_active and bp.is_available
      and (bp.unavailable_until is null or bp.unavailable_until <= now())
      and bp.whatsapp_verified_at is not null
      and bp.id <> v_broker_id
      and not exists (
        select 1 from public.assignment_offers previous
        where previous.appointment_id = v_offer.appointment_id
          and previous.broker_profile_id = bp.id
      )
      and not exists (
        select 1 from public.appointments conflict
        where conflict.broker_profile_id = bp.id
          and conflict.status in ('reserved', 'broker_confirmed')
          and v_appointment.starts_at < conflict.ends_at
          and v_appointment.ends_at > conflict.starts_at
      )
    order by bp.routing_priority, bp.last_assignment_at nulls first, bp.id
    limit 1
    for update skip locked;

    if v_next_broker_id is not null then
      select coalesce(max(attempt_order), 0) + 1 into v_next_order
      from public.assignment_offers
      where appointment_id = v_offer.appointment_id;

      insert into public.assignment_offers (
        account_id, appointment_id, broker_profile_id, attempt_order,
        channel, expires_at
      ) values (
        v_offer.account_id, v_offer.appointment_id, v_next_broker_id,
        v_next_order, 'both',
        least(
          now() + make_interval(mins => v_policy.broker_offer_sla_minutes),
          greatest(v_appointment.starts_at, now() + interval '1 minute')
        )
      );
    else
      insert into public.attention_items (
        account_id, opportunity_id, assigned_role, kind, severity, title,
        context, due_at, deduplication_key
      ) values (
        v_offer.account_id, v_appointment.opportunity_id, 'owner',
        'broker_queue_exhausted', 'critical',
        'Reunião sem corretor responsável',
        jsonb_build_object('appointment_id', v_appointment.id),
        now(), 'broker-queue-exhausted:' || v_appointment.id::text
      ) on conflict do nothing;

      update public.opportunities
      set attention_state = 'owner_attention', next_action_at = now()
      where id = v_appointment.opportunity_id;
    end if;
  end if;

  insert into public.appointment_events (
    account_id, appointment_id, event_type, actor_type, actor_profile_id,
    source_type, idempotency_key, payload
  ) values (
    v_offer.account_id, v_offer.appointment_id,
    case p_action when 'accept' then 'broker_accepted'
                  when 'transfer' then 'broker_transfer_requested'
                  else 'broker_rejected' end,
    'user', (select bp.profile_id from public.broker_profiles bp where bp.id = v_broker_id),
    case when v_is_service then 'whatsapp' else 'dashboard' end,
    p_idempotency_key,
    jsonb_build_object('offer_id', v_offer.id, 'reason_id', p_reason_id, 'notes', p_notes)
  ) on conflict do nothing;

  return v_offer;
end;
$$;

revoke all on function public.studiosp_respond_assignment_offer(
  uuid, text, uuid, text, uuid, text
) from public, anon;
grant execute on function public.studiosp_respond_assignment_offer(
  uuid, text, uuid, text, uuid, text
) to authenticated, service_role;

create or replace function public.studiosp_claim_due_followups(
  p_worker_id text,
  p_limit integer default 25
)
returns setof public.followup_executions
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Operação exclusiva do servidor.' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Limite de lote inválido.' using errcode = '23514';
  end if;

  return query
  update public.followup_executions f
  set status = 'claimed', claimed_at = now(), claimed_by = p_worker_id,
      attempt_count = attempt_count + 1
  where f.id in (
    select pending.id
    from public.followup_executions pending
    where pending.status = 'scheduled'
      and pending.scheduled_for <= now()
    order by pending.scheduled_for, pending.id
    limit p_limit
    for update skip locked
  )
  returning f.*;
end;
$$;

revoke all on function public.studiosp_claim_due_followups(text, integer)
  from public, anon, authenticated;
grant execute on function public.studiosp_claim_due_followups(text, integer)
  to service_role;

-- Configuração inicial por operação.
insert into public.reason_definitions (
  account_id, category, code, label, requires_notes, display_order
)
select a.id, seed.category, seed.code, seed.label, seed.requires_notes, seed.display_order
from public.accounts a
cross join (values
  ('loss', 'no_response', 'Não respondeu', false, 10),
  ('loss', 'budget_mismatch', 'Condição financeira incompatível', true, 20),
  ('loss', 'location_mismatch', 'Localização incompatível', true, 30),
  ('loss', 'timing_mismatch', 'Momento de compra incompatível', true, 40),
  ('loss', 'bought_elsewhere', 'Comprou com outra empresa', true, 50),
  ('loss', 'legacy_import', 'Importado como perdido do sistema anterior', false, 90),
  ('loss', 'other', 'Outro motivo', true, 100),
  ('broker_rejection', 'schedule_conflict', 'Conflito de agenda', true, 10),
  ('broker_rejection', 'temporary_unavailability', 'Indisponibilidade temporária', true, 20),
  ('broker_rejection', 'outside_profile', 'Atendimento fora do perfil', true, 30),
  ('broker_rejection', 'other', 'Outro motivo', true, 100),
  ('transfer', 'schedule_conflict', 'Conflito de agenda', true, 10),
  ('transfer', 'workload', 'Carga de atendimentos', true, 20),
  ('transfer', 'requested_support', 'Solicitou apoio de outro corretor', true, 30),
  ('transfer', 'other', 'Outro motivo', true, 100),
  ('appointment_cancellation', 'broker_unavailable', 'Corretor indisponível', true, 10),
  ('appointment_cancellation', 'lead_requested', 'Solicitado pelo lead', true, 20),
  ('appointment_cancellation', 'other', 'Outro motivo', true, 100),
  ('owner_override', 'data_correction', 'Correção de informação', true, 10),
  ('owner_override', 'operational_exception', 'Exceção operacional', true, 20)
) as seed(category, code, label, requires_notes, display_order)
on conflict (account_id, category, code) do nothing;

insert into public.qualification_questions (
  account_id, key, label, prompt_instruction, data_type,
  normalization_strategy, is_required, is_system, display_order,
  validation_schema
)
select a.id, seed.key, seed.label, seed.instruction, seed.data_type,
  seed.strategy, seed.is_required, true, seed.display_order, seed.validation_schema
from public.accounts a
cross join (values
  ('purchase_objective', 'Objetivo da compra', 'Entenda se a pessoa procura o imóvel para morar, investir ou combinar os dois objetivos.', 'single_choice', 'purchase_objective_v1', true, 10, '{"allowed":["live","invest","both","unknown"]}'::jsonb),
  ('preferred_locations', 'Bairros ou regiões de interesse', 'Descubra ao menos um bairro ou uma região e confirme ambiguidades naturalmente.', 'location', 'neighborhood_alias_v1', true, 20, '{}'::jsonb),
  ('entry_budget', 'Faixa de entrada disponível', 'Pergunte qual faixa de entrada a pessoa consegue usar, sem pressionar por um número exato.', 'money_range', 'brl_money_range_v1', false, 30, '{"currency":"BRL","minimum":0}'::jsonb),
  ('monthly_installment_budget', 'Faixa de parcela mensal', 'Entenda qual faixa de parcela mensal fica confortável para a pessoa.', 'money_range', 'brl_money_range_v1', false, 40, '{"currency":"BRL","minimum":0}'::jsonb),
  ('total_price_budget', 'Faixa de preço total', 'Colete a faixa de preço total somente quando fizer sentido na conversa.', 'money_range', 'brl_money_range_v1', false, 50, '{"currency":"BRL","minimum":0}'::jsonb),
  ('property_timing', 'Na planta ou pronto', 'Entenda se a pessoa prefere imóvel na planta, pronto ou se é indiferente.', 'single_choice', 'property_timing_v1', true, 60, '{"allowed":["off_plan","ready","indifferent"]}'::jsonb),
  ('purchase_urgency', 'Prazo para comprar', 'Entenda a urgência real da compra de forma conversacional.', 'single_choice', 'purchase_urgency_v1', true, 70, '{"allowed":["up_to_30_days","one_to_three_months","three_to_six_months","six_to_twelve_months","over_twelve_months","researching"]}'::jsonb),
  ('schedule_preference', 'Preferência de horário', 'Quando a qualificação terminar, descubra o melhor dia e período para uma conversa rápida com o corretor.', 'date_range', 'schedule_preference_v1', false, 80, '{}'::jsonb)
) as seed(key, label, instruction, data_type, strategy, is_required, display_order, validation_schema)
on conflict (account_id, key) do nothing;

insert into public.qualification_question_options (
  account_id, question_id, value, label, aliases, display_order
)
select q.account_id, q.id, seed.value, seed.label, seed.aliases, seed.display_order
from public.qualification_questions q
join (values
  ('purchase_objective', 'live', 'Morar', array['morar','moradia','pra mim']::text[], 10),
  ('purchase_objective', 'invest', 'Investir', array['investir','investimento','renda']::text[], 20),
  ('purchase_objective', 'both', 'Morar e investir', array['os dois','ambos']::text[], 30),
  ('purchase_objective', 'unknown', 'Ainda não definiu', array['não sei','pesquisando']::text[], 40),
  ('property_timing', 'off_plan', 'Na planta', array['lançamento','em construção']::text[], 10),
  ('property_timing', 'ready', 'Pronto', array['pronto para morar','entregue']::text[], 20),
  ('property_timing', 'indifferent', 'Indiferente', array['tanto faz','qualquer um']::text[], 30),
  ('purchase_urgency', 'up_to_30_days', 'Até 30 dias', array['agora','urgente','este mês']::text[], 10),
  ('purchase_urgency', 'one_to_three_months', 'De 1 a 3 meses', array['próximos meses']::text[], 20),
  ('purchase_urgency', 'three_to_six_months', 'De 3 a 6 meses', array['até seis meses']::text[], 30),
  ('purchase_urgency', 'six_to_twelve_months', 'De 6 a 12 meses', array['este ano']::text[], 40),
  ('purchase_urgency', 'over_twelve_months', 'Mais de 12 meses', array['ano que vem','sem pressa']::text[], 50),
  ('purchase_urgency', 'researching', 'Somente pesquisando', array['só olhando','pesquisa']::text[], 60)
) as seed(question_key, value, label, aliases, display_order)
  on seed.question_key = q.key
on conflict (question_id, value) do nothing;

insert into public.ai_config_versions (
  account_id, version, status, communication_prompt, identity_name,
  tone_config, handoff_rules, completion_message, tool_policy,
  qualification_snapshot, published_at
)
select
  a.id, 1, 'active',
  'Converse de forma humana, clara e breve. Entenda o perfil da pessoa sem transformar a conversa em interrogatório. Responda dúvidas cobertas pela base e retome a qualificação naturalmente. Depois de concluir os dados necessários, explique que existem oportunidades compatíveis e ofereça uma conversa rápida de 5 a 10 minutos com um corretor.',
  'Assistente Studiosp',
  '{"language":"pt-BR","style":"consultivo","message_length":"short"}'::jsonb,
  '{"on_request":true,"on_low_confidence":true,"on_integration_error":true}'::jsonb,
  'Encontrei oportunidades que combinam com o que você procura. Posso reservar uma conversa rápida de 5 a 10 minutos com um corretor para explicar os detalhes?',
  '{"allowed":["load_lead_context","record_qualification_answer","confirm_qualification_answer","list_property_matches","list_available_slots","reserve_guaranteed_slot","send_lead_message","create_attention_item","handoff_to_human"]}'::jsonb,
  '[]'::jsonb,
  now()
from public.accounts a
where not exists (
  select 1 from public.ai_config_versions existing
  where existing.account_id = a.id and existing.status = 'active'
);

insert into public.followup_policies (
  account_id, version, name, status, published_at
)
select a.id, 1, 'Cadência padrão', 'active', now()
from public.accounts a
where not exists (
  select 1 from public.followup_policies existing
  where existing.account_id = a.id and existing.status = 'active'
);

insert into public.scheduling_policies (
  account_id, version, status, published_at
)
select a.id, 1, 'active', now()
from public.accounts a
where not exists (
  select 1 from public.scheduling_policies existing
  where existing.account_id = a.id and existing.status = 'active'
);

insert into public.broker_profiles (
  account_id, profile_id, display_name, is_available, is_active
)
select p.account_id, p.id, p.full_name, true, true
from public.profiles p
where p.account_role = 'agent'
on conflict (account_id, profile_id) do nothing;

-- Backfill seguro: mantém o legado e cria projeções para a nova experiência.
insert into public.opportunities (
  account_id, contact_id, primary_conversation_id, stage, attention_state,
  qualification_status, meeting_status, commercial_status, source_type,
  source_metadata, lead_summary, lost_reason_id, closed_at,
  last_lead_message_at, created_at, updated_at
)
select
  c.account_id,
  c.id,
  latest_conversation.id,
  case coalesce(sdr.lead_stage, 'new')
    when 'discovering' then 'qualifying'
    when 'qualified' then 'qualified'
    when 'visit_ready' then 'awaiting_schedule'
    when 'negotiating' then 'negotiating'
    when 'handoff' then 'qualifying'
    when 'lost' then 'lost'
    else 'received'
  end,
  case when sdr.lead_stage = 'handoff' then 'human_takeover' else 'no_action' end,
    case when sdr.lead_stage in ('qualified','visit_ready','negotiating') then 'completed'
       when sdr.conversation_id is not null then 'in_progress' else 'not_started' end,
  'not_started',
  case when sdr.lead_stage = 'negotiating' then 'negotiating'
       when sdr.lead_stage = 'lost' then 'lost' else 'no_proposal' end,
  c.source_type,
  c.source_metadata,
  sdr.summary,
  case when sdr.lead_stage = 'lost' then legacy_loss.id end,
  case when sdr.lead_stage = 'lost' then coalesce(sdr.updated_at, now()) end,
  latest_conversation.last_message_at,
  coalesce(c.created_at, now()),
  coalesce(c.updated_at, now())
from public.contacts c
left join lateral (
  select conv.* from public.conversations conv
  where conv.contact_id = c.id and conv.account_id = c.account_id
  order by conv.last_message_at desc nulls last, conv.created_at desc
  limit 1
) latest_conversation on true
left join public.conversation_sdr_state sdr
  on sdr.conversation_id = latest_conversation.id
left join public.reason_definitions legacy_loss
  on legacy_loss.account_id = c.account_id
  and legacy_loss.category = 'loss'
  and legacy_loss.code = 'legacy_import'
where not exists (
  select 1 from public.opportunities existing
  where existing.account_id = c.account_id and existing.contact_id = c.id
)
on conflict do nothing;

insert into public.opportunity_events (
  account_id, opportunity_id, contact_id, conversation_id, event_type,
  to_stage, actor_type, source_type, idempotency_key, payload,
  occurred_at, created_at
)
select o.account_id, o.id, o.contact_id, o.primary_conversation_id,
  'opportunity_migrated', o.stage, 'system', 'migration',
  'legacy-opportunity:' || o.id::text,
  jsonb_build_object('source', 'contacts_and_conversation_sdr_state'),
  o.created_at, now()
from public.opportunities o
where not exists (
  select 1 from public.opportunity_events e
  where e.account_id = o.account_id
    and e.idempotency_key = 'legacy-opportunity:' || o.id::text
);

insert into public.developers (
  account_id, name, normalized_name, description
)
select distinct p.account_id, 'Incorporadora não informada',
  'incorporadora nao informada',
  'Registro temporário criado na migração do catálogo anterior.'
from public.products p
where not exists (
  select 1 from public.developers d
  where d.account_id = p.account_id
    and d.normalized_name = 'incorporadora nao informada'
    and d.is_active
);

insert into public.neighborhoods (
  account_id, name, normalized_name, city, state_code
)
select distinct
  p.account_id,
  coalesce(nullif(trim(p.neighborhood), ''), 'Bairro não informado'),
  lower(coalesce(nullif(trim(p.neighborhood), ''), 'bairro nao informado')),
  coalesce(nullif(trim(p.city), ''), 'São Paulo'),
  case when upper(left(coalesce(nullif(trim(p.state), ''), 'SP'), 2)) ~ '^[A-Z]{2}$'
       then upper(left(coalesce(nullif(trim(p.state), ''), 'SP'), 2))
       else 'SP' end
from public.products p
on conflict (account_id, normalized_name, city, state_code) do nothing;

insert into public.developments (
  account_id, developer_id, neighborhood_id, legacy_product_id,
  name, normalized_name, internal_code, description, address,
  latitude, longitude, property_timing, expected_delivery_date,
  highlights, knowledge_notes, internal_notes, status, published_at,
  terms_valid_until, created_at, updated_at
)
select
  p.account_id,
  d.id,
  n.id,
  p.id,
  coalesce(nullif(trim(p.development_name), ''), p.name),
  lower(coalesce(nullif(trim(p.development_name), ''), p.name)),
  p.sku,
  coalesce(nullif(trim(p.description), ''), p.name),
  jsonb_build_object(
    'street', p.address,
    'postal_code', p.postal_code,
    'city', p.city,
    'state', p.state
  ),
  p.latitude,
  p.longitude,
  case when p.delivery_date is not null and p.delivery_date > current_date then 'off_plan'
       when p.delivery_date is not null then 'ready' else 'both' end,
  p.delivery_date,
  p.features,
  p.payment_terms,
  'Importado do catálogo anterior.',
  case when p.is_active and p.availability_status = 'available' then 'published'
       when p.is_active then 'paused' else 'archived' end,
  case when p.is_active and p.availability_status = 'available' then now() end,
  null,
  p.created_at,
  p.updated_at
from public.products p
join public.developers d
  on d.account_id = p.account_id
  and d.normalized_name = 'incorporadora nao informada'
  and d.is_active
join public.neighborhoods n
  on n.account_id = p.account_id
  and n.normalized_name = lower(coalesce(nullif(trim(p.neighborhood), ''), 'bairro nao informado'))
  and n.city = coalesce(nullif(trim(p.city), ''), 'São Paulo')
  and n.state_code = case
    when upper(left(coalesce(nullif(trim(p.state), ''), 'SP'), 2)) ~ '^[A-Z]{2}$'
    then upper(left(coalesce(nullif(trim(p.state), ''), 'SP'), 2)) else 'SP' end
on conflict (legacy_product_id) do nothing;

insert into public.development_offers (
  account_id, development_id, label, area_min_sqm,
  price_from, currency, terms_summary, property_timing,
  valid_from, is_active, created_at, updated_at
)
select
  p.account_id, dev.id,
  case when p.area_m2 is not null then p.name || ' · ' || trim(to_char(p.area_m2, 'FM999999990D00')) || ' m²'
       else p.name end,
  coalesce(p.area_m2, 1),
  p.price,
  coalesce(nullif(p.metadata->>'currency', ''), 'BRL')::char(3),
  p.payment_terms,
  dev.property_timing,
  p.created_at::date,
  p.is_active and p.availability_status = 'available',
  p.created_at,
  p.updated_at
from public.products p
join public.developments dev on dev.legacy_product_id = p.id
where not exists (
  select 1 from public.development_offers existing
  where existing.development_id = dev.id
);

insert into public.development_media (
  account_id, development_id, legacy_product_media_id, media_type,
  category, title, description, visibility, status, is_cover,
  display_order, legacy_url, created_at, updated_at
)
select
  pm.account_id, dev.id, pm.id,
  case when pm.media_type in ('image','video','document','floor_plan')
       then pm.media_type else 'document' end,
  case when pm.media_type = 'floor_plan' then 'floor_plans'
       when pm.media_type = 'video' then 'videos'
       when pm.media_type = 'document' then 'documents'
       else 'custom' end,
  coalesce(nullif(pm.caption, ''), nullif(pm.alt_text, ''), 'Arquivo importado'),
  pm.caption, 'broker', 'published', pm.is_cover,
  pm.sort_order, pm.url, pm.created_at, pm.created_at
from public.product_media pm
join public.developments dev on dev.legacy_product_id = pm.product_id
on conflict (legacy_product_media_id) do nothing;

-- O módulo genérico de automações permanece oculto, mas ganha política de
-- leitura administrativa para não manter uma tabela RLS sem política.
drop policy if exists automation_pending_executions_admin_read
  on public.automation_pending_executions;
create policy automation_pending_executions_admin_read
on public.automation_pending_executions
for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));
grant select on public.automation_pending_executions to authenticated;

-- Extensões ficam fora do schema exposto sempre que o projeto permitir.
create schema if not exists extensions;
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';
  if v_schema = 'public' then
    alter extension vector set schema extensions;
  end if;
end $$;
grant usage on schema extensions to authenticated, service_role;
