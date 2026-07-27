-- Corretor só acessa o lead depois de aceitar a atribuição da reunião.
-- O WhatsApp operacional passa a ser obrigatório antes de o corretor ficar
-- disponível ou acessar o dashboard.

create or replace function studiosp_private.can_access_contact(
  p_account_id uuid,
  p_contact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    studiosp_private.is_account_admin(p_account_id)
    or exists (
      select 1
      from public.profiles p
      where p.account_id = p_account_id
        and p.user_id = (select auth.uid())
        and p.account_role = 'viewer'
    )
    or exists (
      select 1
      from public.opportunities o
      where o.account_id = p_account_id
        and o.contact_id = p_contact_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_manage_contact(
  p_account_id uuid,
  p_contact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    studiosp_private.is_account_admin(p_account_id)
    or exists (
      select 1
      from public.opportunities o
      where o.account_id = p_account_id
        and o.contact_id = p_contact_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_access_conversation(
  p_account_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    studiosp_private.is_account_admin(p_account_id)
    or exists (
      select 1
      from public.profiles p
      where p.account_id = p_account_id
        and p.user_id = (select auth.uid())
        and p.account_role = 'viewer'
    )
    or exists (
      select 1
      from public.opportunities o
      where o.account_id = p_account_id
        and o.primary_conversation_id = p_conversation_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

create or replace function studiosp_private.can_manage_conversation(
  p_account_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    studiosp_private.is_account_admin(p_account_id)
    or exists (
      select 1
      from public.opportunities o
      where o.account_id = p_account_id
        and o.primary_conversation_id = p_conversation_id
        and o.assigned_broker_id =
          studiosp_private.current_broker_id(p_account_id)
    );
$$;

alter function studiosp_private.can_access_contact(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_manage_contact(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_access_conversation(uuid, uuid)
  owner to postgres;
alter function studiosp_private.can_manage_conversation(uuid, uuid)
  owner to postgres;
revoke all on function studiosp_private.can_access_contact(uuid, uuid)
  from public, anon;
revoke all on function studiosp_private.can_manage_contact(uuid, uuid)
  from public, anon;
revoke all on function studiosp_private.can_access_conversation(uuid, uuid)
  from public, anon;
revoke all on function studiosp_private.can_manage_conversation(uuid, uuid)
  from public, anon;
grant execute on function studiosp_private.can_access_contact(uuid, uuid)
  to authenticated, service_role;
grant execute on function studiosp_private.can_manage_contact(uuid, uuid)
  to authenticated, service_role;
grant execute on function studiosp_private.can_access_conversation(uuid, uuid)
  to authenticated, service_role;
grant execute on function studiosp_private.can_manage_conversation(uuid, uuid)
  to authenticated, service_role;

create index if not exists opportunities_broker_contact_access_idx
  on public.opportunities(account_id, assigned_broker_id, contact_id)
  where assigned_broker_id is not null;
create index if not exists opportunities_broker_conversation_access_idx
  on public.opportunities(
    account_id,
    assigned_broker_id,
    primary_conversation_id
  )
  where assigned_broker_id is not null
    and primary_conversation_id is not null;

-- As políticas herdadas liberavam o inbox inteiro para qualquer membro da
-- conta. Dono/administrador continuam com visão global; corretor passa a
-- depender da atribuição persistida em opportunities.assigned_broker_id.
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;
drop policy if exists contacts_select_assigned on public.contacts;
drop policy if exists contacts_admin_insert on public.contacts;
drop policy if exists contacts_update_assigned on public.contacts;
drop policy if exists contacts_admin_delete on public.contacts;

create policy contacts_select_assigned
on public.contacts
for select to authenticated
using (
  (select studiosp_private.can_access_contact(account_id, id))
);
create policy contacts_admin_insert
on public.contacts
for insert to authenticated
with check (
  (select studiosp_private.is_account_admin(account_id))
);
create policy contacts_update_assigned
on public.contacts
for update to authenticated
using (
  (select studiosp_private.can_manage_contact(account_id, id))
)
with check (
  (select studiosp_private.can_manage_contact(account_id, id))
);
create policy contacts_admin_delete
on public.contacts
for delete to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
);

drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists conversations_delete on public.conversations;
drop policy if exists conversations_select_assigned on public.conversations;
drop policy if exists conversations_admin_insert on public.conversations;
drop policy if exists conversations_update_assigned on public.conversations;
drop policy if exists conversations_admin_delete on public.conversations;

create policy conversations_select_assigned
on public.conversations
for select to authenticated
using (
  (select studiosp_private.can_access_conversation(account_id, id))
);
create policy conversations_admin_insert
on public.conversations
for insert to authenticated
with check (
  (select studiosp_private.is_account_admin(account_id))
);
create policy conversations_update_assigned
on public.conversations
for update to authenticated
using (
  (select studiosp_private.can_manage_conversation(account_id, id))
)
with check (
  (select studiosp_private.can_manage_conversation(account_id, id))
);
create policy conversations_admin_delete
on public.conversations
for delete to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
);

drop policy if exists messages_select on public.messages;
drop policy if exists messages_modify on public.messages;
drop policy if exists messages_select_assigned on public.messages;
drop policy if exists messages_insert_assigned on public.messages;
drop policy if exists messages_update_assigned on public.messages;

create policy messages_select_assigned
on public.messages
for select to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.account_id = messages.account_id
      and studiosp_private.can_access_conversation(c.account_id, c.id)
  )
);
create policy messages_insert_assigned
on public.messages
for insert to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.account_id = messages.account_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
);
create policy messages_update_assigned
on public.messages
for update to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.account_id = messages.account_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.account_id = messages.account_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
);

drop policy if exists message_reactions_select
  on public.message_reactions;
drop policy if exists message_reactions_modify
  on public.message_reactions;
drop policy if exists message_reactions_select_assigned
  on public.message_reactions;
drop policy if exists message_reactions_insert_assigned
  on public.message_reactions;
drop policy if exists message_reactions_update_assigned
  on public.message_reactions;
drop policy if exists message_reactions_delete_assigned
  on public.message_reactions;

create policy message_reactions_select_assigned
on public.message_reactions
for select to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = message_reactions.conversation_id
      and studiosp_private.can_access_conversation(c.account_id, c.id)
  )
);
create policy message_reactions_insert_assigned
on public.message_reactions
for insert to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = message_reactions.conversation_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
);
create policy message_reactions_update_assigned
on public.message_reactions
for update to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = message_reactions.conversation_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = message_reactions.conversation_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
);
create policy message_reactions_delete_assigned
on public.message_reactions
for delete to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = message_reactions.conversation_id
      and studiosp_private.can_manage_conversation(c.account_id, c.id)
  )
);

