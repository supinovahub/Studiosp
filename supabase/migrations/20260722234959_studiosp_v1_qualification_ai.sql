-- Studiosp V1: qualificação configurável, execuções de IA, áudio e follow-up.

create table if not exists public.qualification_questions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(trim(label)) > 0),
  prompt_instruction text not null check (length(trim(prompt_instruction)) > 0),
  data_type text not null check (
    data_type in (
      'text', 'single_choice', 'multi_choice', 'money_range',
      'location', 'date_range', 'boolean'
    )
  ),
  normalization_strategy text not null,
  is_required boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  visibility_condition jsonb not null default '{}'::jsonb,
  validation_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, key),
  unique (id, account_id)
);

create index if not exists qualification_questions_account_order_idx
  on public.qualification_questions(account_id, is_active, display_order, id);

create table if not exists public.qualification_question_options (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  question_id uuid not null references public.qualification_questions(id) on delete cascade,
  value text not null check (value ~ '^[a-z0-9_]+$'),
  label text not null check (length(trim(label)) > 0),
  aliases text[] not null default array[]::text[],
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, value)
);

create index if not exists qualification_question_options_account_id_idx
  on public.qualification_question_options(account_id);
create index if not exists qualification_question_options_question_idx
  on public.qualification_question_options(question_id, is_active, display_order);

create table if not exists public.ai_config_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  communication_prompt text not null default '',
  identity_name text not null default 'Assistente Studiosp',
  tone_config jsonb not null default '{}'::jsonb,
  prohibited_phrases text[] not null default array[]::text[],
  handoff_rules jsonb not null default '{}'::jsonb,
  completion_message text,
  system_policy_version text not null default 'studiosp-v1',
  model_config jsonb not null default '{"provider":"openai","model":"gpt-5-mini"}'::jsonb,
  tool_policy jsonb not null default '{}'::jsonb,
  qualification_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, version),
  unique (id, account_id),
  check ((status = 'active' and published_at is not null) or status <> 'active')
);

create unique index if not exists ai_config_versions_one_active_key
  on public.ai_config_versions(account_id)
  where status = 'active';
create index if not exists ai_config_versions_created_by_idx
  on public.ai_config_versions(created_by);
