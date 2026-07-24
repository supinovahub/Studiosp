alter table public.broker_profiles
  drop constraint if exists broker_profiles_whatsapp_e164_check;

alter table public.broker_profiles
  add constraint broker_profiles_whatsapp_e164_check
  check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$');
