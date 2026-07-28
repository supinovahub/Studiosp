-- Link global e reutilizável para entrada de corretores.
-- Versão alinhada ao registro aplicado no projeto Studiosp Staging.
--
-- O token em texto puro nunca é persistido: a aplicação entrega a URL ao
-- dono somente na criação/rotação e o banco guarda apenas o SHA-256. O mesmo
-- link pode ser resgatado por vários usuários, mas cada usuário fica
-- registrado uma única vez. Convites individuais continuam usando
-- account_invitations sem qualquer mudança de semântica.

create table public.broker_invite_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint broker_invite_links_active_revocation_check check (
    (is_active and revoked_at is null)
    or (not is_active and revoked_at is not null)
  )
);

create unique index broker_invite_links_one_active_per_account_idx
  on public.broker_invite_links(account_id)
  where is_active;

create index broker_invite_links_created_by_user_id_idx
  on public.broker_invite_links(created_by_user_id)
  where created_by_user_id is not null;

create trigger broker_invite_links_updated_at
before update on public.broker_invite_links
for each row execute function studiosp_private.set_updated_at();

create table public.broker_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null
    references public.broker_invite_links(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  constraint broker_invite_redemptions_link_user_key
    unique (link_id, user_id)
);

create index broker_invite_redemptions_profile_id_idx
  on public.broker_invite_redemptions(profile_id);

create index broker_invite_redemptions_user_id_idx
  on public.broker_invite_redemptions(user_id);

alter table public.broker_invite_links enable row level security;
alter table public.broker_invite_redemptions enable row level security;

revoke all on table public.broker_invite_links
  from public, anon, authenticated;
revoke all on table public.broker_invite_redemptions
  from public, anon, authenticated;

grant select on table public.broker_invite_links to authenticated;
grant select on table public.broker_invite_redemptions to authenticated;

create policy broker_invite_links_owner_select
on public.broker_invite_links
for select
to authenticated
using (
  (select public.is_account_member(account_id, 'owner'))
);

create policy broker_invite_redemptions_owner_select
on public.broker_invite_redemptions
for select
to authenticated
using (
  exists (
    select 1
    from public.broker_invite_links link
    where link.id = broker_invite_redemptions.link_id
      and (select public.is_account_member(link.account_id, 'owner'))
  )
);

-- Retorna apenas os dados públicos necessários à tela de entrada. A tabela
-- permanece invisível para anon/authenticated; o token de 256 bits e o rate
-- limit da rota pública impedem enumeração prática.
create or replace function public.peek_global_broker_invite(
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_name text;
begin
  select account.name
  into v_account_name
  from public.broker_invite_links link
  join public.accounts account on account.id = link.account_id
  where link.token_hash = p_token_hash
    and link.is_active;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', 'global_broker',
    'account_name', v_account_name,
    'role', 'agent'
  );
end;
$$;

alter function public.peek_global_broker_invite(text) owner to postgres;
revoke all on function public.peek_global_broker_invite(text)
  from public, anon, authenticated;
grant execute on function public.peek_global_broker_invite(text)
  to anon, authenticated;

-- Rotação atômica: há no máximo um link ativo por conta. O lock curto na
-- conta serializa dois cliques concorrentes sem manter transações abertas
-- durante qualquer chamada externa.
create or replace function public.studiosp_rotate_global_broker_invite(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles;
  v_previous_link_id uuid;
  v_link public.broker_invite_links;
begin
  if v_user_id is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token de convite inválido.' using errcode = '22023';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.user_id = v_user_id
    and profile.account_role = 'owner'
  limit 1;

  if not found then
    raise exception 'Somente o dono pode gerenciar o link global.'
      using errcode = '42501';
  end if;

  perform 1
  from public.accounts account
  where account.id = v_profile.account_id
  for update;

  update public.broker_invite_links link
  set is_active = false,
      revoked_at = now()
  where link.account_id = v_profile.account_id
    and link.is_active
  returning link.id into v_previous_link_id;

  insert into public.broker_invite_links (
    account_id,
    token_hash,
    created_by_user_id
  ) values (
    v_profile.account_id,
    p_token_hash,
    v_user_id
  )
  returning * into v_link;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    previous_data,
    next_data,
    reason
  ) values (
    v_profile.account_id,
    'user',
    v_profile.id,
    case
      when v_previous_link_id is null
        then 'global_broker_invite_created'
      else 'global_broker_invite_rotated'
    end,
    'broker_invite_link',
    v_link.id,
    case
      when v_previous_link_id is null then null
      else jsonb_build_object('link_id', v_previous_link_id)
    end,
    jsonb_build_object('link_id', v_link.id, 'is_active', true),
    'Link global de entrada de corretores gerenciado pelo dono'
  );

  return jsonb_build_object(
    'id', v_link.id,
    'created_at', v_link.created_at
  );
end;
$$;

alter function public.studiosp_rotate_global_broker_invite(text)
  owner to postgres;
