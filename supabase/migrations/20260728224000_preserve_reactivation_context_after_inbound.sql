-- Keep the reactivation session active after the first inbound so Pedro can
-- use its known context. Only the campaign cadence is cancelled immediately.

create or replace function public.studiosp_cancel_reactivation_on_inbound(
  p_account_id uuid,
  p_contact_id uuid,
  p_conversation_id uuid,
  p_trigger_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.reactivation_sessions;
  v_cancelled integer := 0;
begin
  select * into v_session
  from public.reactivation_sessions
  where account_id = p_account_id
    and contact_id = p_contact_id
    and conversation_id = p_conversation_id
    and status = 'active'
  order by started_at desc
  limit 1
  for update;

  if not found or v_session.replied_at is not null then
    return 0;
  end if;

  update public.reactivation_touches
  set status = 'cancelled',
      last_error = 'lead_replied',
      claimed_at = null,
      worker_id = null
  where account_id = p_account_id
    and reactivation_lead_id = v_session.reactivation_lead_id
    and status in ('scheduled', 'processing');
  get diagnostics v_cancelled = row_count;

  update public.reactivation_leads
  set status = 'replied'
  where account_id = p_account_id
    and id = v_session.reactivation_lead_id
    and status in ('queued', 'contacted');

  update public.reactivation_sessions
  set replied_at = now(),
      cooldown_until = null
  where id = v_session.id
    and status = 'active';

  insert into public.reactivation_events (
    account_id,
    campaign_id,
    reactivation_lead_id,
    event_type,
    actor_type,
    payload
  )
  values (
    p_account_id,
    v_session.campaign_id,
    v_session.reactivation_lead_id,
    'lead_replied_cadence_cancelled',
    'lead',
    jsonb_build_object(
      'conversation_id', p_conversation_id,
      'trigger_message_id', p_trigger_message_id,
      'cancelled_touches', v_cancelled
    )
  );

  return v_cancelled;
end;
$$;

revoke all on function public.studiosp_cancel_reactivation_on_inbound(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.studiosp_cancel_reactivation_on_inbound(
  uuid, uuid, uuid, uuid
) to service_role;
