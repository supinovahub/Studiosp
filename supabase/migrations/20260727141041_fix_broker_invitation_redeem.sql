-- Allow a freshly signed-up agent to redeem an account invitation.
--
-- Signup creates both a personal account and a broker_profiles row. The
-- composite FK broker_profiles(profile_id, account_id) prevents moving the
-- profile until that generated broker row is handled. Preserve its harmless
-- configuration, move the profile atomically, and recreate the broker inside
-- the destination account. Accounts with operational data remain protected.

CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_profile_id UUID;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
  v_broker broker_profiles%ROWTYPE;
  v_had_broker BOOLEAN := FALSE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.account_id, a.owner_user_id
  INTO v_profile_id, v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM opportunities WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM appointments WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM assignment_offers WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM scheduling_policies WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_broker
  FROM broker_profiles
  WHERE profile_id = v_profile_id
    AND account_id = v_old_account_id
  FOR UPDATE;
  v_had_broker := FOUND;

  -- This row is generated at signup and contains no operational history due
  -- to the guard above. Removing it releases the composite profile/account FK.
  IF v_had_broker THEN
    DELETE FROM broker_profiles WHERE id = v_broker.id;
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE id = v_profile_id;

  IF v_inv.role = 'agent' THEN
    INSERT INTO broker_profiles (
      account_id,
      profile_id,
      display_name,
      whatsapp_e164,
      whatsapp_verified_at,
      max_parallel_assignments,
      routing_priority,
      is_available,
      is_active,
      unavailable_until,
      notification_preferences
    ) VALUES (
      v_inv.account_id,
      v_profile_id,
      COALESCE(NULLIF(TRIM(v_broker.display_name), ''), 'Corretor'),
      v_broker.whatsapp_e164,
      v_broker.whatsapp_verified_at,
      COALESCE(v_broker.max_parallel_assignments, 1),
      COALESCE(v_broker.routing_priority, 100),
      COALESCE(v_broker.is_available, TRUE),
      COALESCE(v_broker.is_active, TRUE),
      v_broker.unavailable_until,
      COALESCE(v_broker.notification_preferences, '{}'::JSONB)
    );
  END IF;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
