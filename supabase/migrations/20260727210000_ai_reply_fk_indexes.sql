create index if not exists ai_reply_jobs_account_created_idx
  on public.ai_reply_jobs(account_id, created_at desc);
create index if not exists ai_reply_jobs_contact_idx
  on public.ai_reply_jobs(contact_id);
create index if not exists ai_reply_jobs_trigger_message_idx
  on public.ai_reply_jobs(trigger_message_id);
create index if not exists ai_reply_jobs_config_owner_idx
  on public.ai_reply_jobs(config_owner_user_id);
create index if not exists ai_reply_attempts_account_created_idx
  on public.ai_reply_attempts(account_id, created_at desc);
create index if not exists ai_reply_attempts_trigger_message_idx
  on public.ai_reply_attempts(trigger_message_id);
create index if not exists conversations_ai_processing_job_idx
  on public.conversations(ai_processing_job_id)
  where ai_processing_job_id is not null;
