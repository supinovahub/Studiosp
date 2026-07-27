alter table public.ai_configs
  add column if not exists auto_reply_allowed_numbers text[] not null default '{}';

comment on column public.ai_configs.auto_reply_allowed_numbers is
  'Números E.164 autorizados a acionar a resposta automática. Lista vazia libera todos.';
