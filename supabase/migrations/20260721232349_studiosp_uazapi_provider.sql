-- Studiosp can operate with either the official Meta Cloud API or uazapiGO.
-- Provider credentials remain encrypted in access_token by the application.
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS uazapi_base_url TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_instance_name TEXT;

ALTER TABLE public.whatsapp_config
  ALTER COLUMN phone_number_id DROP NOT NULL;

ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_provider_check,
  ADD CONSTRAINT whatsapp_config_provider_check
    CHECK (provider IN ('meta', 'uazapi'));

ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_status_check,
  ADD CONSTRAINT whatsapp_config_status_check
    CHECK (status IN ('connected', 'connecting', 'disconnected', 'hibernated'));

ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_provider_fields_check,
  ADD CONSTRAINT whatsapp_config_provider_fields_check CHECK (
    (provider = 'meta' AND NULLIF(BTRIM(phone_number_id), '') IS NOT NULL)
    OR
    (
      provider = 'uazapi'
      AND NULLIF(BTRIM(uazapi_base_url), '') IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_uazapi_instance_unique
  ON public.whatsapp_config (uazapi_base_url, uazapi_instance_id)
  WHERE provider = 'uazapi' AND uazapi_instance_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_config.provider IS
  'WhatsApp transport provider: official Meta Cloud API or uazapiGO.';
COMMENT ON COLUMN public.whatsapp_config.uazapi_base_url IS
  'Base URL of the uazapiGO server. Never includes the instance token.';
COMMENT ON COLUMN public.whatsapp_config.uazapi_instance_id IS
  'Instance identifier reported by uazapiGO.';

-- Supabase projects created after 2026-04-28 do not expose new tables to the
-- Data API automatically. RLS remains the row-level authorization boundary;
-- these grants only make the existing policies reachable by authenticated
-- clients. Anonymous users receive no direct table privileges.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

ALTER TABLE public.accounts
  ALTER COLUMN default_currency SET DEFAULT 'BRL';
ALTER TABLE public.deals
  ALTER COLUMN currency SET DEFAULT 'BRL';
UPDATE public.accounts SET default_currency = 'BRL' WHERE default_currency = 'USD';
