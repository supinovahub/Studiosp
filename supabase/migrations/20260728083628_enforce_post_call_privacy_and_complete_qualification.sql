-- Corretor perde acesso ao lead e ao inbox após a call ser finalizada.
-- Dono e perfis somente-leitura preservam a visão necessária à gestão.

create or replace function studiosp_private.can_own_conversation(
  p_account_id uuid,
  p_conversation_id uuid
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
      where o.account_id = p_account_id
        and o.primary_conversation_id = p_conversation_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_access_conversation(
  p_account_id uuid,
  p_conversation_id uuid
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
      from public.profiles p
      where p.account_id = p_account_id
        and p.user_id = (select auth.uid())
        and p.account_role = 'viewer'
    )
    or exists (
      select 1
      from public.conversations c
      join public.opportunities o
        on o.account_id = c.account_id
       and o.primary_conversation_id = c.id
      where c.account_id = p_account_id
        and c.id = p_conversation_id
        and c.status <> 'closed'
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_manage_conversation(
  p_account_id uuid,
  p_conversation_id uuid
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
      from public.conversations c
      join public.opportunities o
        on o.account_id = c.account_id
       and o.primary_conversation_id = c.id
      where c.account_id = p_account_id
        and c.id = p_conversation_id
        and c.status <> 'closed'
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_access_contact(
  p_account_id uuid,
  p_contact_id uuid
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
      from public.profiles p
      where p.account_id = p_account_id
        and p.user_id = (select auth.uid())
        and p.account_role = 'viewer'
    )
    or exists (
      select 1
      from public.opportunities o
      left join public.conversations c
        on c.account_id = o.account_id
       and c.id = o.primary_conversation_id
      where o.account_id = p_account_id
        and o.contact_id = p_contact_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
        and (o.primary_conversation_id is null or c.status <> 'closed')
    );
$$;

create or replace function studiosp_private.can_manage_contact(
  p_account_id uuid,
  p_contact_id uuid
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
      left join public.conversations c
        on c.account_id = o.account_id
       and c.id = o.primary_conversation_id
      where o.account_id = p_account_id
        and o.contact_id = p_contact_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
        and (o.primary_conversation_id is null or c.status <> 'closed')
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
      left join public.conversations c
        on c.account_id = o.account_id
       and c.id = o.primary_conversation_id
      where o.id = p_opportunity_id
        and o.account_id = p_account_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
        and (o.primary_conversation_id is null or c.status <> 'closed')
    );
$$;

alter function studiosp_private.can_own_conversation(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_access_conversation(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_manage_conversation(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_access_contact(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_manage_contact(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_access_opportunity(uuid, uuid)
  owner to postgres;

revoke all on function studiosp_private.can_own_conversation(uuid, uuid)
  from public, anon;
grant execute on function studiosp_private.can_own_conversation(uuid, uuid)
  to authenticated, service_role;

drop policy if exists conversations_update_assigned
  on public.conversations;
create policy conversations_update_assigned
on public.conversations
for update to authenticated
using (
  (select studiosp_private.can_manage_conversation(account_id, id))
)
with check (
  (select studiosp_private.can_own_conversation(account_id, id))
);

-- Uma reunião só pode ser ofertada quando todos os dados ativos da
-- qualificação estiverem confirmados. A preferência de horário é preenchida
-- durante o próprio agendamento e, portanto, não bloqueia a oferta.
create or replace function public.studiosp_finalize_qualification_if_ready(
  p_opportunity_id uuid
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.opportunities;
  v_is_service boolean := coalesce((select auth.jwt()->>'role'), '') = 'service_role';
  v_ready boolean := false;
begin
  select * into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;
  if not v_is_service
    and not studiosp_private.is_account_admin(v_opportunity.account_id)
  then
    raise exception 'Você não tem permissão para concluir esta qualificação.'
      using errcode = '42501';
  end if;

  select not exists (
    select 1
    from public.qualification_questions q
    where q.account_id = v_opportunity.account_id
      and q.is_active
      and q.key <> 'schedule_preference'
      and not exists (
        select 1
        from public.qualification_answers qa
        where qa.opportunity_id = v_opportunity.id
          and qa.question_id = q.id
          and qa.is_current
          and qa.status = 'confirmed'
      )
  )
  into v_ready;

  if v_ready then
    update public.opportunities
    set qualification_status = 'completed',
        stage = case
          when stage in ('received', 'contacting', 'qualifying')
            then 'qualified'
          else stage
        end,
        stage_changed_at = case
          when stage in ('received', 'contacting', 'qualifying')
            then now()
          else stage_changed_at
        end,
        attention_state = case
          when stage in ('received', 'contacting', 'qualifying')
            then 'no_action'
          else attention_state
        end
    where id = v_opportunity.id
    returning * into v_opportunity;

    insert into public.opportunity_events (
      account_id, opportunity_id, contact_id, conversation_id,
      event_type, to_stage, actor_type, source_type, idempotency_key, payload
    )
    values (
      v_opportunity.account_id, v_opportunity.id, v_opportunity.contact_id,
      v_opportunity.primary_conversation_id, 'qualification_completed',
      'qualified', case when v_is_service then 'ai' else 'user' end,
      case when v_is_service then 'api' else 'dashboard' end,
      'qualification-completed:' || v_opportunity.id::text,
      jsonb_build_object('requirement', 'all_active_except_schedule')
    )
    on conflict do nothing;
  end if;

  return v_opportunity;
end;
$$;

revoke all on function public.studiosp_finalize_qualification_if_ready(uuid)
from public, anon, authenticated;
grant execute on function public.studiosp_finalize_qualification_if_ready(uuid)
to service_role;
