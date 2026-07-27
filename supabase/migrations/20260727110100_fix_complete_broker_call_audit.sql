create or replace function public.studiosp_complete_broker_call(
  p_opportunity_id uuid,
  p_expected_stage text,
  p_outcome text,
  p_notes text default null,
  p_reason_id uuid default null
)
returns public.opportunities
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opportunity public.opportunities;
begin
  if p_outcome not in ('follow_up', 'proposal_sent', 'negotiating', 'not_interested') then
    raise exception 'Resultado da call inválido.' using errcode = '23514';
  end if;

  v_opportunity := public.studiosp_apply_opportunity_event(
    p_opportunity_id, 'meeting_completed', p_expected_stage,
    jsonb_build_object('call_outcome', p_outcome), gen_random_uuid()::text,
    'dashboard', p_notes
  );

  if p_outcome = 'proposal_sent' then
    v_opportunity := public.studiosp_apply_opportunity_event(
      p_opportunity_id, 'proposal_sent', v_opportunity.stage,
      jsonb_build_object('call_outcome', p_outcome), gen_random_uuid()::text,
      'dashboard', p_notes
    );
  elsif p_outcome = 'negotiating' then
    v_opportunity := public.studiosp_apply_opportunity_event(
      p_opportunity_id, 'negotiation_started', v_opportunity.stage,
      jsonb_build_object('call_outcome', p_outcome), gen_random_uuid()::text,
      'dashboard', p_notes
    );
  elsif p_outcome = 'not_interested' then
    v_opportunity := public.studiosp_apply_opportunity_event(
      p_opportunity_id, 'lead_lost', v_opportunity.stage,
      jsonb_build_object('call_outcome', p_outcome, 'reason_id', p_reason_id),
      gen_random_uuid()::text, 'dashboard', p_notes
    );
  end if;

  update public.conversations
  set status = 'closed', updated_at = now()
  where id = v_opportunity.primary_conversation_id
    and account_id = v_opportunity.account_id;

  return v_opportunity;
end;
$$;

revoke all on function public.studiosp_complete_broker_call(
  uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.studiosp_complete_broker_call(
  uuid, text, text, text, uuid
) to authenticated;
