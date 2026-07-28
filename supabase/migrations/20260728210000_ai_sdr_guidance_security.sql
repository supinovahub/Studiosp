-- Estados explícitos de controle da conversa, orientação humana do SDR,
-- auditoria de segurança e normalização defensiva da qualificação.

alter table public.conversations
  add column if not exists ai_control_mode text not null default 'ai_active',
  add column if not exists ai_control_reason text,
  add column if not exists ai_control_changed_at timestamptz not null default now();

alter table public.conversations
  drop constraint if exists conversations_ai_control_mode_check;
alter table public.conversations
  add constraint conversations_ai_control_mode_check check (
    ai_control_mode in (
      'ai_active',
      'human_active',
      'awaiting_guidance',
      'paused',
      'closed'
    )
  );

alter table public.conversations
  drop constraint if exists conversations_ai_processing_status_check;
alter table public.conversations
  add constraint conversations_ai_processing_status_check check (
    ai_processing_status in (
      'idle',
      'queued',
      'processing',
      'retrying',
      'paused',
      'awaiting_guidance',
      'handoff',
      'failed'
    )
  );

alter table public.ai_reply_jobs
  drop constraint if exists ai_reply_jobs_status_check;
alter table public.ai_reply_jobs
  add constraint ai_reply_jobs_status_check check (
    status in (
      'queued',
      'processing',
      'retrying',
      'completed',
      'skipped',
      'waiting_guidance',
      'handoff',
      'failed'
    )
  );

alter table public.ai_reply_attempts
  drop constraint if exists ai_reply_attempts_status_check;
alter table public.ai_reply_attempts
  add constraint ai_reply_attempts_status_check check (
    status in (
      'processing',
      'completed',
      'retrying',
      'skipped',
      'waiting_guidance',
      'handoff',
      'failed'
    )
  );

update public.conversations
set ai_control_mode = case
      when assigned_agent_id is not null then 'human_active'
      when status = 'closed' then 'closed'
      when ai_autoreply_disabled then 'paused'
      else 'ai_active'
    end,
    ai_control_reason = case
      when assigned_agent_id is not null then 'human_assignment'
      when status = 'closed' then 'conversation_closed'
      when ai_autoreply_disabled then coalesce(ai_processing_reason, 'legacy_pause')
      else null
    end,
    ai_control_changed_at = now();

create index if not exists conversations_ai_control_idx
  on public.conversations(account_id, ai_control_mode, updated_at desc);

create or replace function studiosp_private.sync_conversation_ai_control()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'closed' then
    new.ai_control_mode := 'closed';
    new.ai_control_reason := coalesce(new.ai_control_reason, 'conversation_closed');
  elsif new.assigned_agent_id is not null
    and (
      old.assigned_agent_id is distinct from new.assigned_agent_id
      or new.ai_control_mode = 'ai_active'
    )
  then
    new.ai_control_mode := 'human_active';
    new.ai_control_reason := coalesce(new.ai_control_reason, 'human_assignment');
  elsif old.assigned_agent_id is not null
    and new.assigned_agent_id is null
    and new.ai_control_mode = old.ai_control_mode
  then
    new.ai_control_mode := 'paused';
    new.ai_control_reason := 'human_released_without_ai_resume';
  end if;

  new.ai_autoreply_disabled :=
    new.ai_control_mode in ('human_active', 'paused', 'closed');
  if new.ai_control_mode is distinct from old.ai_control_mode
    or new.ai_control_reason is distinct from old.ai_control_reason
  then
    new.ai_control_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_sync_ai_control
  on public.conversations;
create trigger conversations_sync_ai_control
before update of
  status,
  assigned_agent_id,
  ai_control_mode,
  ai_control_reason
on public.conversations
for each row execute function studiosp_private.sync_conversation_ai_control();

alter table public.ai_sdr_events
  drop constraint if exists ai_sdr_events_outcome_check;
alter table public.ai_sdr_events
  add constraint ai_sdr_events_outcome_check check (
    outcome in (
      'classified',
      'replied',
      'handoff',
      'awaiting_guidance',
      'failed'
    )
  );

create table if not exists public.ai_guidance_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  trigger_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'open' check (
    status in ('open', 'resolving', 'resolved', 'cancelled')
  ),
  reason_code text not null check (reason_code ~ '^[a-z0-9_]+$'),
  missing_context_summary text not null
    check (length(trim(missing_context_summary)) between 3 and 2000),
  lead_message_excerpt text,
  context jsonb not null default '{}'::jsonb,
  guidance_scope text check (
    guidance_scope is null
    or guidance_scope in ('reply', 'conversation', 'knowledge')
  ),
  owner_guidance text,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  response_message_id uuid references public.messages(id) on delete set null,
  resumed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, account_id)
);

