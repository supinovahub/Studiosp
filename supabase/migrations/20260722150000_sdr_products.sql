-- ============================================================
-- SDR imobiliário: catálogo de produtos, mídia e qualificação de leads.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  development_name text,
  property_type text NOT NULL DEFAULT 'studio' CHECK (
    property_type IN ('studio', 'apartment', 'house', 'commercial', 'land', 'other')
  ),
  availability_status text NOT NULL DEFAULT 'available' CHECK (
    availability_status IN ('available', 'reserved', 'sold', 'inactive')
  ),
  description text,
  address text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  price numeric(14, 2) CHECK (price IS NULL OR price >= 0),
  condo_fee numeric(12, 2) CHECK (condo_fee IS NULL OR condo_fee >= 0),
  property_tax numeric(12, 2) CHECK (property_tax IS NULL OR property_tax >= 0),
  area_m2 numeric(10, 2) CHECK (area_m2 IS NULL OR area_m2 > 0),
  bedrooms smallint CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms smallint CHECK (bathrooms IS NULL OR bathrooms >= 0),
  parking_spaces smallint CHECK (parking_spaces IS NULL OR parking_spaces >= 0),
  floor_number smallint,
  delivery_date date,
  features text[] NOT NULL DEFAULT ARRAY[]::text[],
  payment_terms text,
  public_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, sku)
);

CREATE TABLE IF NOT EXISTS product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'image' CHECK (
    media_type IN ('image', 'video', 'document', 'floor_plan')
  ),
  url text NOT NULL CHECK (url ~ '^https://'),
  alt_text text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_sdr_state (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  primary_intent text NOT NULL DEFAULT 'other',
  intents text[] NOT NULL DEFAULT ARRAY[]::text[],
  lead_stage text NOT NULL DEFAULT 'new' CHECK (
    lead_stage IN ('new', 'discovering', 'qualified', 'visit_ready', 'negotiating', 'handoff', 'lost')
  ),
  temperature text NOT NULL DEFAULT 'cold' CHECK (
    temperature IN ('cold', 'warm', 'hot')
  ),
  score smallint NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  budget_min numeric(14, 2) CHECK (budget_min IS NULL OR budget_min >= 0),
  budget_max numeric(14, 2) CHECK (budget_max IS NULL OR budget_max >= 0),
  preferred_cities text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_neighborhoods text[] NOT NULL DEFAULT ARRAY[]::text[],
  property_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  min_bedrooms smallint CHECK (min_bedrooms IS NULL OR min_bedrooms >= 0),
  min_area_m2 numeric(10, 2) CHECK (min_area_m2 IS NULL OR min_area_m2 > 0),
  needs_parking boolean,
  financing_interest boolean,
  purchase_timeframe text,
  wants_photos boolean NOT NULL DEFAULT false,
  summary text,
  next_best_action text,
  recommended_product_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  confidence numeric(4, 3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  last_classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_sdr_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_product_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  response_text text,
  outcome text NOT NULL DEFAULT 'classified' CHECK (
    outcome IN ('classified', 'replied', 'handoff', 'failed')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_account_active_status
  ON products(account_id, is_active, availability_status);
CREATE INDEX IF NOT EXISTS idx_products_account_price
  ON products(account_id, price) WHERE is_active AND availability_status = 'available';
CREATE INDEX IF NOT EXISTS idx_products_account_location
  ON products(account_id, city, neighborhood) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_product_media_product_order
  ON product_media(product_id, sort_order, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_media_one_cover
  ON product_media(product_id) WHERE is_cover;
CREATE INDEX IF NOT EXISTS idx_sdr_state_account_stage
  ON conversation_sdr_state(account_id, lead_stage, score DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_events_conversation_created
  ON ai_sdr_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_events_account_created
  ON ai_sdr_events(account_id, created_at DESC);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sdr_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sdr_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products FOR SELECT TO authenticated
  USING ((SELECT is_account_member(account_id)));
DROP POLICY IF EXISTS products_insert ON products;
CREATE POLICY products_insert ON products FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_account_member(account_id, 'admin')));
DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products FOR UPDATE TO authenticated
  USING ((SELECT is_account_member(account_id, 'admin')))
  WITH CHECK ((SELECT is_account_member(account_id, 'admin')));
DROP POLICY IF EXISTS products_delete ON products;
CREATE POLICY products_delete ON products FOR DELETE TO authenticated
  USING ((SELECT is_account_member(account_id, 'admin')));

DROP POLICY IF EXISTS product_media_select ON product_media;
CREATE POLICY product_media_select ON product_media FOR SELECT TO authenticated
  USING ((SELECT is_account_member(account_id)));
DROP POLICY IF EXISTS product_media_insert ON product_media;
CREATE POLICY product_media_insert ON product_media FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_account_member(account_id, 'admin'))
    AND EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_id AND p.account_id = product_media.account_id
    )
  );
DROP POLICY IF EXISTS product_media_update ON product_media;
CREATE POLICY product_media_update ON product_media FOR UPDATE TO authenticated
  USING ((SELECT is_account_member(account_id, 'admin')))
  WITH CHECK ((SELECT is_account_member(account_id, 'admin')));
DROP POLICY IF EXISTS product_media_delete ON product_media;
CREATE POLICY product_media_delete ON product_media FOR DELETE TO authenticated
  USING ((SELECT is_account_member(account_id, 'admin')));

DROP POLICY IF EXISTS conversation_sdr_state_select ON conversation_sdr_state;
CREATE POLICY conversation_sdr_state_select ON conversation_sdr_state FOR SELECT TO authenticated
  USING ((SELECT is_account_member(account_id)));
DROP POLICY IF EXISTS conversation_sdr_state_write ON conversation_sdr_state;
CREATE POLICY conversation_sdr_state_write ON conversation_sdr_state FOR ALL TO authenticated
  USING ((SELECT is_account_member(account_id, 'agent')))
  WITH CHECK ((SELECT is_account_member(account_id, 'agent')));

DROP POLICY IF EXISTS ai_sdr_events_select ON ai_sdr_events;
CREATE POLICY ai_sdr_events_select ON ai_sdr_events FOR SELECT TO authenticated
  USING ((SELECT is_account_member(account_id)));

-- Explicit grants are required by Supabase's 2026 Data API defaults.
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_sdr_state TO authenticated;
GRANT SELECT ON ai_sdr_events TO authenticated;
GRANT ALL ON products, product_media, conversation_sdr_state, ai_sdr_events TO service_role;

CREATE OR REPLACE FUNCTION public.update_sdr_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.update_sdr_updated_at();

DROP TRIGGER IF EXISTS conversation_sdr_state_updated_at ON conversation_sdr_state;
CREATE TRIGGER conversation_sdr_state_updated_at
  BEFORE UPDATE ON conversation_sdr_state
  FOR EACH ROW EXECUTE FUNCTION public.update_sdr_updated_at();

REVOKE ALL ON FUNCTION public.update_sdr_updated_at()
  FROM PUBLIC, anon, authenticated;
