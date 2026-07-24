alter table public.document_analysis_sources
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists document_analysis_sources_retry_idx
  on public.document_analysis_sources (batch_id, next_attempt_at, created_at)
  where status in ('awaiting', 'failed') and attempts < 3;