create unique index if not exists ai_guidance_requests_one_open_conversation_idx
  on public.ai_guidance_requests(account_id, conversation_id)
  where status in ('open', 'resolving');
create index if not exists ai_guidance_requests_account_status_idx
  on public.ai_guidance_requests(account_id, status, created_at desc);
create index if not exists ai_guidance_requests_conversation_idx
  on public.ai_guidance_requests(conversation_id, created_at desc);
create index if not exists ai_guidance_requests_opportunity_idx
  on public.ai_guidance_requests(opportunity_id)
  where opportunity_id is not null;
create index if not exists ai_guidance_requests_trigger_message_idx
  on public.ai_guidance_requests(trigger_message_id)
  where trigger_message_id is not null;
create index if not exists ai_guidance_requests_owner_profile_idx
  on public.ai_guidance_requests(owner_profile_id)
  where owner_profile_id is not null;
create index if not exists ai_guidance_requests_response_message_idx
  on public.ai_guidance_requests(response_message_id)
  where response_message_id is not null;

create table if not exists public.ai_guidance_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  request_id uuid not null references public.ai_guidance_requests(id) on delete cascade,
  role text not null check (role in ('owner', 'assistant', 'system')),
  content text not null check (length(trim(content)) between 1 and 5000),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_guidance_messages_request_idx
  on public.ai_guidance_messages(request_id, created_at, id);
create index if not exists ai_guidance_messages_account_idx
  on public.ai_guidance_messages(account_id, created_at desc);
create index if not exists ai_guidance_messages_profile_idx
  on public.ai_guidance_messages(profile_id)
  where profile_id is not null;

create table if not exists public.ai_guidance_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  source_request_id uuid references public.ai_guidance_requests(id) on delete set null,
  scope text not null check (scope in ('conversation', 'knowledge')),
  content text not null check (length(trim(content)) between 3 and 4000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'conversation' and conversation_id is not null)
    or (scope = 'knowledge' and conversation_id is null)
  )
);

create index if not exists ai_guidance_rules_lookup_idx
  on public.ai_guidance_rules(account_id, scope, conversation_id, created_at desc)
  where is_active;
create index if not exists ai_guidance_rules_request_idx
  on public.ai_guidance_rules(source_request_id)
  where source_request_id is not null;
create index if not exists ai_guidance_rules_created_by_idx
  on public.ai_guidance_rules(created_by)
  where created_by is not null;

create table if not exists public.ai_security_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z0-9_]+$'),
  severity text not null default 'info' check (
    severity in ('info', 'warning', 'critical')
  ),
  detector_version text not null default 'prompt-injection-v1',
  signals text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_security_events_message_type_idx
  on public.ai_security_events(account_id, message_id, event_type)
  where message_id is not null;
create index if not exists ai_security_events_account_created_idx
  on public.ai_security_events(account_id, created_at desc);
create index if not exists ai_security_events_conversation_idx
  on public.ai_security_events(conversation_id, created_at desc)
  where conversation_id is not null;

drop trigger if exists ai_guidance_requests_updated_at
  on public.ai_guidance_requests;
create trigger ai_guidance_requests_updated_at
before update on public.ai_guidance_requests
for each row execute function studiosp_private.set_updated_at();

drop trigger if exists ai_guidance_rules_updated_at
  on public.ai_guidance_rules;
create trigger ai_guidance_rules_updated_at
before update on public.ai_guidance_rules
for each row execute function studiosp_private.set_updated_at();

alter table public.ai_guidance_requests enable row level security;
alter table public.ai_guidance_messages enable row level security;
alter table public.ai_guidance_rules enable row level security;
alter table public.ai_security_events enable row level security;

drop policy if exists ai_guidance_requests_admin_all
  on public.ai_guidance_requests;
create policy ai_guidance_requests_admin_all
on public.ai_guidance_requests for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists ai_guidance_messages_admin_all
  on public.ai_guidance_messages;
create policy ai_guidance_messages_admin_all
on public.ai_guidance_messages for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists ai_guidance_rules_admin_all
  on public.ai_guidance_rules;
