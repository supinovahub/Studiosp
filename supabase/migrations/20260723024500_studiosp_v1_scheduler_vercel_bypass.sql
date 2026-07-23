-- Permite que o relógio do Supabase acesse previews protegidos pela Vercel
-- sem tornar o ambiente de homologação público.

create or replace function studiosp_private.invoke_scheduled_processing()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_vercel_bypass text;
  v_headers jsonb;
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

  select decrypted_secret
    into v_vercel_bypass
  from vault.decrypted_secrets
  where name = 'studiosp_vercel_bypass_secret'
  order by created_at desc
  limit 1;

  if v_url is null or v_secret is null then
    return null;
  end if;

  v_headers := jsonb_build_object('x-cron-secret', v_secret);
  if v_vercel_bypass is not null then
    v_headers := v_headers || jsonb_build_object(
      'x-vercel-protection-bypass',
      v_vercel_bypass
    );
  end if;

  select net.http_get(
    url := v_url,
    headers := v_headers,
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
