-- Consolida políticas permissivas da agenda para que cada operação execute
-- uma única expressão de autorização, sem perder a separação dono/corretor.

drop policy if exists broker_availability_rules_admin_all
  on public.broker_availability_rules;
drop policy if exists broker_availability_rules_broker_insert
  on public.broker_availability_rules;
drop policy if exists broker_availability_rules_broker_update
  on public.broker_availability_rules;
drop policy if exists broker_availability_rules_broker_delete
  on public.broker_availability_rules;

create policy broker_availability_rules_write_insert
on public.broker_availability_rules
for insert to authenticated
with check (
  (select studiosp_private.is_account_admin(account_id))
  or (
    broker_profile_id =
      (select studiosp_private.current_broker_id(account_id))
    and created_by =
      (select studiosp_private.current_profile_id(account_id))
  )
);

create policy broker_availability_rules_write_update
on public.broker_availability_rules
for update to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
)
with check (
  (select studiosp_private.is_account_admin(account_id))
  or (
    broker_profile_id =
      (select studiosp_private.current_broker_id(account_id))
    and created_by =
      (select studiosp_private.current_profile_id(account_id))
  )
);

create policy broker_availability_rules_write_delete
on public.broker_availability_rules
for delete to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or broker_profile_id =
    (select studiosp_private.current_broker_id(account_id))
);

drop policy if exists availability_exceptions_admin_all
  on public.availability_exceptions;
drop policy if exists availability_exceptions_broker_insert
  on public.availability_exceptions;
drop policy if exists availability_exceptions_broker_update
  on public.availability_exceptions;
drop policy if exists availability_exceptions_broker_delete
  on public.availability_exceptions;

create policy availability_exceptions_write_insert
on public.availability_exceptions
for insert to authenticated
with check (
  (select studiosp_private.is_account_admin(account_id))
  or (
    exception_type = 'blocked'
    and capacity_delta is null
    and broker_profile_id =
      (select studiosp_private.current_broker_id(account_id))
    and created_by =
      (select studiosp_private.current_profile_id(account_id))
  )
);

create policy availability_exceptions_write_update
on public.availability_exceptions
for update to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (
    exception_type = 'blocked'
    and broker_profile_id =
      (select studiosp_private.current_broker_id(account_id))
  )
)
with check (
  (select studiosp_private.is_account_admin(account_id))
  or (
    exception_type = 'blocked'
    and capacity_delta is null
    and broker_profile_id =
      (select studiosp_private.current_broker_id(account_id))
    and created_by =
      (select studiosp_private.current_profile_id(account_id))
  )
);

create policy availability_exceptions_write_delete
on public.availability_exceptions
for delete to authenticated
using (
  (select studiosp_private.is_account_admin(account_id))
  or (
    exception_type = 'blocked'
    and broker_profile_id =
      (select studiosp_private.current_broker_id(account_id))
  )
);
