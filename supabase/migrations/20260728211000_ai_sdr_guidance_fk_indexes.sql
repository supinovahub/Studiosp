-- Índices de cobertura identificados pelo advisor após a criação das
-- estruturas de orientação e segurança da IA.

create index if not exists ai_guidance_requests_contact_idx
  on public.ai_guidance_requests(contact_id);

create index if not exists ai_guidance_rules_conversation_idx
  on public.ai_guidance_rules(conversation_id)
  where conversation_id is not null;

create index if not exists ai_security_events_message_idx
  on public.ai_security_events(message_id)
  where message_id is not null;
