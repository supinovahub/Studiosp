-- Separate trusted operational instructions from the communication style
-- editable in the dashboard. Existing dashboard content was historically
-- stored in system_prompt, so preserve it as communication preferences and
-- clear the trusted field during the one-time migration.
alter table public.ai_configs
  add column if not exists communication_prompt text;

update public.ai_configs
set communication_prompt = coalesce(communication_prompt, system_prompt)
where system_prompt is not null;

update public.ai_configs
set system_prompt = null
where system_prompt is not null;

comment on column public.ai_configs.system_prompt is
  'Trusted operational instructions. Server-side only; never exposed or writable through the dashboard API.';

comment on column public.ai_configs.communication_prompt is
  'Dashboard-editable communication style preferences. Must not control tools, policies, facts, or actions.';
