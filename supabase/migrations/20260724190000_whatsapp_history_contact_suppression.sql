-- Alguns chats antigos contêm somente eventos técnicos, sem mensagem útil.
-- Ainda assim o número precisa receber a mesma trava operacional.

create or replace function public.suppress_whatsapp_history_contacts(
  p_batch_id uuid,
  p_contacts jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.whatsapp_history_imports%rowtype;
  v_contact jsonb;
  v_phone text;
  v_name text;
  v_originated_at timestamptz;
  v_count integer := 0;
begin
  if jsonb_typeof(p_contacts) <> 'array' then
    raise exception 'A lista de contatos é inválida.';
  end if;
  if jsonb_array_length(p_contacts) > 5000 then
    raise exception 'A lista excede o limite de 5000 contatos.';
  end if;

  select *
  into v_batch
  from public.whatsapp_history_imports
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Importação não encontrada.';
  end if;
  if v_batch.status not in ('ready', 'importing') then
    raise exception 'Esta importação não está pronta para confirmação.';
  end if;

  for v_contact in
    select value from jsonb_array_elements(p_contacts)
  loop
    v_phone := regexp_replace(
      coalesce(v_contact->>'phone', ''),
      '\D',
      '',
      'g'
    );
    v_name := nullif(btrim(coalesce(v_contact->>'name', '')), '');
    v_originated_at := nullif(v_contact->>'originatedAt', '')::timestamptz;
    if v_phone !~ '^[1-9][0-9]{6,14}$' then
      raise exception 'Telefone normalizado inválido na lista de contatos.';
    end if;

    insert into public.contacts (
      account_id,
      user_id,
      phone,
      name,
      source_type,
      source_metadata,
      originated_at,
      automation_status,
      automation_block_reason,
      automation_blocked_at,
      automation_blocked_by_import_id
    )
    values (
      v_batch.account_id,
      v_batch.created_by_user_id,
      v_phone,
      coalesce(v_name, v_phone),
      'other',
      jsonb_build_object(
        'historical_import', true,
        'history_import_id', p_batch_id
      ),
      v_originated_at,
      'suppressed',
      'historical_import',
      now(),
      p_batch_id
    )
    on conflict (account_id, phone_normalized)
      where phone_normalized <> ''
    do update set
      automation_status = 'suppressed',
      automation_block_reason = 'historical_import',
      automation_blocked_at = now(),
      automation_blocked_by_import_id = p_batch_id,
      originated_at = case
        when excluded.originated_at is null
          then public.contacts.originated_at
        else least(
          coalesce(public.contacts.originated_at, excluded.originated_at),
          excluded.originated_at
        )
      end,
      source_metadata = coalesce(public.contacts.source_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'historical_import', true,
          'history_import_id', p_batch_id
        ),
      updated_at = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.suppress_whatsapp_history_contacts(
  uuid,
  jsonb
) from public, anon, authenticated;
grant execute on function public.suppress_whatsapp_history_contacts(
  uuid,
  jsonb
) to service_role;