create policy ai_guidance_rules_admin_all
on public.ai_guidance_rules for all to authenticated
using ((select studiosp_private.is_account_admin(account_id)))
with check ((select studiosp_private.is_account_admin(account_id)));

drop policy if exists ai_security_events_admin_read
  on public.ai_security_events;
create policy ai_security_events_admin_read
on public.ai_security_events for select to authenticated
using ((select studiosp_private.is_account_admin(account_id)));

revoke all on
  public.ai_guidance_requests,
  public.ai_guidance_messages,
  public.ai_guidance_rules,
  public.ai_security_events
from public, anon, authenticated;

grant select, insert, update on
  public.ai_guidance_requests,
  public.ai_guidance_messages,
  public.ai_guidance_rules
to authenticated;
grant select on public.ai_security_events to authenticated;
grant all on
  public.ai_guidance_requests,
  public.ai_guidance_messages,
  public.ai_guidance_rules,
  public.ai_security_events
to service_role;

-- O gatilho protege qualquer gravação futura, mesmo que um novo chamador
-- deixe de aplicar as mesmas validações do servidor TypeScript.
create or replace function studiosp_private.validate_qualification_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_question public.qualification_questions;
  v_opportunity public.opportunities;
  v_message public.messages;
  v_option public.qualification_question_options;
  v_raw_normalized text;
  v_message_normalized text;
  v_min numeric;
  v_max numeric;
begin
  select * into v_question
  from public.qualification_questions
  where id = new.question_id
    and account_id = new.account_id
    and is_active;
  if not found then
    raise exception 'Pergunta inválida para esta operação.'
      using errcode = '23514';
  end if;

  select * into v_opportunity
  from public.opportunities
  where id = new.opportunity_id
    and account_id = new.account_id;
  if not found then
    raise exception 'Oportunidade inválida para esta resposta.'
      using errcode = '23514';
  end if;

  if new.source_message_id is not null then
    select * into v_message
    from public.messages
    where id = new.source_message_id
      and account_id = new.account_id
      and sender_type = 'customer'
      and conversation_id = v_opportunity.primary_conversation_id;
    if not found then
      raise exception 'A evidência deve ser uma mensagem do lead nesta conversa.'
        using errcode = '23514';
    end if;

    v_raw_normalized := regexp_replace(
      translate(
        lower(coalesce(new.raw_text, '')),
        'áàâãéêíóôõúüç',
        'aaaaeeiooouuc'
      ),
      '[^[:alnum:]]',
      '',
      'g'
    );
    v_message_normalized := regexp_replace(
      translate(
        lower(coalesce(v_message.content_text, '')),
        'áàâãéêíóôõúüç',
        'aaaaeeiooouuc'
      ),
      '[^[:alnum:]]',
      '',
      'g'
    );
    if v_raw_normalized = ''
      or strpos(v_message_normalized, v_raw_normalized) = 0
    then
      raise exception 'A resposta original não pertence à mensagem do lead.'
        using errcode = '23514';
    end if;
  end if;

  if coalesce((new.normalized_value->>'unknown')::boolean, false) then
    if coalesce((v_question.validation_schema->>'allow_unknown')::boolean, false)
      is not true
    then
      raise exception 'Esta informação não aceita resposta desconhecida.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if v_question.data_type = 'single_choice' then
    select * into v_option
    from public.qualification_question_options
    where question_id = new.question_id
      and account_id = new.account_id
      and is_active
      and value = new.normalized_value->>'value';
    if not found then
      raise exception 'Opção normalizada inválida.'
        using errcode = '23514';
    end if;
    new.normalized_value := jsonb_build_object(
      'value', v_option.value,
      'label', v_option.label
    );
  elsif v_question.data_type = 'money_range' then
    if jsonb_typeof(new.normalized_value) <> 'object'
      or (
        jsonb_typeof(new.normalized_value->'min') not in ('number', 'null')
        and new.normalized_value ? 'min'
      )
      or (
        jsonb_typeof(new.normalized_value->'max') not in ('number', 'null')
        and new.normalized_value ? 'max'
      )
      or (
        coalesce(new.normalized_value->>'currency', 'BRL') <> 'BRL'
      )
    then
      raise exception 'Faixa monetária normalizada inválida.'
        using errcode = '23514';
    end if;
    v_min := nullif(new.normalized_value->>'min', '')::numeric;
    v_max := nullif(new.normalized_value->>'max', '')::numeric;
    if v_min is null and v_max is null then
      raise exception 'Informe ao menos um limite monetário.'
        using errcode = '23514';
    end if;
    if v_min is not null and v_min < 0
      or v_max is not null and v_max < 0
      or v_min is not null and v_max is not null and v_min > v_max
    then
      raise exception 'Limites monetários inválidos.'
        using errcode = '23514';
    end if;
    if v_min = 0 and coalesce(v_max, 0) > 0 then
      v_min := null;
    end if;
    new.normalized_value := jsonb_build_object(
      'min', v_min,
      'max', v_max,
      'currency', 'BRL'
    );
  elsif v_question.data_type = 'location' then
    if jsonb_typeof(new.normalized_value->'values') <> 'array'
      or jsonb_array_length(new.normalized_value->'values') = 0
    then
      raise exception 'Localização normalizada inválida.'
        using errcode = '23514';
    end if;
  elsif v_question.data_type = 'date_range' then
    if nullif(trim(new.normalized_value->>'text'), '') is null then
      raise exception 'Período normalizado inválido.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists qualification_answers_validate
  on public.qualification_answers;
