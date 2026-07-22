-- Studiosp production hardening.
-- Keep only the RPC privileges required by the application, prevent direct
-- execution of trigger/maintenance functions and remove bucket-listing
-- policies that are unnecessary for public object URLs.

-- Stable function lookup prevents role-controlled objects from shadowing
-- names referenced by these functions.
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;
ALTER FUNCTION public._bcast_cols_for_status(TEXT)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ai_configs_updated_at()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ai_knowledge_documents_updated_at()
  SET search_path = public, pg_temp;

-- Trigger-only and maintenance functions must not be directly callable from
-- the Data API. Triggers continue to execute them normally.
REVOKE ALL ON FUNCTION public._bcast_bump(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_recipient_aggregate_trigger()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_duplicate_conversations()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_conversation_assigned()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_broadcast_counts(UUID)
  FROM PUBLIC, anon, authenticated;

-- These mutation helpers are server-only. Explicit revokes are required
-- because PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
REVOKE ALL ON FUNCTION public.claim_ai_reply_slot(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(UUID, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.record_webhook_failure(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(UUID, INTEGER)
  TO service_role;

-- Authenticated RPCs perform their own auth.uid() and membership checks.
-- Remove the accidental anonymous privilege while preserving their intended
-- authenticated access.
REVOKE ALL ON FUNCTION public.is_account_member(UUID, public.account_role_enum)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, public.account_role_enum)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.remove_account_member(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_member_role(UUID, public.account_role_enum)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, public.account_role_enum)
  TO authenticated;

REVOKE ALL ON FUNCTION public.touch_presence(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID)
  TO authenticated;

-- Public buckets already expose individual public object URLs. Broad SELECT
-- policies additionally allow clients to enumerate every stored object and
-- are therefore intentionally removed.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
