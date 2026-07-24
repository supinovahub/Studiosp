-- Cover every foreign key introduced by the document analysis workspace.
-- The queue and list indexes from the base migration already cover the
-- remaining leading columns.

create index if not exists document_analysis_batches_created_by_idx
  on public.document_analysis_batches(created_by);
create index if not exists document_analysis_events_account_idx
  on public.document_analysis_events(account_id);
create index if not exists document_analysis_events_actor_idx
  on public.document_analysis_events(actor_id);
create index if not exists document_analysis_events_source_idx
  on public.document_analysis_events(source_id);
create index if not exists document_analysis_fields_account_idx
  on public.document_analysis_fields(account_id);
create index if not exists document_analysis_fields_batch_idx
  on public.document_analysis_fields(batch_id);
create index if not exists document_analysis_issues_account_idx
  on public.document_analysis_issues(account_id);
create index if not exists document_analysis_issues_field_idx
  on public.document_analysis_issues(field_id);
create index if not exists document_analysis_issues_item_idx
  on public.document_analysis_issues(item_id);
create index if not exists document_analysis_issues_resolved_by_idx
  on public.document_analysis_issues(resolved_by);
create index if not exists document_analysis_issues_source_idx
  on public.document_analysis_issues(source_id);
create index if not exists document_analysis_items_account_idx
  on public.document_analysis_items(account_id);
create index if not exists document_analysis_items_parent_idx
  on public.document_analysis_items(parent_item_id);
create index if not exists document_analysis_messages_account_idx
  on public.document_analysis_messages(account_id);
create index if not exists document_analysis_messages_created_by_idx
  on public.document_analysis_messages(created_by);
create index if not exists document_analysis_provenance_account_idx
  on public.document_analysis_provenance(account_id);
create index if not exists document_analysis_provenance_batch_idx
  on public.document_analysis_provenance(batch_id);
create index if not exists document_analysis_provenance_source_idx
  on public.document_analysis_provenance(source_id);
create index if not exists document_analysis_versions_account_idx
  on public.document_analysis_versions(account_id);
create index if not exists document_analysis_versions_created_by_idx
  on public.document_analysis_versions(created_by);
