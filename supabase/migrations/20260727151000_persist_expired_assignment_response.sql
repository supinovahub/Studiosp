-- Raising after marking a late offer as expired rolls the UPDATE back. Return
-- the terminal offer instead so a late response cannot leave it pending.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
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

  v_fixed_definition := replace(
    v_definition,
    E'    raise exception ''O prazo desta oferta terminou.'' using errcode = ''23514'';',
    E'    return v_offer;'
  );

  IF v_fixed_definition = v_definition THEN
    IF v_definition LIKE '%if v_offer.expires_at <= now() then%'
       AND v_definition LIKE '%return v_offer;%' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected late-response exception was not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.studiosp_respond_assignment_offer(
  UUID, TEXT, UUID, TEXT, UUID, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studiosp_respond_assignment_offer(
  UUID, TEXT, UUID, TEXT, UUID, TEXT
) TO authenticated, service_role;
