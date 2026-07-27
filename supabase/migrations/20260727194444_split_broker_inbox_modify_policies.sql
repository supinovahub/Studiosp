-- Separa leitura e mutações para evitar que políticas FOR ALL sejam
-- reavaliadas junto da política SELECT em cada linha do inbox.

drop policy if exists message_reactions_modify_assigned
  on public.message_reactions;
drop policy if exists message_reactions_insert_assigned
  on public.message_reactions;
drop policy if exists message_reactions_update_assigned
  on public.message_reactions;
drop policy if exists message_reactions_delete_assigned
  on public.message_reactions;

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

drop policy if exists contact_tags_modify_assigned
  on public.contact_tags;
drop policy if exists contact_tags_insert_assigned
  on public.contact_tags;
drop policy if exists contact_tags_update_assigned
  on public.contact_tags;
drop policy if exists contact_tags_delete_assigned
  on public.contact_tags;

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

drop policy if exists contact_custom_values_modify_assigned
  on public.contact_custom_values;
drop policy if exists contact_custom_values_insert_assigned
  on public.contact_custom_values;
drop policy if exists contact_custom_values_update_assigned
  on public.contact_custom_values;
drop policy if exists contact_custom_values_delete_assigned
  on public.contact_custom_values;

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
