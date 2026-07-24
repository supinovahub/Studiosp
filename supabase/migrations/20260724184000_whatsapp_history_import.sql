-- Importação owner-only de histórico do WhatsApp.
-- O arquivo bruto fica em um bucket privado, passa por prévia obrigatória
-- e só chega às tabelas operacionais após confirmação explícita.

create table if not exists public.whatsapp_history_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  whatsapp_config_id uuid not null references public.whatsapp_config(id)
    on delete restrict,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  connection_key text not null check (length(btrim(connection_key)) > 0),
  status text not null default 'uploading'
    check (status in (
      'uploading', 'analyzing', 'ready', 'importing',
      'completed', 'failed', 'cancelled'
    )),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  object_path text,
  mime_type text not null default 'application/x-ndjson',
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  checksum_sha256 text not null
    check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  total_line_count integer not null default 0 check (total_line_count >= 0),
  valid_event_count integer not null default 0 check (valid_event_count >= 0),
  invalid_line_count integer not null default 0 check (invalid_line_count >= 0),
  skipped_event_count integer not null default 0 check (skipped_event_count >= 0),
  message_count integer not null default 0 check (message_count >= 0),
  chat_count integer not null default 0 check (chat_count >= 0),
  inbound_count integer not null default 0 check (inbound_count >= 0),
  outbound_count integer not null default 0 check (outbound_count >= 0),
  media_count integer not null default 0 check (media_count >= 0),
  duplicate_event_id_count integer not null default 0
    check (duplicate_event_id_count >= 0),
  import_cursor integer not null default 0 check (import_cursor >= 0),
  imported_message_count integer not null default 0
    check (imported_message_count >= 0),
  duplicate_message_count integer not null default 0
    check (duplicate_message_count >= 0),
  preview jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  error_message text,
  analyzed_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  object_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, connection_key, checksum_sha256)
);

alter table public.contacts
  add column if not exists automation_status text not null default 'enabled',
  add column if not exists automation_block_reason text,
  add column if not exists automation_blocked_at timestamptz,
  add column if not exists automation_blocked_by_import_id uuid;

alter table public.conversations
  add column if not exists history_import_id uuid,
  add column if not exists ai_context_started_at timestamptz;

