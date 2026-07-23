-- Mantém compatibilidade com todos os emissores herdados enquanto projeta
-- cada mensagem no modelo operacional da V1.

create or replace function studiosp_private.project_message_fields()
returns trigger
language plpgsql
security definer
set search_path = public, studiosp_private
as $$
begin
  if new.account_id is null then
    select c.account_id into new.account_id
    from public.conversations c
    where c.id = new.conversation_id;
  end if;

  if new.author_type is null then
    new.author_type := case
      when new.sender_type = 'customer' then 'lead'
      when new.sender_type = 'bot' and coalesce(new.ai_generated, false) then 'ai'
      when new.sender_type = 'bot' then 'system'
      when new.sender_type = 'agent' then 'broker'
      else 'system'
    end;
  end if;

  return new;
end;
$$;

revoke all on function studiosp_private.project_message_fields()
  from public, anon, authenticated;

drop trigger if exists studiosp_project_message_fields on public.messages;
create trigger studiosp_project_message_fields
before insert or update of conversation_id, sender_type, ai_generated
on public.messages
for each row execute function studiosp_private.project_message_fields();

update public.messages
set author_type = case
  when sender_type = 'customer' then 'lead'
  when sender_type = 'bot' and coalesce(ai_generated, false) then 'ai'
  when sender_type = 'bot' then 'system'
  when sender_type = 'agent' then 'broker'
  else 'system'
end
where author_type is null;

alter table public.assignment_offers
  add column if not exists notified_at timestamptz,
  add column if not exists last_notification_attempt_at timestamptz,
  add column if not exists notification_attempts integer not null default 0
    check (notification_attempts >= 0);

create index if not exists assignment_offers_notification_queue_idx
  on public.assignment_offers(account_id, offered_at, id)
  where status = 'pending' and notified_at is null;
