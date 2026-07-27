-- O staging possuía políticas administrativas separadas criadas após a base
-- local. As políticas consolidadas já incluem gestão e corretor.
drop policy if exists availability_exceptions_admin_insert
  on public.availability_exceptions;
drop policy if exists availability_exceptions_admin_update
  on public.availability_exceptions;
drop policy if exists availability_exceptions_admin_delete
  on public.availability_exceptions;