revoke all on function public.studiosp_rotate_global_broker_invite(text)
  from public, anon, authenticated;
grant execute on function public.studiosp_rotate_global_broker_invite(text)
  to authenticated;

create or replace function public.studiosp_disable_global_broker_invite()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles;
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.user_id = v_user_id
    and profile.account_role = 'owner'
  limit 1;

  if not found then
    raise exception 'Somente o dono pode gerenciar o link global.'
      using errcode = '42501';
  end if;

  perform 1
  from public.accounts account
  where account.id = v_profile.account_id
  for update;

  update public.broker_invite_links link
  set is_active = false,
      revoked_at = now()
  where link.account_id = v_profile.account_id
    and link.is_active
  returning link.id into v_link_id;

  if v_link_id is null then
    return false;
  end if;

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    previous_data,
    next_data,
    reason
  ) values (
    v_profile.account_id,
    'user',
    v_profile.id,
    'global_broker_invite_disabled',
    'broker_invite_link',
    v_link_id,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false),
    'Link global de entrada de corretores desativado pelo dono'
  );

  return true;
end;
$$;

alter function public.studiosp_disable_global_broker_invite()
  owner to postgres;
revoke all on function public.studiosp_disable_global_broker_invite()
  from public, anon, authenticated;
grant execute on function public.studiosp_disable_global_broker_invite()
  to authenticated;

-- Cada resgate cria um convite individual efêmero e delega ao fluxo já
-- endurecido de onboarding. Assim, os mesmos guardas contra perda de dados,
-- a criação do broker_profile e a confirmação transacional do WhatsApp
-- continuam sendo a única fonte de verdade.
create or replace function public.redeem_global_broker_invite_with_whatsapp(
  p_token_hash text,
  p_whatsapp_e164 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_link public.broker_invite_links;
  v_profile public.profiles;
  v_ephemeral_token_hash text;
  v_account_id uuid;
begin
  if v_user_id is null then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  if p_whatsapp_e164 is null or length(trim(p_whatsapp_e164)) = 0 then
    raise exception 'Informe o WhatsApp do corretor com DDI.'
      using errcode = '23514';
  end if;

  select link.*
  into v_link
  from public.broker_invite_links link
  where link.token_hash = p_token_hash
  for update;

  if not found or not v_link.is_active then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Perfil não encontrado.' using errcode = '42501';
  end if;

  -- Um retry depois de uma resposta de rede perdida deve ser seguro.
  if v_profile.account_id = v_link.account_id
    and v_profile.account_role = 'agent'
    and exists (
      select 1
      from public.broker_invite_redemptions redemption
      where redemption.link_id = v_link.id
        and redemption.user_id = v_user_id
    )
  then
    return v_link.account_id;
  end if;

  v_ephemeral_token_hash :=
    encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.account_invitations (
    account_id,
    token_hash,
    role,
    created_by_user_id,
    label,
    expires_at
  ) values (
    v_link.account_id,
    v_ephemeral_token_hash,
    'agent',
    v_link.created_by_user_id,
    'Entrada via link global de corretores',
    now() + interval '10 minutes'
  );

  v_account_id :=
    public.redeem_invitation_with_broker_whatsapp(
      v_ephemeral_token_hash,
      p_whatsapp_e164
    );

  insert into public.broker_invite_redemptions (
    link_id,
    profile_id,
    user_id
  ) values (
    v_link.id,
    v_profile.id,
    v_user_id
  );

  insert into public.audit_events (
    account_id,
    actor_type,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    next_data,
    reason
  ) values (
    v_link.account_id,
    'user',
    v_profile.id,
    'global_broker_invite_redeemed',
    'broker_invite_link',
    v_link.id,
    jsonb_build_object(
      'user_id', v_user_id,
      'profile_id', v_profile.id,
      'role', 'agent'
    ),
    'Corretor ingressou por meio do link global'
  );

  return v_account_id;
end;
$$;

alter function public.redeem_global_broker_invite_with_whatsapp(text, text)
  owner to postgres;
revoke all on function
  public.redeem_global_broker_invite_with_whatsapp(text, text)
  from public, anon, authenticated;
grant execute on function
  public.redeem_global_broker_invite_with_whatsapp(text, text)
  to authenticated;

comment on table public.broker_invite_links is
  'Links globais reutilizáveis, exclusivos do dono, para entrada de corretores.';
comment on table public.broker_invite_redemptions is
  'Registro imutável de cada corretor que ingressou por um link global.';
comment on function public.peek_global_broker_invite(text) is
  'Retorna somente conta, papel e tipo para validar um link global sem autenticação.';
comment on function public.studiosp_rotate_global_broker_invite(text) is
  'Cria ou troca atomicamente o único link global ativo da conta do dono.';
comment on function public.studiosp_disable_global_broker_invite() is
  'Desativa o link global ativo da conta do dono.';
comment on function
  public.redeem_global_broker_invite_with_whatsapp(text, text) is
  'Insere um corretor por link global reutilizável com WhatsApp obrigatório.';
