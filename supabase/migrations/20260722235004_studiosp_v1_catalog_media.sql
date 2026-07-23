-- Studiosp V1: catálogo de empreendimentos, ofertas e biblioteca privada.

create table if not exists public.developers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null check (length(trim(normalized_name)) > 0),
  description text,
  website_url text,
  contact_info jsonb not null default '{}'::jsonb,
  logo_path text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id)
);

create unique index if not exists developers_active_name_key
  on public.developers(account_id, normalized_name)
  where is_active;
create index if not exists developers_created_by_idx
  on public.developers(created_by);
create index if not exists developers_account_active_idx
  on public.developers(account_id, is_active, name);

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null check (length(trim(normalized_name)) > 0),
  city text not null check (length(trim(city)) > 0),
  state_code char(2) not null check (state_code ~ '^[A-Z]{2}$'),
  region text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, normalized_name, city, state_code),
  unique (id, account_id),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create index if not exists neighborhoods_created_by_idx
  on public.neighborhoods(created_by);
create index if not exists neighborhoods_account_active_idx
  on public.neighborhoods(account_id, is_active, city, name);

create table if not exists public.neighborhood_aliases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  alias text not null check (length(trim(alias)) > 0),
  normalized_alias text not null check (length(trim(normalized_alias)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (neighborhood_id, normalized_alias)
);

create index if not exists neighborhood_aliases_account_alias_idx
  on public.neighborhood_aliases(account_id, normalized_alias);
create index if not exists neighborhood_aliases_neighborhood_id_idx
  on public.neighborhood_aliases(neighborhood_id);

create table if not exists public.developments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  developer_id uuid not null references public.developers(id) on delete restrict,
  neighborhood_id uuid not null references public.neighborhoods(id) on delete restrict,
  legacy_product_id uuid references public.products(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null check (length(trim(normalized_name)) > 0),
  internal_code text,
  description text not null default '',
  address jsonb not null default '{}'::jsonb,
  latitude numeric(9,6),
  longitude numeric(9,6),
  property_timing text not null default 'off_plan' check (
    property_timing in ('off_plan', 'ready', 'both')
  ),
  expected_delivery_date date,
  highlights text[] not null default array[]::text[],
  knowledge_notes text,
  internal_notes text,
  status text not null default 'draft' check (
    status in ('draft', 'published', 'paused', 'archived')
  ),
  terms_valid_until date,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  unique (legacy_product_id),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check ((status = 'published' and published_at is not null) or status <> 'published')
);

create unique index if not exists developments_account_internal_code_key
  on public.developments(account_id, internal_code)
  where internal_code is not null and status <> 'archived';
create unique index if not exists developments_active_name_key
  on public.developments(account_id, developer_id, normalized_name)
  where status <> 'archived';
create index if not exists developments_developer_id_idx
  on public.developments(developer_id);
create index if not exists developments_neighborhood_id_idx
  on public.developments(neighborhood_id);
create index if not exists developments_created_by_idx
  on public.developments(created_by);
create index if not exists developments_updated_by_idx
  on public.developments(updated_by);
create index if not exists developments_account_status_idx
  on public.developments(account_id, status, neighborhood_id, developer_id);

create table if not exists public.development_offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  area_min_sqm numeric(10,2) not null check (area_min_sqm > 0),
  area_max_sqm numeric(10,2) check (area_max_sqm is null or area_max_sqm > 0),
  price_from numeric(14,2) check (price_from is null or price_from >= 0),
  price_to numeric(14,2) check (price_to is null or price_to >= 0),
  entry_from numeric(14,2) check (entry_from is null or entry_from >= 0),
  entry_to numeric(14,2) check (entry_to is null or entry_to >= 0),
  installment_from numeric(14,2) check (installment_from is null or installment_from >= 0),
  installment_to numeric(14,2) check (installment_to is null or installment_to >= 0),
  currency char(3) not null default 'BRL',
  terms_summary text,
  property_timing text not null default 'off_plan' check (
    property_timing in ('off_plan', 'ready', 'both')
  ),
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id),
  check (area_max_sqm is null or area_min_sqm <= area_max_sqm),
  check (price_to is null or price_from is null or price_from <= price_to),
  check (entry_to is null or entry_from is null or entry_from <= entry_to),
  check (installment_to is null or installment_from is null or installment_from <= installment_to),
  check (valid_until is null or valid_from is null or valid_from <= valid_until)
);

