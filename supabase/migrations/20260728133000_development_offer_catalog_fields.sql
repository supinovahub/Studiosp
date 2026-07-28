alter table public.development_offers
  add column if not exists unit_code text,
  add column if not exists typology text,
  add column if not exists parking_spaces smallint,
  add column if not exists original_price numeric(14,2),
  add column if not exists price_per_sqm numeric(14,2),
  add column if not exists margin_percent numeric(7,3);

alter table public.development_offers
  drop constraint if exists development_offers_parking_spaces_check,
  add constraint development_offers_parking_spaces_check
    check (parking_spaces is null or parking_spaces >= 0),
  drop constraint if exists development_offers_original_price_check,
  add constraint development_offers_original_price_check
    check (original_price is null or original_price >= 0),
  drop constraint if exists development_offers_price_per_sqm_check,
  add constraint development_offers_price_per_sqm_check
    check (price_per_sqm is null or price_per_sqm >= 0),
  drop constraint if exists development_offers_margin_percent_check,
  add constraint development_offers_margin_percent_check
    check (margin_percent is null or (margin_percent >= 0 and margin_percent <= 100));

comment on column public.development_offers.original_price is
  'Preço de/tabela antes da condição comercial.';
comment on column public.development_offers.price_from is
  'Preço para/oferta vigente.';
comment on column public.development_offers.margin_percent is
  'Margem comercial percentual informada pela fonte.';