-- O painel lateral do inbox não pode funcionar como caminho alternativo para
-- consultar tags, notas, campos personalizados ou deals de outro corretor.
drop policy if exists contact_notes_select on public.contact_notes;
drop policy if exists contact_notes_insert on public.contact_notes;
drop policy if exists contact_notes_update on public.contact_notes;
drop policy if exists contact_notes_delete on public.contact_notes;
drop policy if exists contact_notes_select_assigned on public.contact_notes;
drop policy if exists contact_notes_insert_assigned on public.contact_notes;
drop policy if exists contact_notes_update_assigned on public.contact_notes;
drop policy if exists contact_notes_delete_assigned on public.contact_notes;

create policy contact_notes_select_assigned
on public.contact_notes
for select to authenticated
using (
  (select studiosp_private.can_access_contact(account_id, contact_id))
);
create policy contact_notes_insert_assigned
on public.contact_notes
for insert to authenticated
with check (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
);
create policy contact_notes_update_assigned
on public.contact_notes
for update to authenticated
using (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
)
with check (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
);
create policy contact_notes_delete_assigned
on public.contact_notes
for delete to authenticated
using (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
);

drop policy if exists contact_tags_select on public.contact_tags;
drop policy if exists contact_tags_modify on public.contact_tags;
drop policy if exists contact_tags_select_assigned on public.contact_tags;
drop policy if exists contact_tags_insert_assigned on public.contact_tags;
drop policy if exists contact_tags_update_assigned on public.contact_tags;
drop policy if exists contact_tags_delete_assigned on public.contact_tags;

create policy contact_tags_select_assigned
on public.contact_tags
for select to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_tags.contact_id
      and studiosp_private.can_access_contact(c.account_id, c.id)
  )
);
create policy contact_tags_insert_assigned
on public.contact_tags
for insert to authenticated
with check (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_tags.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
);
create policy contact_tags_update_assigned
on public.contact_tags
for update to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_tags.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
)
with check (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_tags.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
);
create policy contact_tags_delete_assigned
on public.contact_tags
for delete to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_tags.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
);

