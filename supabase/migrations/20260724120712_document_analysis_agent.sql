-- Isolated owner-only workspace for document analysis and preview.
-- This migration intentionally creates no trigger or foreign key capable of
-- writing to the operational catalog or the IA-SDR knowledge base.

create table if not exists public.document_analysis_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null default 'Análise de documentos',
  status text not null default 'awaiting'
    check (status in (
      'awaiting', 'extracting', 'privacy_check', 'analyzing',
      'consolidating', 'ready', 'failed', 'cancelled', 'expired'
    )),
  current_version integer not null default 0 check (current_version >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  completed_source_count integer not null default 0
    check (completed_source_count >= 0),
  failed_source_count integer not null default 0
    check (failed_source_count >= 0),
  attempts integer not null default 0 check (attempts between 0 and 3),
  checkpoint jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  cancel_requested_at timestamptz,
  error_code text,
  error_message text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_source_count + failed_source_count <= source_count)
);

create table if not exists public.document_analysis_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  source_kind text not null check (source_kind in ('upload', 'google_drive')),
  status text not null default 'awaiting'
    check (status in (
      'awaiting', 'extracting', 'privacy_check', 'analyzing',
      'consolidating', 'ready', 'failed', 'cancelled', 'expired'
    )),
  original_filename text not null,
  original_url text,
  object_path text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 0 and 52428800),
  page_count integer check (page_count between 0 and 300),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  signature_valid boolean not null default false,
  pii_status text not null default 'pending'
    check (pii_status in ('pending', 'clear', 'sanitized', 'blocked')),
  pii_categories text[] not null default '{}',
  pii_count integer not null default 0 check (pii_count >= 0),
  extracted_text text,
  sanitized_text text,
  extraction_metadata jsonb not null default '{}'::jsonb,
  checkpoint jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts between 0 and 3),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, checksum_sha256)
);

create table if not exists public.document_analysis_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  item_type text not null check (item_type in ('development', 'offer')),
  proposed_action text not null
    check (proposed_action in ('create', 'update', 'deactivate', 'ignore')),
  target_id uuid,
  parent_item_id uuid references public.document_analysis_items(id)
    on delete cascade,
  display_name text not null,
  normalized_key text,
  confidence numeric(5,4) not null default 0
    check (confidence between 0 and 1),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_analysis_fields (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  item_id uuid not null references public.document_analysis_items(id)
    on delete cascade,
  field_name text not null,
  proposed_value jsonb,
  edited_value jsonb,
  existing_value jsonb,
  confidence numeric(5,4) not null default 0
    check (confidence between 0 and 1),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, field_name)
);

create table if not exists public.document_analysis_provenance (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  source_id uuid not null references public.document_analysis_sources(id)
    on delete cascade,
  field_id uuid not null references public.document_analysis_fields(id)
    on delete cascade,
  page_number integer check (page_number between 1 and 300),
  sanitized_excerpt text,
  location jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.document_analysis_issues (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  source_id uuid references public.document_analysis_sources(id)
    on delete cascade,
  item_id uuid references public.document_analysis_items(id)
    on delete cascade,
  field_id uuid references public.document_analysis_fields(id)
    on delete cascade,
  issue_type text not null
    check (issue_type in (
      'pii', 'conflict', 'possible_duplicate', 'stale',
      'missing', 'low_confidence', 'blocked'
    )),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'blocking')),
  code text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.document_analysis_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  version integer not null check (version > 0),
  origin text not null check (origin in ('analysis', 'owner_edit', 'chat', 'undo')),
  snapshot jsonb not null,
  instruction text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, version)
);

create table if not exists public.document_analysis_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  role text not null check (role in ('owner', 'assistant', 'system')),
  content text not null,
  preview_version integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.document_analysis_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  source_id uuid references public.document_analysis_sources(id)
    on delete set null,
  actor_type text not null check (actor_type in ('user', 'system', 'worker', 'ai')),
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists document_analysis_batches_queue_idx
  on public.document_analysis_batches(status, lease_expires_at, created_at)
  where status in (
    'awaiting', 'extracting', 'privacy_check', 'analyzing', 'consolidating'
  );
create index if not exists document_analysis_batches_account_idx
  on public.document_analysis_batches(account_id, created_at desc);
create index if not exists document_analysis_sources_batch_idx
  on public.document_analysis_sources(batch_id, status, created_at);
create index if not exists document_analysis_sources_checksum_idx
  on public.document_analysis_sources(account_id, checksum_sha256, created_at desc);
create index if not exists document_analysis_items_batch_idx
  on public.document_analysis_items(batch_id, sort_order, id);
create index if not exists document_analysis_fields_item_idx
  on public.document_analysis_fields(item_id, field_name);
create index if not exists document_analysis_provenance_field_idx
  on public.document_analysis_provenance(field_id, source_id);
create index if not exists document_analysis_issues_batch_idx
  on public.document_analysis_issues(batch_id, severity, created_at);
create index if not exists document_analysis_versions_batch_idx
  on public.document_analysis_versions(batch_id, version desc);
create index if not exists document_analysis_messages_batch_idx
  on public.document_analysis_messages(batch_id, created_at);
create index if not exists document_analysis_events_batch_idx
  on public.document_analysis_events(batch_id, created_at desc);

alter table public.document_analysis_batches enable row level security;
alter table public.document_analysis_sources enable row level security;
alter table public.document_analysis_items enable row level security;
alter table public.document_analysis_fields enable row level security;
alter table public.document_analysis_provenance enable row level security;
alter table public.document_analysis_issues enable row level security;
alter table public.document_analysis_versions enable row level security;
alter table public.document_analysis_messages enable row level security;
alter table public.document_analysis_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'document_analysis_batches',
    'document_analysis_sources',
    'document_analysis_items',
    'document_analysis_fields',
    'document_analysis_provenance',
    'document_analysis_issues',
    'document_analysis_versions',
    'document_analysis_messages',
    'document_analysis_events'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_owner_all',
      table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated ' ||
      'using (public.is_account_member(account_id, ''admin'')) ' ||
      'with check (public.is_account_member(account_id, ''admin''))',
      table_name || '_owner_all',
      table_name
    );
  end loop;
end
$$;

grant select, insert, update, delete on
  public.document_analysis_batches,
  public.document_analysis_sources,
  public.document_analysis_items,
  public.document_analysis_fields,
  public.document_analysis_provenance,
  public.document_analysis_issues,
  public.document_analysis_versions,
  public.document_analysis_messages,
  public.document_analysis_events
to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'document-analysis-quarantine',
  'document-analysis-quarantine',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists document_analysis_quarantine_owner_select
  on storage.objects;
create policy document_analysis_quarantine_owner_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'document-analysis-quarantine'
    and public.is_account_member(
      (storage.foldername(name))[1]::uuid,
      'admin'
    )
  );

drop policy if exists document_analysis_quarantine_owner_insert
  on storage.objects;
create policy document_analysis_quarantine_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'document-analysis-quarantine'
    and public.is_account_member(
      (storage.foldername(name))[1]::uuid,
      'admin'
    )
  );

drop policy if exists document_analysis_quarantine_owner_delete
  on storage.objects;
create policy document_analysis_quarantine_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'document-analysis-quarantine'
    and public.is_account_member(
      (storage.foldername(name))[1]::uuid,
      'admin'
    )
  );
