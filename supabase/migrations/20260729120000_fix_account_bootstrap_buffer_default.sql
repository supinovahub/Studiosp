-- A política passou a exigir intervalo mínimo de 10 minutos, mas o default
-- histórico permaneceu em 5. Isso impedia a criação de contas em bancos novos.

alter table public.scheduling_policies
  alter column buffer_minutes set default 10;

update public.scheduling_policies
set buffer_minutes = 10
where buffer_minutes < 10;
