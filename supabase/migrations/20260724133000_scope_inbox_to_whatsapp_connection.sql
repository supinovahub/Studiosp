alter table public.conversations
  add column if not exists whatsapp_connection_key text;

alter table public.messages
  add column if not exists whatsapp_connection_key text;

create index if not exists conversations_connection_inbox_idx
  on public.conversations (
    account_id,
    whatsapp_connection_key,
    last_message_at desc
  );

create index if not exists messages_connection_thread_idx
  on public.messages (
    conversation_id,
    whatsapp_connection_key,
    created_at
  );

create or replace function studiosp_private.current_whatsapp_connection_key(
  p_account_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select
    wc.provider || ':' ||
    coalesce(
      nullif(wc.uazapi_instance_id, ''),
      nullif(wc.phone_number_id, ''),
      wc.id::text
    )
  from public.whatsapp_config wc
  where wc.account_id = p_account_id
  limit 1;
$$;

revoke all on function
  studiosp_private.current_whatsapp_connection_key(uuid)
from public, anon, authenticated;

create or replace function studiosp_private.scope_message_to_whatsapp_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.whatsapp_connection_key is null then
    new.whatsapp_connection_key :=
      studiosp_private.current_whatsapp_connection_key(new.account_id);
  end if;

  if new.whatsapp_connection_key is not null then
    update public.conversations
    set whatsapp_connection_key = new.whatsapp_connection_key
    where id = new.conversation_id
      and account_id = new.account_id;
  end if;

  return new;
end;
$$;

revoke all on function
  studiosp_private.scope_message_to_whatsapp_connection()
from public, anon, authenticated;

drop trigger if exists messages_scope_whatsapp_connection
  on public.messages;

create trigger messages_scope_whatsapp_connection
before insert on public.messages
for each row
execute function studiosp_private.scope_message_to_whatsapp_connection();

with active_connections as (
  select
    account_id,
    connected_at,
    provider || ':' ||
      coalesce(
        nullif(uazapi_instance_id, ''),
        nullif(phone_number_id, ''),
        id::text
      ) as connection_key
  from public.whatsapp_config
  where connected_at is not null
)
update public.messages m
set whatsapp_connection_key = ac.connection_key
from active_connections ac
where m.account_id = ac.account_id
  and m.whatsapp_connection_key is null
  and coalesce(m.provider_received_at, m.created_at) >= ac.connected_at;

with active_connections as (
  select
    account_id,
    connected_at,
    provider || ':' ||
      coalesce(
        nullif(uazapi_instance_id, ''),
        nullif(phone_number_id, ''),
        id::text
      ) as connection_key
  from public.whatsapp_config
  where connected_at is not null
)
update public.conversations c
set whatsapp_connection_key = ac.connection_key
from active_connections ac
where c.account_id = ac.account_id
  and c.whatsapp_connection_key is null
  and c.last_message_at >= ac.connected_at;

comment on column public.conversations.whatsapp_connection_key is
  'Identidade da conexão WhatsApp que possui a conversa no inbox atual.';

comment on column public.messages.whatsapp_connection_key is
  'Identidade da conexão WhatsApp usada para isolar históricos de números distintos.';
