alter table public.developments
  add column if not exists submission_status text not null default 'draft',
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.developments
  drop constraint if exists developments_submission_status_check,
  add constraint developments_submission_status_check
    check (submission_status in ('draft', 'pending', 'approved', 'rejected'));

update public.developments
set submission_status = case
  when status = 'published' then 'approved'
  else 'draft'
end
where submission_status = 'draft';

create index if not exists developments_submission_queue_idx
  on public.developments(account_id, submission_status, submitted_at desc)
  where submission_status = 'pending';

drop policy if exists developments_read on public.developments;
create policy developments_read on public.developments
for select to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (
    status = 'published'
    and (select studiosp_private.is_account_member(account_id))
  )
  or (
    created_by = (
      select p.id
      from public.profiles p
      where p.account_id = developments.account_id
        and p.user_id = (select auth.uid())
      limit 1
    )
    and status = 'draft'
  )
);

drop policy if exists developments_agent_insert on public.developments;
create policy developments_agent_insert on public.developments
for insert to authenticated
with check (
  status = 'draft'
  and submission_status = 'draft'
  and created_by = (
    select p.id
    from public.profiles p
    where p.account_id = developments.account_id
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
    limit 1
  )
);

drop policy if exists developments_agent_update_own_draft on public.developments;
create policy developments_agent_update_own_draft on public.developments
for update to authenticated
using (
  status = 'draft'
  and submission_status in ('draft', 'rejected')
  and created_by = (
    select p.id
    from public.profiles p
    where p.account_id = developments.account_id
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
    limit 1
  )
)
with check (
  status = 'draft'
  and submission_status in ('draft', 'pending', 'rejected')
  and created_by = (
    select p.id
    from public.profiles p
    where p.account_id = developments.account_id
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
    limit 1
  )
);

drop policy if exists developers_agent_insert on public.developers;
create policy developers_agent_insert on public.developers
for insert to authenticated
with check (
  created_by = (
    select p.id from public.profiles p
    where p.account_id = developers.account_id
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
    limit 1
  )
);

drop policy if exists neighborhoods_agent_insert on public.neighborhoods;
create policy neighborhoods_agent_insert on public.neighborhoods
for insert to authenticated
with check (
  created_by = (
    select p.id from public.profiles p
    where p.account_id = neighborhoods.account_id
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
    limit 1
  )
);

drop policy if exists development_offers_agent_write_own_draft
  on public.development_offers;
