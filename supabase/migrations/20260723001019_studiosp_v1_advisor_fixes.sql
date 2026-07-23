-- Studiosp V1: ajustes derivados dos advisors do Supabase.

-- Evita que políticas administrativas FOR ALL também sejam avaliadas em SELECT.
drop policy if exists qualification_questions_admin_all on public.qualification_questions;
drop policy if exists qualification_options_admin_all on public.qualification_question_options;
drop policy if exists ai_config_versions_owner_write on public.ai_config_versions;
drop policy if exists followup_policies_admin_all on public.followup_policies;
drop policy if exists developers_admin_all on public.developers;
drop policy if exists neighborhoods_admin_all on public.neighborhoods;
drop policy if exists neighborhood_aliases_admin_all on public.neighborhood_aliases;
drop policy if exists developments_admin_all on public.developments;
drop policy if exists development_offers_admin_all on public.development_offers;
drop policy if exists development_media_admin_all on public.development_media;
drop policy if exists development_media_versions_admin_all on public.development_media_versions;
drop policy if exists scheduling_policies_admin_all on public.scheduling_policies;
drop policy if exists guaranteed_windows_admin_all on public.guaranteed_windows;
drop policy if exists availability_exceptions_admin_all on public.availability_exceptions;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'qualification_questions',
    'qualification_question_options',
    'ai_config_versions',
    'followup_policies',
    'developers',
    'neighborhoods',
    'neighborhood_aliases',
    'developments',
    'development_offers',
    'development_media',
    'development_media_versions',
    'scheduling_policies',
    'guaranteed_windows',
    'availability_exceptions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select studiosp_private.is_account_admin(account_id)))',
      v_table || '_admin_insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select studiosp_private.is_account_admin(account_id))) with check ((select studiosp_private.is_account_admin(account_id)))',
      v_table || '_admin_update', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select studiosp_private.is_account_admin(account_id)))',
      v_table || '_admin_delete', v_table
    );
  end loop;
end $$;

-- Índices completos para as chaves estrangeiras compostas e para o corretor da reunião.
create index if not exists broker_profiles_profile_account_idx
  on public.broker_profiles(profile_id, account_id);
create index if not exists opportunities_contact_account_idx
  on public.opportunities(contact_id, account_id);
create index if not exists opportunities_conversation_account_idx
  on public.opportunities(primary_conversation_id, account_id);
create index if not exists opportunities_broker_account_idx
  on public.opportunities(assigned_broker_id, account_id);
create index if not exists opportunities_reason_account_idx
  on public.opportunities(lost_reason_id, account_id);
create index if not exists appointments_broker_profile_id_idx
  on public.appointments(broker_profile_id);

-- Operações originadas exclusivamente por webhooks/IA não ficam expostas ao cliente.
revoke execute on function public.studiosp_create_opportunity(
  uuid, uuid, text, jsonb, text
) from authenticated;
revoke execute on function public.studiosp_record_qualification_answer(
  uuid, uuid, text, jsonb, numeric, text, uuid, uuid, text
) from authenticated;
revoke execute on function public.studiosp_reserve_guaranteed_slot(
  uuid, uuid, text, text
) from authenticated;