drop policy if exists contact_custom_values_select
  on public.contact_custom_values;
drop policy if exists contact_custom_values_modify
  on public.contact_custom_values;
drop policy if exists contact_custom_values_select_assigned
  on public.contact_custom_values;
drop policy if exists contact_custom_values_insert_assigned
  on public.contact_custom_values;
drop policy if exists contact_custom_values_update_assigned
  on public.contact_custom_values;
drop policy if exists contact_custom_values_delete_assigned
  on public.contact_custom_values;

create policy contact_custom_values_select_assigned
on public.contact_custom_values
for select to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_custom_values.contact_id
      and studiosp_private.can_access_contact(c.account_id, c.id)
  )
);
create policy contact_custom_values_insert_assigned
on public.contact_custom_values
for insert to authenticated
with check (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_custom_values.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
);
create policy contact_custom_values_update_assigned
on public.contact_custom_values
for update to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_custom_values.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
)
with check (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_custom_values.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
);
create policy contact_custom_values_delete_assigned
on public.contact_custom_values
for delete to authenticated
using (
  exists (
    select 1
    from public.contacts c
    where c.id = contact_custom_values.contact_id
      and studiosp_private.can_manage_contact(c.account_id, c.id)
  )
);

drop policy if exists deals_select on public.deals;
drop policy if exists deals_insert on public.deals;
drop policy if exists deals_update on public.deals;
drop policy if exists deals_delete on public.deals;
drop policy if exists deals_select_assigned on public.deals;
drop policy if exists deals_insert_assigned on public.deals;
drop policy if exists deals_update_assigned on public.deals;
drop policy if exists deals_admin_delete on public.deals;

create policy deals_select_assigned
on public.deals
for select to authenticated
using (
  (select studiosp_private.can_access_contact(account_id, contact_id))
);
create policy deals_insert_assigned
on public.deals
for insert to authenticated
with check (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
);
create policy deals_update_assigned
on public.deals
for update to authenticated
using (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
)
with check (
  (select studiosp_private.can_manage_contact(account_id, contact_id))
);
create policy deals_admin_delete
on public.deals
for delete to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
);

-- Perfis sem WhatsApp confirmado não entram em novas distribuições. O perfil
-- continua ativo para preservar histórico e permitir concluir o onboarding.
update public.broker_profiles
set is_available = false
where is_available
  and (
    whatsapp_e164 is null
    or whatsapp_verified_at is null
  );

alter table public.broker_profiles
  drop constraint if exists broker_profiles_available_requires_whatsapp;
alter table public.broker_profiles
  add constraint broker_profiles_available_requires_whatsapp
  check (
    not is_available
    or (
      whatsapp_e164 is not null
      and whatsapp_verified_at is not null
    )
  );

create or replace function studiosp_private.sync_broker_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    old.account_role = 'agent'
    and (
      new.account_role <> 'agent'
      or new.account_id <> old.account_id
    )
  ) then
    update public.broker_profiles
    set is_active = false,
        is_available = false
    where profile_id = old.id
      and account_id = old.account_id;
  end if;

  if new.account_role = 'agent' then
    insert into public.broker_profiles (
      account_id,
      profile_id,
      display_name,
      is_available,
      is_active
    ) values (
      new.account_id,
      new.id,
      coalesce(
        nullif(trim(new.full_name), ''),
        nullif(trim(new.email), ''),
        'Corretor'
      ),
      false,
      true
    )
    on conflict (account_id, profile_id) do update
      set display_name = excluded.display_name,
          is_active = true;
  end if;

  return new;
end;
$$;

alter function studiosp_private.sync_broker_profile() owner to postgres;
revoke all on function studiosp_private.sync_broker_profile()
  from public, anon, authenticated;

create or replace function public.studiosp_register_my_broker_whatsapp(
  p_whatsapp_e164 text
)
returns public.broker_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles;
  v_broker public.broker_profiles;
  v_digits text;
  v_whatsapp_e164 text;