create policy development_offers_agent_write_own_draft
on public.development_offers
for all to authenticated
using (
  exists (
    select 1
    from public.developments d
    join public.profiles p on p.id = d.created_by
    where d.id = development_offers.development_id
      and d.account_id = development_offers.account_id
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
)
with check (
  exists (
    select 1
    from public.developments d
    join public.profiles p on p.id = d.created_by
    where d.id = development_offers.development_id
      and d.account_id = development_offers.account_id
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
);

drop policy if exists development_media_agent_write_own_draft
  on public.development_media;
create policy development_media_agent_write_own_draft
on public.development_media
for all to authenticated
using (
  exists (
    select 1
    from public.developments d
    join public.profiles p on p.id = d.created_by
    where d.id = development_media.development_id
      and d.account_id = development_media.account_id
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
)
with check (
  exists (
    select 1
    from public.developments d
    join public.profiles p on p.id = d.created_by
    where d.id = development_media.development_id
      and d.account_id = development_media.account_id
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
);

drop policy if exists development_media_versions_agent_write_own_draft
  on public.development_media_versions;
create policy development_media_versions_agent_write_own_draft
on public.development_media_versions
for all to authenticated
using (
  exists (
    select 1
    from public.development_media dm
    join public.developments d on d.id = dm.development_id
    join public.profiles p on p.id = d.created_by
    where dm.id = development_media_versions.media_id
      and dm.account_id = development_media_versions.account_id
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
)
with check (
  exists (
    select 1
    from public.development_media dm
    join public.developments d on d.id = dm.development_id
    join public.profiles p on p.id = d.created_by
    where dm.id = development_media_versions.media_id
      and dm.account_id = development_media_versions.account_id
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
);

drop policy if exists development_media_storage_insert_agent
  on storage.objects;
create policy development_media_storage_insert_agent on storage.objects
for insert to authenticated
with check (
  bucket_id = 'development-media'
  and exists (
    select 1
    from public.developments d
    join public.profiles p on p.id = d.created_by
    where d.account_id =
        studiosp_private.safe_uuid((storage.foldername(name))[1])
      and d.id = studiosp_private.safe_uuid((storage.foldername(name))[2])
      and d.status = 'draft'
      and d.submission_status in ('draft', 'rejected')
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
);

drop policy if exists attention_items_catalog_submission_insert
  on public.attention_items;
create policy attention_items_catalog_submission_insert
on public.attention_items
for insert to authenticated
with check (
  kind = 'development_review'
  and assigned_role = 'owner'
  and exists (
    select 1
    from public.developments d
    join public.profiles p on p.id = d.created_by
    where d.id = studiosp_private.safe_uuid(context->>'development_id')
      and d.account_id = attention_items.account_id
      and d.status = 'draft'
      and p.user_id = (select auth.uid())
      and p.account_role = 'agent'
  )
);

create or replace function public.studiosp_submit_development(
  p_development_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_development public.developments%rowtype;
  v_profile_id uuid;
  v_attention_id uuid;
begin
  select p.id
  into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.account_role = 'agent'
  limit 1;

  if v_profile_id is null then
    raise exception 'Somente corretores podem enviar imóveis para revisão.';
  end if;

  select d.*
  into v_development
  from public.developments d
  where d.id = p_development_id
    and d.created_by = v_profile_id
    and d.status = 'draft'
    and d.submission_status in ('draft', 'rejected')
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

create or replace function public.studiosp_review_development(
  p_development_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_development public.developments%rowtype;
  v_profile_id uuid;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Informe se deseja aprovar ou reprovar.';
  end if;
  if p_decision = 'reject' and nullif(btrim(p_reason), '') is null then
    raise exception 'Informe o motivo da reprovação.';
  end if;

  select d.*
  into v_development
  from public.developments d
  where d.id = p_development_id
    and d.submission_status = 'pending'
  for update;

  if v_development.id is null then
    raise exception 'Esta solicitação não está mais pendente.';
  end if;
  if not (select studiosp_private.is_account_admin(v_development.account_id)) then
    raise exception 'Somente o dono pode revisar este imóvel.';
  end if;

  select p.id
  into v_profile_id
  from public.profiles p
  where p.account_id = v_development.account_id
    and p.user_id = (select auth.uid())
  limit 1;

  if p_decision = 'approve' then
    perform public.studiosp_publish_development(v_development.id);

    update public.developments
    set submission_status = 'approved',
        reviewed_by = v_profile_id,
        reviewed_at = now(),
        rejection_reason = null,
        updated_by = v_profile_id
    where id = v_development.id;

    update public.development_media
    set status = 'published'
    where account_id = v_development.account_id
      and development_id = v_development.id
      and status <> 'archived';
  else
    update public.developments
    set submission_status = 'rejected',
        reviewed_by = v_profile_id,
        reviewed_at = now(),
        rejection_reason = btrim(p_reason),
        updated_by = v_profile_id
    where id = v_development.id;
  end if;

  update public.attention_items
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_profile_id,
      resolution = jsonb_build_object(
        'decision', p_decision,
        'reason', nullif(btrim(p_reason), '')
      )
  where account_id = v_development.account_id
    and deduplication_key = 'development_review:' || v_development.id
    and status in ('open', 'snoozed');

  return jsonb_build_object(
    'development_id', v_development.id,
    'submission_status',
      case when p_decision = 'approve' then 'approved' else 'rejected' end
  );
end;
$$;

revoke all on function public.studiosp_submit_development(uuid) from public;
revoke all on function public.studiosp_review_development(uuid, text, text) from public;
grant execute on function public.studiosp_submit_development(uuid) to authenticated;
grant execute on function public.studiosp_review_development(uuid, text, text) to authenticated;
