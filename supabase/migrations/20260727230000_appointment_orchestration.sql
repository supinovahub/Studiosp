-- Qualification and scheduling must move from facts, never from model wording.

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

  select
    not exists (
      select 1
      from public.qualification_questions q
      where q.account_id = v_opportunity.account_id
        and q.is_active
        and q.is_required
        and not exists (
          select 1
          from public.qualification_answers qa
          where qa.opportunity_id = v_opportunity.id
            and qa.question_id = q.id
            and qa.is_current
            and qa.status = 'confirmed'
        )
    )
    and exists (
      select 1
      from public.qualification_answers qa
      join public.qualification_questions q on q.id = qa.question_id
      where qa.opportunity_id = v_opportunity.id
        and qa.is_current
        and qa.status = 'confirmed'
        and q.key in (
          'entry_budget',
          'monthly_installment_budget',
          'total_price_budget'
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
      jsonb_build_object('financial_requirement', 'any_budget')
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
