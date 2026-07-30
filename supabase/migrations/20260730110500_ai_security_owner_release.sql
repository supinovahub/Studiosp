create or replace function public.studiosp_release_ai_security_lock(
  p_conversation_id uuid,
  p_attention_id uuid,
  p_justification text
)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_conversation public.conversations;
  v_released public.conversations;
  v_released_at timestamptz := now();
  v_next_context_version bigint;
begin
  select *
    into v_profile
  from public.profiles
  where user_id = auth.uid()
    and account_role = 'owner'
  limit 1;

  if v_profile.id is null then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_justification, ''))) < 5 then
    raise exception 'justification_required' using errcode = '22023';
  end if;

  select *
    into v_conversation
  from public.conversations
  where id = p_conversation_id
    and account_id = v_profile.account_id
  for update;

  if v_conversation.id is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if coalesce(v_conversation.ai_control_reason, '') not like 'ai_security_%' then
    raise exception 'security_lock_not_active' using errcode = '55000';
  end if;

  perform 1
  from public.attention_items
  where id = p_attention_id
    and account_id = v_profile.account_id
    and kind = 'ai_security_review'
    and status in ('open', 'snoozed')
  for update;
  if not found then
    raise exception 'security_attention_not_found' using errcode = 'P0002';
  end if;

  v_next_context_version := v_conversation.ai_context_version + 1;
  update public.conversations
  set
    ai_autoreply_disabled = false,
    ai_control_mode = 'ai_active',
    ai_control_reason = null,
    ai_control_changed_at = v_released_at,
    ai_processing_status = 'idle',
    ai_processing_reason = 'owner_security_release',
    ai_context_started_at = v_released_at,
    ai_context_version = v_next_context_version
  where id = v_conversation.id
  returning * into v_released;

  update public.attention_items
  set
    status = 'resolved',
    resolved_at = v_released_at,
    resolved_by = v_profile.id,
    resolution = jsonb_build_object(
      'outcome', 'owner_released_ai_security_lock',
      'justification', trim(p_justification)
    )
  where id = p_attention_id;

  insert into public.ai_security_events (
    account_id,
    conversation_id,
    event_type,
    severity,
    detector_version,
    signals,
    metadata
  ) values (
    v_profile.account_id,
    v_conversation.id,
    'ai_security_lock_released',
    'info',
    'hybrid-domain-v1',
    array['owner_release']::text[],
    jsonb_build_object(
      'owner_profile_id', v_profile.id,
      'justification', trim(p_justification),
      'new_context_version', v_next_context_version
    )
  );

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    previous_data,
    next_data,
    reason
  ) values (
    v_profile.account_id,
    'user',
    v_profile.id,
    'ai_security_lock_released',
    'conversation',
    v_conversation.id,
    jsonb_build_object(
      'ai_control_mode', v_conversation.ai_control_mode,
      'ai_control_reason', v_conversation.ai_control_reason
    ),
    jsonb_build_object(
      'ai_control_mode', 'ai_active',
      'ai_context_version', v_next_context_version
    ),
    trim(p_justification)
  );

  return v_released;
end;
$$;

revoke all on function public.studiosp_release_ai_security_lock(uuid, uuid, text)
  from public, anon;
grant execute on function public.studiosp_release_ai_security_lock(uuid, uuid, text)
  to authenticated;
