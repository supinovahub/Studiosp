-- Migração já aplicada ao staging pela feature isolada de reativação.
-- Mantida aqui com a versão registrada remotamente para que outras
-- features possam evoluir o mesmo banco sem reexecutar ou reparar o histórico.
create table public.reactivation_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 3 and 120),
  status text not null default 'draft' check (status in ('draft','ready','active','paused','completed','cancelled')),
  objective_segment text not null default 'all' check (objective_segment in ('all','live','invest','unknown')),
  entry_value_min numeric(14,2) check (entry_value_min is null or entry_value_min >= 0),
  entry_value_max numeric(14,2) check (entry_value_max is null or entry_value_max >= 0),
  recovery_prompt text,
  cadence jsonb not null default '[{"day":0},{"day":2},{"day":5},{"day":9}]',
  created_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, account_id),
  check (entry_value_max is null or entry_value_min is null or entry_value_max >= entry_value_min)
);
create table public.reactivation_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null,
  filename text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  warnings jsonb not null default '[]',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(id, account_id),
  foreign key(campaign_id,account_id) references public.reactivation_campaigns(id,account_id) on delete cascade
);
create table public.reactivation_leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null,
  import_id uuid not null,
  row_number integer not null,
  name text,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  objective text not null default 'unknown' check (objective in ('live','invest','both','unknown')),
  entry_value numeric(14,2) check (entry_value is null or entry_value >= 0),
  raw_data jsonb not null default '{}',
  status text not null default 'pending_review' check (status in ('pending_review','ready','queued','contacted','replied','converted','opted_out','invalid','failed')),
  validation_notes jsonb not null default '[]',
  contact_id uuid references public.contacts(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,account_id), unique(campaign_id,phone_e164),
  foreign key(campaign_id,account_id) references public.reactivation_campaigns(id,account_id) on delete cascade,
  foreign key(import_id,account_id) references public.reactivation_imports(id,account_id) on delete cascade
);
create index reactivation_campaigns_account_status_idx on public.reactivation_campaigns(account_id,status,created_at desc);
create index reactivation_leads_campaign_status_idx on public.reactivation_leads(campaign_id,status,created_at);
alter table public.reactivation_campaigns enable row level security;
alter table public.reactivation_imports enable row level security;
alter table public.reactivation_leads enable row level security;
grant all on public.reactivation_campaigns,public.reactivation_imports,public.reactivation_leads to service_role;
grant select,insert,update,delete on public.reactivation_campaigns,public.reactivation_imports,public.reactivation_leads to authenticated;
create policy reactivation_campaigns_admin on public.reactivation_campaigns for all to authenticated using ((select studiosp_private.is_account_admin(account_id))) with check ((select studiosp_private.is_account_admin(account_id)));
create policy reactivation_imports_admin on public.reactivation_imports for all to authenticated using ((select studiosp_private.is_account_admin(account_id))) with check ((select studiosp_private.is_account_admin(account_id)));
create policy reactivation_leads_admin on public.reactivation_leads for all to authenticated using ((select studiosp_private.is_account_admin(account_id))) with check ((select studiosp_private.is_account_admin(account_id)));