create index if not exists development_offers_development_idx
  on public.development_offers(development_id, display_order, id);
create index if not exists development_offers_created_by_idx
  on public.development_offers(created_by);
create index if not exists development_offers_active_validity_idx
  on public.development_offers(development_id, valid_until)
  where is_active;
create index if not exists development_offers_account_id_idx
  on public.development_offers(account_id);

create table if not exists public.development_media (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  offer_id uuid references public.development_offers(id) on delete set null,
  legacy_product_media_id uuid references public.product_media(id) on delete set null,
  media_type text not null check (
    media_type in ('image', 'video', 'document', 'floor_plan', 'presentation')
  ),
  category text not null default 'custom',
  title text not null check (length(trim(title)) > 0),
  description text,
  visibility text not null default 'broker' check (
    visibility in ('owner_only', 'broker', 'shareable')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'processing', 'published', 'failed', 'archived')
  ),
  is_cover boolean not null default false,
  display_order integer not null default 0,
  current_version integer not null default 1 check (current_version > 0),
  legacy_url text,
  created_by uuid references public.profiles(id) on delete set null,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legacy_product_media_id),
  check ((status = 'archived' and archived_at is not null) or status <> 'archived')
);

create unique index if not exists development_media_one_cover_key
  on public.development_media(development_id)
  where is_cover and status <> 'archived';
create index if not exists development_media_development_idx
  on public.development_media(development_id, status, display_order, id);
create index if not exists development_media_offer_id_idx
  on public.development_media(offer_id);
create index if not exists development_media_account_id_idx
  on public.development_media(account_id);
create index if not exists development_media_created_by_idx
  on public.development_media(created_by);
create index if not exists development_media_archived_by_idx
  on public.development_media(archived_by);

create table if not exists public.development_media_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  media_id uuid not null references public.development_media(id) on delete cascade,
  version integer not null check (version > 0),
  bucket_id text not null default 'development-media',
  object_path text not null check (length(trim(object_path)) > 0),
  original_filename text not null check (length(trim(original_filename)) > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric(10,3) check (duration_seconds is null or duration_seconds >= 0),
  processing_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (media_id, version),
  unique (bucket_id, object_path)
);

create index if not exists development_media_versions_account_id_idx
  on public.development_media_versions(account_id);
create index if not exists development_media_versions_media_idx
  on public.development_media_versions(media_id, version desc);
create index if not exists development_media_versions_created_by_idx
  on public.development_media_versions(created_by);
create index if not exists development_media_versions_checksum_idx
  on public.development_media_versions(account_id, checksum_sha256)
  where checksum_sha256 is not null;

alter table public.developments add column if not exists cover_media_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'developments_cover_media_id_fkey'
      and conrelid = 'public.developments'::regclass
  ) then
    alter table public.developments
      add constraint developments_cover_media_id_fkey
      foreign key (cover_media_id) references public.development_media(id) on delete set null;
  end if;
end $$;
create index if not exists developments_cover_media_id_idx
  on public.developments(cover_media_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'development-media',
  'development-media',
  false,
  104857600,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'developers', 'neighborhoods', 'neighborhood_aliases', 'developments',
    'development_offers', 'development_media', 'development_media_versions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

drop trigger if exists developers_updated_at on public.developers;
create trigger developers_updated_at
before update on public.developers
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists neighborhoods_updated_at on public.neighborhoods;
create trigger neighborhoods_updated_at
before update on public.neighborhoods
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists neighborhood_aliases_updated_at on public.neighborhood_aliases;
create trigger neighborhood_aliases_updated_at
before update on public.neighborhood_aliases
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists developments_updated_at on public.developments;
create trigger developments_updated_at
before update on public.developments
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists development_offers_updated_at on public.development_offers;
create trigger development_offers_updated_at
before update on public.development_offers
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists development_media_updated_at on public.development_media;
create trigger development_media_updated_at
before update on public.development_media
for each row execute function studiosp_private.set_updated_at();
