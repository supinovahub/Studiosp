-- Persistent, retryable units for large document analysis.
create table if not exists public.document_analysis_chunks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.document_analysis_batches(id)
    on delete cascade,
  source_id uuid not null references public.document_analysis_sources(id)
    on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_count integer not null check (chunk_count > 0),
  status text not null default 'awaiting'
    check (status in ('awaiting', 'analyzing', 'ready', 'failed', 'cancelled')),
  sanitized_content text not null,
  result jsonb,
  usage jsonb,
  attempts integer not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index if not exists document_analysis_chunks_queue_idx
  on public.document_analysis_chunks(status, next_attempt_at, created_at)
  where status in ('awaiting', 'failed');
create index if not exists document_analysis_chunks_source_idx
  on public.document_analysis_chunks(source_id, status, chunk_index);
create index if not exists document_analysis_chunks_batch_idx
  on public.document_analysis_chunks(batch_id, status);

alter table public.document_analysis_chunks enable row level security;

drop policy if exists document_analysis_chunks_owner_all
  on public.document_analysis_chunks;
create policy document_analysis_chunks_owner_all
  on public.document_analysis_chunks
  for all
  to authenticated
  using (public.is_account_member(account_id, 'admin'))
  with check (public.is_account_member(account_id, 'admin'));

grant select, insert, update, delete
  on public.document_analysis_chunks
  to authenticated;