alter table public.messages
  add column if not exists history_import_id uuid,
  add column if not exists is_historical boolean not null default false,
  add column if not exists history_source_line integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_automation_status_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_automation_status_check
      check (automation_status in ('enabled', 'suppressed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_automation_blocked_by_import_id_fkey'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_automation_blocked_by_import_id_fkey
      foreign key (automation_blocked_by_import_id)
      references public.whatsapp_history_imports(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_history_import_id_fkey'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_history_import_id_fkey
      foreign key (history_import_id)
      references public.whatsapp_history_imports(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_history_import_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_history_import_id_fkey
      foreign key (history_import_id)
      references public.whatsapp_history_imports(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_history_source_line_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_history_source_line_check
      check (history_source_line is null or history_source_line > 0);
  end if;
end
$$;

create index if not exists whatsapp_history_imports_account_created_idx
  on public.whatsapp_history_imports(account_id, created_at desc);
create index if not exists whatsapp_history_imports_active_idx
  on public.whatsapp_history_imports(account_id, status, updated_at)
  where status in ('uploading', 'analyzing', 'ready', 'importing');
create index if not exists contacts_automation_status_idx
  on public.contacts(account_id, automation_status, updated_at);
create index if not exists contacts_automation_import_idx
  on public.contacts(automation_blocked_by_import_id)
  where automation_blocked_by_import_id is not null;
create index if not exists conversations_history_import_idx
  on public.conversations(history_import_id)
  where history_import_id is not null;
create index if not exists messages_history_import_idx
  on public.messages(history_import_id, history_source_line)
  where history_import_id is not null;

alter table public.whatsapp_history_imports enable row level security;

drop policy if exists whatsapp_history_imports_owner_all
  on public.whatsapp_history_imports;
create policy whatsapp_history_imports_owner_all
  on public.whatsapp_history_imports
  for all
  to authenticated
  using (public.is_account_member(account_id, 'owner'))
  with check (public.is_account_member(account_id, 'owner'));

grant select, insert, update, delete
  on public.whatsapp_history_imports
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'whatsapp-history-imports',
  'whatsapp-history-imports',
  false,
  52428800,
  array[
    'application/x-ndjson',
    'application/json',
    'text/plain',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists whatsapp_history_imports_owner_select
  on storage.objects;
create policy whatsapp_history_imports_owner_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'whatsapp-history-imports'
    and public.is_account_member(
      (storage.foldername(name))[1]::uuid,
      'owner'
    )
  );

drop policy if exists whatsapp_history_imports_owner_insert
  on storage.objects;
create policy whatsapp_history_imports_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'whatsapp-history-imports'
    and public.is_account_member(
      (storage.foldername(name))[1]::uuid,
      'owner'
    )
  );

drop policy if exists whatsapp_history_imports_owner_delete
  on storage.objects;
create policy whatsapp_history_imports_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'whatsapp-history-imports'
    and public.is_account_member(
      (storage.foldername(name))[1]::uuid,
      'owner'
    )
  );

create or replace function public.import_whatsapp_history_chunk(
  p_batch_id uuid,
  p_start_cursor integer,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.whatsapp_history_imports%rowtype;
  v_entry jsonb;
  v_phone text;
  v_name text;
  v_timestamp timestamptz;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_rows integer;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_next_cursor integer;
  v_completed boolean;
  v_final public.whatsapp_history_imports%rowtype;
begin
  if p_start_cursor < 0 then
    raise exception 'Cursor de importação inválido.';
  end if;
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'O lote de mensagens precisa ser uma lista.';
  end if;
  if jsonb_array_length(p_entries) > 1000 then
    raise exception 'O lote excede o limite de 1000 mensagens.';
  end if;

  select *
  into v_batch
  from public.whatsapp_history_imports
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Importação não encontrada.';
  end if;
  if v_batch.status = 'completed' or p_start_cursor < v_batch.import_cursor then
    return jsonb_build_object(
      'status', v_batch.status,
      'cursor', v_batch.import_cursor,
      'messageCount', v_batch.message_count,
      'importedMessageCount', v_batch.imported_message_count,
      'duplicateMessageCount', v_batch.duplicate_message_count,
      'completed', v_batch.status = 'completed'
    );
  end if;
  if v_batch.status not in ('ready', 'importing') then
    raise exception 'Esta importação não está pronta para confirmação.';
  end if;
  if p_start_cursor <> v_batch.import_cursor then
    raise exception 'O cursor recebido não corresponde ao progresso atual.';
  end if;

  for v_entry in
    select value from jsonb_array_elements(p_entries)
  loop
    v_phone := regexp_replace(coalesce(v_entry->>'phone', ''), '\D', '', 'g');
    v_name := nullif(btrim(coalesce(v_entry->>'name', '')), '');
    v_timestamp := (v_entry->>'timestamp')::timestamptz;

    if v_phone !~ '^[1-9][0-9]{6,14}$' then
      raise exception 'Telefone normalizado inválido no lote.';
    end if;
    if coalesce(v_entry->>'messageKey', '') !~ '^[a-f0-9]{64}$' then
      raise exception 'Identificador de mensagem inválido no lote.';
    end if;
    if coalesce(v_entry->>'contentType', '') not in (
      'text', 'image', 'document', 'audio', 'video',
      'location', 'template', 'interactive'
    ) then
      raise exception 'Tipo de conteúdo inválido no lote.';
    end if;
    if coalesce(v_entry->>'senderType', '') not in ('customer', 'agent') then
      raise exception 'Remetente inválido no lote.';
    end if;

    insert into public.contacts (
      account_id,
      user_id,
      phone,
      name,
      source_type,
      source_metadata,
      originated_at,
      automation_status,
      automation_block_reason,
      automation_blocked_at,
      automation_blocked_by_import_id
    )
    values (
      v_batch.account_id,
      v_batch.created_by_user_id,
      v_phone,
      coalesce(v_name, v_phone),
      'other',
      jsonb_build_object(
        'historical_import', true,
        'history_import_id', p_batch_id
      ),
      v_timestamp,
      'suppressed',
      'historical_import',
      now(),
      p_batch_id
    )
    on conflict (account_id, phone_normalized)
      where phone_normalized <> ''
    do update set
      automation_status = 'suppressed',
      automation_block_reason = 'historical_import',
      automation_blocked_at = now(),
      automation_blocked_by_import_id = p_batch_id,
      originated_at = least(
        coalesce(public.contacts.originated_at, excluded.originated_at),
        excluded.originated_at
      ),
      source_metadata = coalesce(public.contacts.source_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'historical_import', true,
          'history_import_id', p_batch_id
        ),
      updated_at = now()
    returning id into v_contact_id;

    insert into public.conversations (
      account_id,
      user_id,
      contact_id,
      status,
      last_message_text,
      last_message_at,
      unread_count,
      ai_autoreply_disabled,
      whatsapp_connection_key,
      history_import_id,
      ai_context_started_at,
      created_at,
      updated_at
    )
    values (
      v_batch.account_id,
      v_batch.created_by_user_id,
      v_contact_id,
      'open',
      nullif(v_entry->>'contentText', ''),
      v_timestamp,
      0,
      true,
      v_batch.connection_key,
      p_batch_id,
      coalesce(v_batch.confirmed_at, now()),
      v_timestamp,
      now()
    )
    on conflict (account_id, contact_id)
    do update set
      ai_autoreply_disabled = true,
      whatsapp_connection_key = excluded.whatsapp_connection_key,
      history_import_id = p_batch_id,
      ai_context_started_at = coalesce(v_batch.confirmed_at, now()),
      updated_at = now()
    returning id into v_conversation_id;

    insert into public.messages (
      account_id,
      conversation_id,
      sender_type,
      content_type,
      content_text,
      media_url,
      message_id,
      status,
      created_at,
      provider_received_at,
      author_type,
      provider_metadata,
      whatsapp_connection_key,
      history_import_id,
      is_historical,
      history_source_line
    )
    values (
      v_batch.account_id,
      v_conversation_id,
      v_entry->>'senderType',
      v_entry->>'contentType',
      nullif(v_entry->>'contentText', ''),
      null,
      'history:' || (v_entry->>'messageKey'),
      'read',
      v_timestamp,
      v_timestamp,
      case
        when v_entry->>'senderType' = 'customer' then 'lead'
        else 'integration'
      end,
      coalesce(v_entry->'providerMetadata', '{}'::jsonb)
        || jsonb_build_object(
          'provider', 'history_import',
          'history_import_id', p_batch_id
        ),
      v_batch.connection_key,
      p_batch_id,
      true,
      (v_entry->>'sourceLine')::integer
    )
    on conflict (account_id, message_id)
      where message_id is not null
    do nothing;

    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      v_inserted := v_inserted + 1;
    else
      v_duplicates := v_duplicates + 1;
    end if;

    update public.conversations
    set
      last_message_text = case
        when last_message_at is null or v_timestamp >= last_message_at
          then nullif(v_entry->>'contentText', '')
        else last_message_text
      end,
      last_message_at = case
        when last_message_at is null or v_timestamp >= last_message_at
          then v_timestamp
        else last_message_at
      end,
      created_at = least(coalesce(created_at, v_timestamp), v_timestamp),
      updated_at = now()
    where id = v_conversation_id;
  end loop;

  v_next_cursor := p_start_cursor + jsonb_array_length(p_entries);
  v_completed := v_next_cursor >= v_batch.message_count;

  update public.whatsapp_history_imports
  set
    status = case when v_completed then 'completed' else 'importing' end,
    import_cursor = v_next_cursor,
    imported_message_count = imported_message_count + v_inserted,
    duplicate_message_count = duplicate_message_count + v_duplicates,
    confirmed_at = coalesce(confirmed_at, now()),
    completed_at = case when v_completed then now() else completed_at end,
    report = case
      when v_completed then jsonb_build_object(
        'imported_messages', imported_message_count + v_inserted,
        'duplicate_messages', duplicate_message_count + v_duplicates,
        'suppressed_contacts', (
          select count(distinct c.id)
          from public.contacts c
          where c.account_id = v_batch.account_id
            and c.automation_blocked_by_import_id = p_batch_id
        )
      )
      else report
    end,
    error_message = null,
    updated_at = now()
  where id = p_batch_id
  returning * into v_final;

  if v_completed then
    insert into public.audit_events (
      account_id,
      actor_type,
      actor_profile_id,
      action,
      entity_type,
      entity_id,
      next_data,
      reason
    )
    values (
      v_batch.account_id,
      'user',
      v_batch.created_by_profile_id,
      'whatsapp_history_import_completed',
      'whatsapp_history_import',
      p_batch_id,
      v_final.report,
      'Importação de histórico confirmada pelo dono.'
    );
  end if;

  return jsonb_build_object(
    'status', v_final.status,
    'cursor', v_final.import_cursor,
    'messageCount', v_final.message_count,
    'importedMessageCount', v_final.imported_message_count,
    'duplicateMessageCount', v_final.duplicate_message_count,
    'completed', v_final.status = 'completed',
    'report', v_final.report
  );
end;
$$;

revoke all on function public.import_whatsapp_history_chunk(
  uuid,
  integer,
  jsonb
) from public, anon, authenticated;
grant execute on function public.import_whatsapp_history_chunk(
  uuid,
  integer,
  jsonb
) to service_role;

comment on table public.whatsapp_history_imports is
  'Lotes owner-only para prévia e importação segura de históricos JSONL.';
comment on column public.contacts.automation_status is
  'Trava central para IA, fluxos, automações e follow-ups automáticos.';
comment on column public.conversations.ai_context_started_at is
  'Limite inferior do contexto permitido para a IA; exclui o histórico importado.';
comment on column public.messages.is_historical is
  'Mensagem importada apenas para consulta, nunca tratada como uma instrução.';