create index if not exists ai_config_versions_published_by_idx
  on public.ai_config_versions(published_by);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  trigger_message_id uuid references public.messages(id) on delete set null,
  config_version_id uuid references public.ai_config_versions(id) on delete restrict,
  purpose text not null check (
    purpose in ('qualification', 'reply', 'transcription', 'matching', 'broker_operation', 'simulation')
  ),
  provider text not null,
  model text not null,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  input_fingerprint text,
  structured_output jsonb,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost numeric(14,6) check (estimated_cost is null or estimated_cost >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  sanitized_error text,
  correlation_id uuid not null default gen_random_uuid(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index if not exists ai_runs_opportunity_id_idx
  on public.ai_runs(opportunity_id);
create index if not exists ai_runs_conversation_id_idx
  on public.ai_runs(conversation_id);
create index if not exists ai_runs_trigger_message_id_idx
  on public.ai_runs(trigger_message_id);
create index if not exists ai_runs_config_version_id_idx
  on public.ai_runs(config_version_id);
create index if not exists ai_runs_account_created_idx
  on public.ai_runs(account_id, created_at desc, id desc);
create index if not exists ai_runs_pending_idx
  on public.ai_runs(status, created_at, id)
  where status in ('queued', 'processing');

create table if not exists public.qualification_answers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  question_id uuid not null references public.qualification_questions(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'provisional' check (
    status in ('provisional', 'confirmed', 'rejected', 'superseded')
  ),
  raw_text text,
  normalized_value jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  source_message_id uuid references public.messages(id) on delete set null,
  extracted_by_run_id uuid references public.ai_runs(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  idempotency_key text,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (opportunity_id, question_id, version),
  check ((status = 'confirmed' and confirmed_at is not null) or status <> 'confirmed')
);

create unique index if not exists qualification_answers_one_current_key
  on public.qualification_answers(opportunity_id, question_id)
  where is_current;
create unique index if not exists qualification_answers_idempotency_key
  on public.qualification_answers(account_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists qualification_answers_account_id_idx
  on public.qualification_answers(account_id);
create index if not exists qualification_answers_opportunity_history_idx
  on public.qualification_answers(opportunity_id, question_id, version desc);
create index if not exists qualification_answers_question_id_idx
  on public.qualification_answers(question_id);
create index if not exists qualification_answers_source_message_id_idx
  on public.qualification_answers(source_message_id);
create index if not exists qualification_answers_extracted_run_id_idx
  on public.qualification_answers(extracted_by_run_id);
create index if not exists qualification_answers_confirmed_by_idx
  on public.qualification_answers(confirmed_by);

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  ai_run_id uuid not null references public.ai_runs(id) on delete cascade,
  tool_name text not null check (length(trim(tool_name)) > 0),
  sanitized_arguments jsonb not null default '{}'::jsonb,
  status text not null default 'requested' check (
    status in ('requested', 'validated', 'completed', 'rejected', 'failed')
  ),
  validated_result jsonb,
  idempotency_key text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_tool_calls_idempotency_key
  on public.ai_tool_calls(account_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_tool_calls_run_idx
  on public.ai_tool_calls(ai_run_id, created_at, id);
create index if not exists ai_tool_calls_account_id_idx
  on public.ai_tool_calls(account_id);

create table if not exists public.audio_transcriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed')
  ),
  language text not null default 'pt-BR',
  transcript text,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  duration_seconds numeric(10,3) check (duration_seconds is null or duration_seconds >= 0),
  provider_metadata jsonb not null default '{}'::jsonb,
  sanitized_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id)
);

create index if not exists audio_transcriptions_account_id_idx
  on public.audio_transcriptions(account_id);
create index if not exists audio_transcriptions_ai_run_id_idx
  on public.audio_transcriptions(ai_run_id);
create index if not exists audio_transcriptions_status_idx
  on public.audio_transcriptions(status, created_at, id)
  where status in ('queued', 'processing', 'failed');

create table if not exists public.followup_policies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null check (length(trim(name)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  timezone text not null default 'America/Sao_Paulo',
  allowed_weekdays smallint[] not null default array[1,2,3,4,5,6]::smallint[],
  window_start time not null default '09:00',
  window_end time not null default '20:00',
  steps jsonb not null default '[{"after_minutes":120},{"after_minutes":1440},{"after_minutes":4320},{"after_minutes":10080}]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, version),
  unique (id, account_id),
  check (window_start < window_end),
  check (allowed_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  check (jsonb_typeof(steps) = 'array'),
  check ((status = 'active' and published_at is not null) or status <> 'active')
);

create unique index if not exists followup_policies_one_active_key
  on public.followup_policies(account_id)
  where status = 'active';
create index if not exists followup_policies_created_by_idx
  on public.followup_policies(created_by);
create index if not exists followup_policies_published_by_idx
  on public.followup_policies(published_by);

create table if not exists public.followup_executions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  policy_id uuid not null references public.followup_policies(id) on delete restrict,
  step_number integer not null check (step_number > 0),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'claimed', 'sent', 'cancelled', 'failed')
  ),
  scheduled_for timestamptz not null,
  claimed_at timestamptz,
  claimed_by text,
  sent_message_id uuid references public.messages(id) on delete set null,
  cancel_reason text,
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create index if not exists followup_executions_opportunity_id_idx
  on public.followup_executions(opportunity_id);
create index if not exists followup_executions_policy_id_idx
  on public.followup_executions(policy_id);
create index if not exists followup_executions_sent_message_id_idx
  on public.followup_executions(sent_message_id);
create index if not exists followup_executions_scheduled_idx
  on public.followup_executions(scheduled_for, id)
  where status = 'scheduled';
create index if not exists followup_executions_account_status_idx
  on public.followup_executions(account_id, status, scheduled_for, id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'qualification_questions', 'qualification_question_options',
    'ai_config_versions', 'ai_runs', 'qualification_answers',
    'ai_tool_calls', 'audio_transcriptions', 'followup_policies',
    'followup_executions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

drop trigger if exists qualification_questions_updated_at on public.qualification_questions;
create trigger qualification_questions_updated_at
before update on public.qualification_questions
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists qualification_question_options_updated_at on public.qualification_question_options;
create trigger qualification_question_options_updated_at
before update on public.qualification_question_options
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists ai_config_versions_updated_at on public.ai_config_versions;
create trigger ai_config_versions_updated_at
before update on public.ai_config_versions
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists ai_runs_updated_at on public.ai_runs;
create trigger ai_runs_updated_at
before update on public.ai_runs
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists audio_transcriptions_updated_at on public.audio_transcriptions;
create trigger audio_transcriptions_updated_at
before update on public.audio_transcriptions
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists followup_policies_updated_at on public.followup_policies;
create trigger followup_policies_updated_at
before update on public.followup_policies
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists followup_executions_updated_at on public.followup_executions;
create trigger followup_executions_updated_at
before update on public.followup_executions
for each row execute function studiosp_private.set_updated_at();
