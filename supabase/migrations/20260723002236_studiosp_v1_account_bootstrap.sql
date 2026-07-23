-- Garante que toda operação criada depois da fundação da V1 receba a mesma
-- configuração inicial que as contas já existentes receberam no backfill.

create or replace function studiosp_private.seed_account_defaults(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, studiosp_private
as $$
begin
  insert into public.reason_definitions (
    account_id, category, code, label, requires_notes, display_order
  )
  select p_account_id, seed.category, seed.code, seed.label,
    seed.requires_notes, seed.display_order
  from (values
    ('loss', 'no_response', 'Não respondeu', false, 10),
    ('loss', 'budget_mismatch', 'Condição financeira incompatível', true, 20),
    ('loss', 'location_mismatch', 'Localização incompatível', true, 30),
    ('loss', 'timing_mismatch', 'Momento de compra incompatível', true, 40),
    ('loss', 'bought_elsewhere', 'Comprou com outra empresa', true, 50),
    ('loss', 'other', 'Outro motivo', true, 100),
    ('broker_rejection', 'schedule_conflict', 'Conflito de agenda', true, 10),
    ('broker_rejection', 'temporary_unavailability', 'Indisponibilidade temporária', true, 20),
    ('broker_rejection', 'outside_profile', 'Atendimento fora do perfil', true, 30),
    ('broker_rejection', 'other', 'Outro motivo', true, 100),
    ('transfer', 'schedule_conflict', 'Conflito de agenda', true, 10),
    ('transfer', 'workload', 'Carga de atendimentos', true, 20),
    ('transfer', 'requested_support', 'Solicitou apoio de outro corretor', true, 30),
    ('transfer', 'other', 'Outro motivo', true, 100),
    ('appointment_cancellation', 'broker_unavailable', 'Corretor indisponível', true, 10),
    ('appointment_cancellation', 'lead_requested', 'Solicitado pelo lead', true, 20),
    ('appointment_cancellation', 'other', 'Outro motivo', true, 100),
    ('owner_override', 'data_correction', 'Correção de informação', true, 10),
    ('owner_override', 'operational_exception', 'Exceção operacional', true, 20)
  ) as seed(category, code, label, requires_notes, display_order)
  on conflict (account_id, category, code) do nothing;

  insert into public.qualification_questions (
    account_id, key, label, prompt_instruction, data_type,
    normalization_strategy, is_required, is_system, display_order,
    validation_schema
  )
  select p_account_id, seed.key, seed.label, seed.instruction,
    seed.data_type, seed.strategy, seed.is_required, true,
    seed.display_order, seed.validation_schema
  from (values
    ('purchase_objective', 'Objetivo da compra', 'Entenda se a pessoa procura o imóvel para morar, investir ou combinar os dois objetivos.', 'single_choice', 'purchase_objective_v1', true, 10, '{"allowed":["live","invest","both","unknown"]}'::jsonb),
    ('preferred_locations', 'Bairros ou regiões de interesse', 'Descubra ao menos um bairro ou uma região e confirme ambiguidades naturalmente.', 'location', 'neighborhood_alias_v1', true, 20, '{}'::jsonb),
    ('entry_budget', 'Faixa de entrada disponível', 'Pergunte qual faixa de entrada a pessoa consegue usar, sem pressionar por um número exato.', 'money_range', 'brl_money_range_v1', false, 30, '{"currency":"BRL","minimum":0}'::jsonb),
    ('monthly_installment_budget', 'Faixa de parcela mensal', 'Entenda qual faixa de parcela mensal fica confortável para a pessoa.', 'money_range', 'brl_money_range_v1', false, 40, '{"currency":"BRL","minimum":0}'::jsonb),
    ('total_price_budget', 'Faixa de preço total', 'Colete a faixa de preço total somente quando fizer sentido na conversa.', 'money_range', 'brl_money_range_v1', false, 50, '{"currency":"BRL","minimum":0}'::jsonb),
    ('property_timing', 'Na planta ou pronto', 'Entenda se a pessoa prefere imóvel na planta, pronto ou se é indiferente.', 'single_choice', 'property_timing_v1', true, 60, '{"allowed":["off_plan","ready","indifferent"]}'::jsonb),
    ('purchase_urgency', 'Prazo para comprar', 'Entenda a urgência real da compra de forma conversacional.', 'single_choice', 'purchase_urgency_v1', true, 70, '{"allowed":["up_to_30_days","one_to_three_months","three_to_six_months","six_to_twelve_months","over_twelve_months","researching"]}'::jsonb),
    ('schedule_preference', 'Preferência de horário', 'Quando a qualificação terminar, descubra o melhor dia e período para uma conversa rápida com o corretor.', 'date_range', 'schedule_preference_v1', false, 80, '{}'::jsonb)
  ) as seed(key, label, instruction, data_type, strategy, is_required, display_order, validation_schema)
  on conflict (account_id, key) do nothing;

  insert into public.qualification_question_options (
    account_id, question_id, value, label, aliases, display_order
  )
  select q.account_id, q.id, seed.value, seed.label, seed.aliases,
    seed.display_order
  from public.qualification_questions q
  join (values
    ('purchase_objective', 'live', 'Morar', array['morar','moradia','pra mim']::text[], 10),
    ('purchase_objective', 'invest', 'Investir', array['investir','investimento','renda']::text[], 20),
    ('purchase_objective', 'both', 'Morar e investir', array['os dois','ambos']::text[], 30),
    ('purchase_objective', 'unknown', 'Ainda não definiu', array['não sei','pesquisando']::text[], 40),
    ('property_timing', 'off_plan', 'Na planta', array['lançamento','em construção']::text[], 10),
    ('property_timing', 'ready', 'Pronto', array['pronto para morar','entregue']::text[], 20),
    ('property_timing', 'indifferent', 'Indiferente', array['tanto faz','qualquer um']::text[], 30),
    ('purchase_urgency', 'up_to_30_days', 'Até 30 dias', array['agora','urgente','este mês']::text[], 10),
    ('purchase_urgency', 'one_to_three_months', 'De 1 a 3 meses', array['próximos meses']::text[], 20),
    ('purchase_urgency', 'three_to_six_months', 'De 3 a 6 meses', array['até seis meses']::text[], 30),
    ('purchase_urgency', 'six_to_twelve_months', 'De 6 a 12 meses', array['este ano']::text[], 40),
    ('purchase_urgency', 'over_twelve_months', 'Mais de 12 meses', array['ano que vem','sem pressa']::text[], 50),
    ('purchase_urgency', 'researching', 'Somente pesquisando', array['só olhando','pesquisa']::text[], 60)
  ) as seed(question_key, value, label, aliases, display_order)
    on seed.question_key = q.key
  where q.account_id = p_account_id
  on conflict (question_id, value) do nothing;

  insert into public.ai_config_versions (
    account_id, version, status, communication_prompt, identity_name,
    tone_config, handoff_rules, completion_message, tool_policy,
    qualification_snapshot, published_at
  )
  select
    p_account_id, 1, 'active',
    'Converse de forma humana, clara e breve. Entenda o perfil da pessoa sem transformar a conversa em interrogatório. Responda dúvidas cobertas pela base e retome a qualificação naturalmente. Depois de concluir os dados necessários, explique que existem oportunidades compatíveis e ofereça uma conversa rápida de 5 a 10 minutos com um corretor.',
    'Assistente Studiosp',
    '{"language":"pt-BR","style":"consultivo","message_length":"short"}'::jsonb,
    '{"on_request":true,"on_low_confidence":true,"on_integration_error":true}'::jsonb,
    'Encontrei oportunidades que combinam com o que você procura. Posso reservar uma conversa rápida de 5 a 10 minutos com um corretor para explicar os detalhes?',
    '{"allowed":["load_lead_context","record_qualification_answer","confirm_qualification_answer","list_property_matches","list_available_slots","reserve_guaranteed_slot","send_lead_message","create_attention_item","handoff_to_human"]}'::jsonb,
    '[]'::jsonb,
    now()
  where not exists (
    select 1 from public.ai_config_versions c
    where c.account_id = p_account_id and c.status = 'active'
  );

  insert into public.followup_policies (
    account_id, version, name, status, published_at
  )
  select p_account_id, 1, 'Cadência padrão', 'active', now()
  where not exists (
    select 1 from public.followup_policies p
    where p.account_id = p_account_id and p.status = 'active'
  );

  insert into public.scheduling_policies (
    account_id, version, status, published_at
  )
  select p_account_id, 1, 'active', now()
  where not exists (
    select 1 from public.scheduling_policies p
    where p.account_id = p_account_id and p.status = 'active'
  );
end;
$$;

revoke all on function studiosp_private.seed_account_defaults(uuid)
  from public, anon, authenticated;

create or replace function studiosp_private.on_account_created()
returns trigger
language plpgsql
security definer
set search_path = public, studiosp_private
as $$
begin
  perform studiosp_private.seed_account_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists studiosp_seed_account_defaults on public.accounts;
create trigger studiosp_seed_account_defaults
after insert on public.accounts
for each row execute function studiosp_private.on_account_created();

create or replace function studiosp_private.sync_broker_profile()
returns trigger
language plpgsql
security definer
set search_path = public, studiosp_private
as $$
begin
  if tg_op = 'UPDATE' and (
    old.account_role = 'agent'
    and (new.account_role <> 'agent' or new.account_id <> old.account_id)
  ) then
    update public.broker_profiles
    set is_active = false, is_available = false
    where profile_id = old.id and account_id = old.account_id;
  end if;

  if new.account_role = 'agent' then
    insert into public.broker_profiles (
      account_id, profile_id, display_name, is_available, is_active
    ) values (
      new.account_id,
      new.id,
      coalesce(nullif(trim(new.full_name), ''), nullif(trim(new.email), ''), 'Corretor'),
      true,
      true
    )
    on conflict (account_id, profile_id) do update
      set display_name = excluded.display_name,
          is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists studiosp_sync_broker_profile on public.profiles;
create trigger studiosp_sync_broker_profile
after insert or update of account_role, account_id, full_name, email
on public.profiles
for each row execute function studiosp_private.sync_broker_profile();

-- Backfill idempotente para bases que receberam a migration após o cadastro.
do $$
declare
  account_row record;
begin
  for account_row in select id from public.accounts loop
    perform studiosp_private.seed_account_defaults(account_row.id);
  end loop;
end;
$$;

insert into public.broker_profiles (
  account_id, profile_id, display_name, is_available, is_active
)
select p.account_id, p.id,
  coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Corretor'),
  true, true
from public.profiles p
where p.account_role = 'agent'
on conflict (account_id, profile_id) do update
  set display_name = excluded.display_name,
      is_active = true;
