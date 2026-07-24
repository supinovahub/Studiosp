-- Índices de apoio para as chaves estrangeiras do controle de importação.

create index if not exists whatsapp_history_imports_config_idx
  on public.whatsapp_history_imports(whatsapp_config_id);

create index if not exists whatsapp_history_imports_creator_profile_idx
  on public.whatsapp_history_imports(created_by_profile_id)
  where created_by_profile_id is not null;

create index if not exists whatsapp_history_imports_creator_user_idx
  on public.whatsapp_history_imports(created_by_user_id);
