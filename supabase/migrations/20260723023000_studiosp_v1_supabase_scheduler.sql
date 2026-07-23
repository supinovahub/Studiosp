-- Studiosp V1: relógio operacional independente do plano da Vercel.
-- A URL e o segredo ficam no Vault do ambiente e não entram no repositório.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create or replace function studiosp_private.invoke_scheduled_processing()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_url
  from vault.decrypted_secrets
  where name = 'studiosp_scheduler_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'studiosp_scheduler_secret'
  order by created_at desc
  limit 1;

  if v_url is null or v_secret is null then
    return null;
  end if;

  select net.http_get(
    url := v_url,
    headers := jsonb_build_object('x-cron-secret', v_secret),
    timeout_milliseconds := 15000
  )
  into v_request_id;

  return v_request_id;
exception
  when others then
    raise warning 'Studiosp: falha ao enfileirar processamento agendado: %', sqlerrm;
    return null;
end;
$$;

revoke all on function studiosp_private.invoke_scheduled_processing()
from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'studiosp-v1-processing-every-five-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'studiosp-v1-processing-every-five-minutes',
  '*/5 * * * *',
  'select studiosp_private.invoke_scheduled_processing();'
);