create trigger qualification_answers_validate
before insert or update of
  account_id,
  opportunity_id,
  question_id,
  raw_text,
  normalized_value,
  source_message_id
on public.qualification_answers
for each row execute function studiosp_private.validate_qualification_answer();

-- Reparo conservador: remove apenas valores cuja evidência literalmente não
-- pertence à mensagem vinculada ou aponta para outra conversa/autor.
create temporary table studiosp_invalid_answer_evidence on commit drop as
select qa.id, qa.opportunity_id
from public.qualification_answers qa
join public.opportunities o
  on o.id = qa.opportunity_id
 and o.account_id = qa.account_id
left join public.messages m
  on m.id = qa.source_message_id
 and m.account_id = qa.account_id
where qa.is_current
  and qa.status in ('provisional', 'confirmed')
  and qa.extracted_by_run_id is not null
  and qa.source_message_id is not null
  and (
    m.id is null
    or m.sender_type <> 'customer'
    or m.conversation_id is distinct from o.primary_conversation_id
    or nullif(
      regexp_replace(
        translate(lower(coalesce(qa.raw_text, '')),
          'áàâãéêíóôõúüç', 'aaaaeeiooouuc'),
        '[^[:alnum:]]', '', 'g'
      ),
      ''
    ) is null
    or strpos(
      regexp_replace(
        translate(lower(coalesce(m.content_text, '')),
          'áàâãéêíóôõúüç', 'aaaaeeiooouuc'),
        '[^[:alnum:]]', '', 'g'
      ),
      regexp_replace(
        translate(lower(coalesce(qa.raw_text, '')),
          'áàâãéêíóôõúüç', 'aaaaeeiooouuc'),
        '[^[:alnum:]]', '', 'g'
      )
    ) = 0
  );

update public.qualification_answers qa
set is_current = false,
    status = 'rejected'
from studiosp_invalid_answer_evidence invalid
where qa.id = invalid.id;

update public.qualification_answers qa
set normalized_value = jsonb_set(
      jsonb_set(
        qa.normalized_value,
        '{min}',
        'null'::jsonb,
        true
      ),
      '{currency}',
      '"BRL"'::jsonb,
      true
    )
from public.qualification_questions q
where qa.question_id = q.id
  and qa.account_id = q.account_id
  and qa.is_current
  and qa.status in ('provisional', 'confirmed')
  and q.data_type = 'money_range'
  and coalesce((qa.normalized_value->>'min')::numeric, -1) = 0
  and coalesce((qa.normalized_value->>'max')::numeric, 0) > 0;

update public.qualification_answers qa
set normalized_value = jsonb_build_object(
      'value', option.value,
      'label', option.label
    )
from public.qualification_questions q
join public.qualification_question_options option
  on option.question_id = q.id
 and option.account_id = q.account_id
 and option.is_active
where qa.question_id = q.id
  and qa.account_id = q.account_id
  and qa.is_current
  and q.data_type = 'single_choice'
  and option.value = qa.normalized_value->>'value';

update public.opportunities o
set qualification_status = 'in_progress',
    attention_state = case
      when o.attention_state = 'no_action' then 'ai_processing'
      else o.attention_state
    end
where o.id in (
  select distinct opportunity_id
  from studiosp_invalid_answer_evidence
);

alter table public.ai_config_versions
  alter column identity_name set default 'Pedro';

update public.ai_config_versions
set identity_name = 'Pedro'
where identity_name in ('Sofia', 'Assistente Studiosp');
