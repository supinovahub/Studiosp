drop policy if exists development_media_storage_insert_agent
  on storage.objects;

create policy development_media_storage_insert_agent on storage.objects
for insert to authenticated
with check (
  bucket_id = 'development-media'
  and exists (
    select 1
    from public.developments development
    join public.profiles creator on creator.id = development.created_by
    where development.account_id =
        studiosp_private.safe_uuid((storage.foldername(storage.objects.name))[1])
      and development.id =
        studiosp_private.safe_uuid((storage.foldername(storage.objects.name))[2])
      and development.status = 'draft'
      and development.submission_status in ('draft', 'rejected')
      and creator.user_id = (select auth.uid())
      and creator.account_role = 'agent'
  )
);

drop policy if exists development_media_storage_delete_agent
  on storage.objects;

create policy development_media_storage_delete_agent on storage.objects
for delete to authenticated
using (
  bucket_id = 'development-media'
  and exists (
    select 1
    from public.developments development
    join public.profiles creator on creator.id = development.created_by
    where development.account_id =
        studiosp_private.safe_uuid((storage.foldername(storage.objects.name))[1])
      and development.id =
        studiosp_private.safe_uuid((storage.foldername(storage.objects.name))[2])
      and development.status = 'draft'
      and development.submission_status in ('draft', 'rejected')
      and creator.user_id = (select auth.uid())
      and creator.account_role = 'agent'
  )
);

revoke insert, update on public.attention_items from authenticated;

alter function public.studiosp_submit_development(uuid)
  security definer;

alter function public.studiosp_review_development(uuid, text, text)
  security definer;

drop policy if exists development_offers_agent_read_own_submission
  on public.development_offers;
create policy development_offers_agent_read_own_submission
on public.development_offers
for select to authenticated
using (
  exists (
    select 1
    from public.developments development
    join public.profiles creator on creator.id = development.created_by
    where development.id = development_offers.development_id
      and development.account_id = development_offers.account_id
      and development.submission_status in ('draft', 'pending', 'rejected')
      and creator.user_id = (select auth.uid())
      and creator.account_role = 'agent'
  )
);

drop policy if exists development_media_agent_read_own_submission
  on public.development_media;
create policy development_media_agent_read_own_submission
on public.development_media
for select to authenticated
using (
  exists (
    select 1
    from public.developments development
    join public.profiles creator on creator.id = development.created_by
    where development.id = development_media.development_id
      and development.account_id = development_media.account_id
      and development.submission_status in ('draft', 'pending', 'rejected')
      and creator.user_id = (select auth.uid())
      and creator.account_role = 'agent'
  )
);

drop policy if exists development_media_versions_agent_read_own_submission
  on public.development_media_versions;
create policy development_media_versions_agent_read_own_submission
on public.development_media_versions
for select to authenticated
using (
  exists (
    select 1
    from public.development_media media
    join public.developments development
      on development.id = media.development_id
    join public.profiles creator on creator.id = development.created_by
    where media.id = development_media_versions.media_id
      and media.account_id = development_media_versions.account_id
      and development.submission_status in ('draft', 'pending', 'rejected')
      and creator.user_id = (select auth.uid())
      and creator.account_role = 'agent'
  )
);

create or replace function public.studiosp_submit_development(
  p_development_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_development public.developments%rowtype;
  v_profile_id uuid;
  v_attention_id uuid;
begin
  select profile.id
  into v_profile_id
  from public.profiles profile
  where profile.user_id = (select auth.uid())
    and profile.account_role = 'agent'
  limit 1;

  if v_profile_id is null then
    raise exception 'Somente corretores podem enviar imóveis para revisão.';
  end if;

  select development.*
  into v_development
  from public.developments development
  where development.id = p_development_id
    and development.created_by = v_profile_id
    and development.status = 'draft'
    and development.submission_status in ('draft', 'rejected')
  for update;

  if v_development.id is null then
    raise exception 'Rascunho não encontrado ou já enviado para revisão.';
  end if;

  insert into public.attention_items (
    account_id,
    assigned_role,
    kind,
    severity,
    status,
    title,
    context,
    deduplication_key
  )
  values (
    v_development.account_id,
    'owner',
    'development_review',
    'warning',
    'open',
    'Revisar cadastro: ' || v_development.name,
    jsonb_build_object(
      'development_id', v_development.id,
      'submitted_by', v_profile_id
    ),
    'development_review:' || v_development.id
  )
  returning id into v_attention_id;

  update public.developments
  set submission_status = 'pending',
      submitted_by = v_profile_id,
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      rejection_reason = null,
      updated_by = v_profile_id
  where id = v_development.id;

  return jsonb_build_object(
    'development_id', v_development.id,
    'attention_id', v_attention_id,
    'submission_status', 'pending'
  );
end;
$$;

revoke all on function public.studiosp_submit_development(uuid) from public;
grant execute on function public.studiosp_submit_development(uuid)
  to authenticated;
