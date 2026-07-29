-- Dashboard offers do not require a verified broker WhatsApp. Keep WhatsApp
-- as an optional second notification channel without excluding the broker
-- from routing.

DO $migration$
DECLARE
  v_definition TEXT;
  v_without_whatsapp_guard TEXT;
  v_with_channel_selection TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'studiosp_respond_assignment_offer';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'studiosp_respond_assignment_offer was not found';
  END IF;

  v_without_whatsapp_guard := replace(
    v_definition,
    E'\n      and bp.whatsapp_verified_at is not null',
    ''
  );

  IF v_without_whatsapp_guard = v_definition THEN
    IF v_definition LIKE '%else ''dashboard''%' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected WhatsApp eligibility guard was not found';
  END IF;

  v_with_channel_selection := replace(
    v_without_whatsapp_guard,
    E'v_next_order, ''both'',\n        least(',
    E'v_next_order,\n        case\n          when exists (\n            select 1\n            from public.broker_profiles channel_broker\n            where channel_broker.id = v_next_broker_id\n              and channel_broker.whatsapp_verified_at is not null\n          ) then ''both''\n          else ''dashboard''\n        end,\n        least('
  );

  IF v_with_channel_selection = v_without_whatsapp_guard THEN
    RAISE EXCEPTION 'Expected assignment offer channel expression was not found';
  END IF;

  EXECUTE v_with_channel_selection;
END;
$migration$;

REVOKE ALL ON FUNCTION public.studiosp_respond_assignment_offer(
  UUID, TEXT, UUID, TEXT, UUID, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studiosp_respond_assignment_offer(
  UUID, TEXT, UUID, TEXT, UUID, TEXT
) TO authenticated, service_role;