begin
  if v_user_id is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  v_digits := regexp_replace(
    coalesce(p_whatsapp_e164, ''),
    '[^0-9]',
    '',
    'g'
  );
  v_whatsapp_e164 := '+' || v_digits;

  if v_whatsapp_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Informe um WhatsApp válido com DDI.'
      using errcode = '23514';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.account_role = 'agent'
  limit 1;

  if not found then
    raise exception 'Somente corretores podem registrar este WhatsApp.'
      using errcode = '42501';
  end if;

  update public.broker_profiles bp
  set whatsapp_e164 = v_whatsapp_e164,
      whatsapp_verified_at = now(),
      is_available = true,
      unavailable_until = null,
      notification_preferences =
        coalesce(bp.notification_preferences, '{}'::jsonb)
        || jsonb_build_object(
          'whatsapp', true,
          'whatsapp_consent_at', now(),
          'whatsapp_verification_method',
          'authenticated_self_confirmation'
        )
  where bp.account_id = v_profile.account_id
    and bp.profile_id = v_profile.id
    and bp.is_active
  returning bp.* into v_broker;

  if not found then
    raise exception 'Perfil operacional de corretor não encontrado.'
      using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    next_data,
    reason
  ) values (
    v_broker.account_id,
    'user',
    v_profile.id,
    'broker_whatsapp_confirmed',
    'broker_profile',
    v_broker.id,
    jsonb_build_object(
      'whatsapp_configured', true,
      'whatsapp_last4', right(v_broker.whatsapp_e164, 4),
      'whatsapp_verified_at', v_broker.whatsapp_verified_at
    ),
    'Confirmação autenticada no onboarding do corretor'
  );

  return v_broker;
end;
$$;

alter function public.studiosp_register_my_broker_whatsapp(text)
  owner to postgres;
revoke all on function public.studiosp_register_my_broker_whatsapp(text)
  from public, anon;
grant execute on function public.studiosp_register_my_broker_whatsapp(text)
  to authenticated;

-- O wrapper mantém o resgate e o cadastro do WhatsApp na mesma transação.
-- Qualquer falha de validação ou duplicidade também desfaz o convite.
create or replace function public.redeem_invitation_with_broker_whatsapp(
  p_token_hash text,
  p_whatsapp_e164 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.account_invitations;
  v_account_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  select ai.* into v_invitation
  from public.account_invitations ai
  where ai.token_hash = p_token_hash;

  if not found then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;

  if v_invitation.role = 'agent' and (
    p_whatsapp_e164 is null
    or length(trim(p_whatsapp_e164)) = 0
  ) then
    raise exception 'Informe o WhatsApp do corretor com DDI.'
      using errcode = '23514';
  end if;

  v_account_id := public.redeem_invitation(p_token_hash);

  if v_invitation.role = 'agent' then
    begin
      perform public.studiosp_register_my_broker_whatsapp(p_whatsapp_e164);
    exception
      when unique_violation then
        raise exception 'Este WhatsApp já pertence a outro corretor.'
          using errcode = 'P0001';
    end;
  end if;

  return v_account_id;
end;
$$;

alter function public.redeem_invitation_with_broker_whatsapp(text, text)
  owner to postgres;
revoke all on function public.redeem_invitation_with_broker_whatsapp(text, text)
  from public, anon;
grant execute on function
  public.redeem_invitation_with_broker_whatsapp(text, text)
  to authenticated;

-- Evita que clientes antigos contornem a etapa obrigatória chamando o RPC
-- anterior diretamente. O wrapper continua autorizado a executá-lo como
-- função SECURITY DEFINER pertencente ao postgres.
revoke execute on function public.redeem_invitation(text)
  from authenticated;

comment on function studiosp_private.can_access_contact(uuid, uuid) is
  'Dono/admin e analista leem a conta; corretor lê somente contato atribuído.';
comment on function studiosp_private.can_manage_contact(uuid, uuid) is
  'Dono/admin gerencia a conta; corretor gerencia somente contato atribuído.';
comment on function studiosp_private.can_access_conversation(uuid, uuid) is
  'Dono/admin e analista leem a conta; corretor lê somente conversa atribuída.';
comment on function studiosp_private.can_manage_conversation(uuid, uuid) is
  'Dono/admin gerencia a conta; corretor gerencia somente conversa atribuída.';
comment on function public.studiosp_register_my_broker_whatsapp(text) is
  'Confirma o WhatsApp do corretor autenticado e libera sua disponibilidade.';
