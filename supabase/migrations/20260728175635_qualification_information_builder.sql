-- Construtor seguro das informações de qualificação, aplicado em staging.
-- O dono configura o objetivo e a validação; a IA decide como conversar.

create or replace function studiosp_private.qualification_question_is_visible(
  p_account_id uuid,
  p_opportunity_id uuid,
  p_condition jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_mode text := coalesce(nullif(p_condition->>'mode', ''), 'always');
  v_operator text;
  v_answer jsonb;
  v_expected text;
begin
  if p_condition is null
    or p_condition = '{}'::jsonb
    or v_mode = 'always'
  then
    return true;
  end if;

  if v_mode <> 'answer_matches' then
    return false;
  end if;

  v_operator := p_condition->>'operator';
  select qa.normalized_value
  into v_answer
  from public.qualification_questions dependency
  join public.qualification_answers qa
    on qa.question_id = dependency.id
   and qa.account_id = dependency.account_id
  where dependency.account_id = p_account_id
    and dependency.key = p_condition->>'question_key'
    and qa.opportunity_id = p_opportunity_id
    and qa.is_current
    and qa.status = 'confirmed'
  limit 1;

  if v_operator = 'answered' then
    return v_answer is not null;
  elsif v_operator = 'not_answered' then
    return v_answer is null;
  elsif v_answer is null
    or v_operator not in ('equals', 'includes_any')
  then
    return false;
  end if;

  for v_expected in
    select lower(trim(value))
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(p_condition->'values') = 'array'
          then p_condition->'values'
        else '[]'::jsonb
      end
    ) as expected(value)
  loop
    if lower(trim(coalesce(v_answer->>'value', ''))) = v_expected
      or lower(trim(coalesce(v_answer->>'text', ''))) = v_expected
      or lower(trim(coalesce(v_answer->>'min', ''))) = v_expected
      or lower(trim(coalesce(v_answer->>'max', ''))) = v_expected
      or exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(v_answer->'values') = 'array'
              then v_answer->'values'
            else '[]'::jsonb
          end
        ) as answer(value)
        where lower(trim(answer.value)) = v_expected
      )
    then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke all on function studiosp_private.qualification_question_is_visible(
  uuid,
  uuid,
  jsonb
) from public, anon;

grant execute on function studiosp_private.qualification_question_is_visible(
  uuid,
  uuid,
  jsonb
) to authenticated, service_role;

create or replace function public.studiosp_save_qualification_question(
  p_account_id uuid,
  p_question_id uuid,
  p_label text,
  p_prompt_instruction text,
  p_data_type text,
  p_normalization_strategy text,
  p_is_required boolean,
  p_is_active boolean,
  p_display_order integer,
  p_validation_schema jsonb,
  p_visibility_condition jsonb,
  p_options jsonb
)
returns public.qualification_questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.qualification_questions;
  v_question public.qualification_questions;
  v_option jsonb;
  v_option_value text;
  v_option_count integer := 0;
  v_dependency_order integer;
begin
  if not studiosp_private.is_account_admin(p_account_id) then
    raise exception 'Somente a gestão pode alterar a qualificação.'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_label, ''))) not between 3 and 120
    or length(trim(coalesce(p_prompt_instruction, ''))) not between 12 and 800
  then
    raise exception 'Nome ou objetivo fora dos limites permitidos.'
      using errcode = '22023';
  end if;

  if p_data_type not in (
    'text',
    'single_choice',
    'multi_choice',
    'money_range',
    'location',
    'date_range',
    'boolean'
  ) then
    raise exception 'Tipo de resposta inválido.' using errcode = '22023';
  end if;

  if p_display_order not between 0 and 10000
    or jsonb_typeof(coalesce(p_validation_schema, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_visibility_condition, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array'
  then
    raise exception 'Configuração da informação inválida.'
      using errcode = '22023';
  end if;

  if p_question_id is not null then
    select *
    into v_existing
    from public.qualification_questions
    where id = p_question_id
      and account_id = p_account_id
    for update;

    if not found then
      raise exception 'Informação de qualificação não encontrada.'
        using errcode = 'P0002';
    end if;
    if v_existing.is_system
      and (
        p_data_type <> v_existing.data_type
        or p_normalization_strategy <> v_existing.normalization_strategy
        or p_is_required <> v_existing.is_required
        or p_is_active <> v_existing.is_active
        or coalesce(p_visibility_condition->>'mode', 'always') <> 'always'
      )
    then
      raise exception 'Objetivos essenciais não podem perder suas garantias.'
        using errcode = '22023';
    end if;
  else
    if (
      select count(*)
      from public.qualification_questions q
      where q.account_id = p_account_id
        and not q.is_system
        and q.is_active
    ) >= 25 then
      raise exception 'O limite é de 25 informações adicionais ativas.'
        using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from public.qualification_questions q
    where q.account_id = p_account_id
      and q.id is distinct from p_question_id
      and lower(trim(q.label)) = lower(trim(p_label))
  ) then
    raise exception 'Já existe uma informação com esse nome.'
      using errcode = '23505';
  end if;

  if coalesce(p_visibility_condition->>'mode', 'always') = 'answer_matches' then
    if p_visibility_condition->>'operator' not in (
      'answered',
      'not_answered',
      'equals',
      'includes_any'
    ) then
      raise exception 'Operador da condição inválido.' using errcode = '22023';
    end if;

    select dependency.display_order
    into v_dependency_order
    from public.qualification_questions dependency
    where dependency.account_id = p_account_id
      and dependency.key = p_visibility_condition->>'question_key'
      and dependency.id is distinct from p_question_id;

    if v_dependency_order is null or v_dependency_order >= p_display_order then
      raise exception 'A condição deve usar uma informação anterior.'
        using errcode = '22023';
    end if;

    if p_visibility_condition->>'operator' in ('equals', 'includes_any')
      and (
        jsonb_typeof(p_visibility_condition->'values') <> 'array'
        or jsonb_array_length(p_visibility_condition->'values') = 0
      )
    then
      raise exception 'A condição precisa de ao menos um valor.'
        using errcode = '22023';
    end if;
  elsif coalesce(p_visibility_condition->>'mode', 'always') <> 'always' then
    raise exception 'Modo da condição inválido.' using errcode = '22023';
  end if;

  if p_data_type in ('single_choice', 'multi_choice') then
    v_option_count := jsonb_array_length(p_options);
    if v_option_count < 2 then
      raise exception 'Cadastre pelo menos duas opções de resposta.'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from (
        select option->>'value' as value, count(*) as quantity
        from jsonb_array_elements(p_options) option
        group by option->>'value'
      ) duplicates
      where duplicates.value is null
        or duplicates.value !~ '^[a-z0-9_]+$'
        or duplicates.quantity > 1
    ) then
      raise exception 'As opções têm identificadores inválidos ou repetidos.'
        using errcode = '22023';
    end if;

    if v_existing.is_system and exists (
      select 1
      from public.qualification_question_options current_option
      where current_option.question_id = v_existing.id
        and current_option.is_active
        and not exists (
          select 1
          from jsonb_array_elements(p_options) incoming
          where incoming->>'value' = current_option.value
        )
    ) then
      raise exception 'As opções essenciais podem ser renomeadas, mas não removidas.'
        using errcode = '22023';
    end if;
  elsif jsonb_array_length(p_options) > 0 then
    raise exception 'Este tipo de resposta não usa opções.'
      using errcode = '22023';
  end if;

  if p_question_id is null then
    insert into public.qualification_questions (
      account_id,
      key,
      label,
      prompt_instruction,
      data_type,
      normalization_strategy,
      is_required,
      is_system,
      is_active,
      display_order,
      validation_schema,
      visibility_condition
    )
    values (
      p_account_id,
      'custom_' || replace(gen_random_uuid()::text, '-', ''),
      trim(p_label),
      trim(p_prompt_instruction),
      p_data_type,
      p_normalization_strategy,
      p_is_required,
      false,
      p_is_active,
      p_display_order,
      coalesce(p_validation_schema, '{}'::jsonb),
      coalesce(p_visibility_condition, '{"mode":"always"}'::jsonb)
    )
    returning * into v_question;
  else
    update public.qualification_questions
    set label = trim(p_label),
        prompt_instruction = trim(p_prompt_instruction),
        data_type = p_data_type,
        normalization_strategy = p_normalization_strategy,
        is_required = p_is_required,
        is_active = p_is_active,
        display_order = p_display_order,
        validation_schema = coalesce(p_validation_schema, '{}'::jsonb),
        visibility_condition =
          coalesce(p_visibility_condition, '{"mode":"always"}'::jsonb)
    where id = p_question_id
      and account_id = p_account_id
    returning * into v_question;
  end if;

  update public.qualification_question_options
  set is_active = false
  where account_id = p_account_id
    and question_id = v_question.id;

  for v_option in
    select option
    from jsonb_array_elements(p_options) with ordinality as item(option, position)
    order by position
  loop
    v_option_value := v_option->>'value';
    insert into public.qualification_question_options (
      account_id,
      question_id,
      value,
      label,
      aliases,
      display_order,
      is_active
    )
    values (
      p_account_id,
      v_question.id,
      v_option_value,
      trim(v_option->>'label'),
      array(
        select aliases.value
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(v_option->'aliases') = 'array'
              then v_option->'aliases'
            else '[]'::jsonb
          end
        ) as aliases(value)
      ),
      (
        select ((position - 1) * 10)::integer
        from jsonb_array_elements(p_options)
          with ordinality as indexed(option, position)
        where indexed.option->>'value' = v_option_value
        limit 1
      ),
      true
    )
    on conflict (question_id, value)
    do update set
      label = excluded.label,
      aliases = excluded.aliases,
      display_order = excluded.display_order,
      is_active = true;
  end loop;

  return v_question;
end;
$$;

revoke all on function public.studiosp_save_qualification_question(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  integer,
  jsonb,
  jsonb,
  jsonb
) from public, anon;

grant execute on function public.studiosp_save_qualification_question(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  integer,
  jsonb,
  jsonb,
  jsonb
) to authenticated;

create or replace function public.studiosp_reorder_qualification_questions(
  p_account_id uuid,
  p_question_ids uuid[]
)
returns setof public.qualification_questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected_count integer;
begin
  if not studiosp_private.is_account_admin(p_account_id) then
    raise exception 'Somente a gestão pode alterar a qualificação.'
      using errcode = '42501';
  end if;

  select count(*)
  into v_expected_count
  from public.qualification_questions q
  where q.account_id = p_account_id;

  if cardinality(p_question_ids) <> v_expected_count
    or (
      select count(distinct id)
      from unnest(p_question_ids) as input_ids(id)
    ) <> v_expected_count
    or exists (
      select 1
      from unnest(p_question_ids) as input_ids(id)
      where not exists (
        select 1
        from public.qualification_questions q
        where q.account_id = p_account_id
          and q.id = id
      )
    )
  then
    raise exception 'A nova ordem não contém todas as informações.'
      using errcode = '22023';
  end if;

  update public.qualification_questions q
  set display_order = (ordered.position * 10)::integer
  from unnest(p_question_ids) with ordinality as ordered(id, position)
  where q.account_id = p_account_id
    and q.id = ordered.id;

  if exists (
    select 1
    from public.qualification_questions q
    join public.qualification_questions dependency
      on dependency.account_id = q.account_id
     and dependency.key = q.visibility_condition->>'question_key'
    where q.account_id = p_account_id
      and q.visibility_condition->>'mode' = 'answer_matches'
      and dependency.display_order >= q.display_order
  ) then
    raise exception 'Uma condição ficou antes da informação da qual depende.'
      using errcode = '22023';
  end if;

  return query
  select q.*
  from public.qualification_questions q
  where q.account_id = p_account_id
  order by q.display_order, q.id;
end;
$$;

revoke all on function public.studiosp_reorder_qualification_questions(
  uuid,
  uuid[]
) from public, anon;

grant execute on function public.studiosp_reorder_qualification_questions(
  uuid,
  uuid[]
) to authenticated;

create or replace function public.studiosp_finalize_qualification_if_ready(
  p_opportunity_id uuid
)
returns public.opportunities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity public.opportunities;
  v_is_service boolean :=
    coalesce((select auth.jwt()->>'role'), '') = 'service_role';
  v_ready boolean := false;
begin
  select *
  into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if not v_is_service
    and not studiosp_private.is_account_admin(v_opportunity.account_id)
  then
    raise exception 'Você não tem permissão para concluir esta qualificação.'
      using errcode = '42501';
  end if;

  select
    not exists (
      select 1
      from public.qualification_questions q
      where q.account_id = v_opportunity.account_id
        and q.is_active
        and q.is_required
        and q.key <> 'schedule_preference'
        and studiosp_private.qualification_question_is_visible(
          v_opportunity.account_id,
          v_opportunity.id,
          q.visibility_condition
        )
        and not exists (
          select 1
          from public.qualification_answers qa
          where qa.opportunity_id = v_opportunity.id
            and qa.question_id = q.id
            and qa.is_current
            and qa.status = 'confirmed'
        )
    )
    and exists (
      select 1
      from public.qualification_answers qa
      join public.qualification_questions q
        on q.id = qa.question_id
       and q.account_id = qa.account_id
      where qa.opportunity_id = v_opportunity.id
        and qa.is_current
        and qa.status = 'confirmed'
        and q.is_active
        and q.key in ('entry_budget', 'monthly_installment_budget')
    )
  into v_ready;

  if v_ready then
    update public.opportunities
    set qualification_status = 'completed',
        stage = case
          when stage in ('received', 'contacting', 'qualifying')
            then 'qualified'
          else stage
        end,
        stage_changed_at = case
          when stage in ('received', 'contacting', 'qualifying')
            then now()
          else stage_changed_at
        end,
        attention_state = case
          when stage in ('received', 'contacting', 'qualifying')
            then 'no_action'
          else attention_state
        end
    where id = v_opportunity.id
    returning * into v_opportunity;

    insert into public.opportunity_events (
      account_id,
      opportunity_id,
      contact_id,
      conversation_id,
      event_type,
      to_stage,
      actor_type,
      source_type,
      idempotency_key,
      payload
    )
    values (
      v_opportunity.account_id,
      v_opportunity.id,
      v_opportunity.contact_id,
      v_opportunity.primary_conversation_id,
      'qualification_completed',
      'qualified',
      case when v_is_service then 'ai' else 'user' end,
      case when v_is_service then 'api' else 'dashboard' end,
      'qualification-completed:' || v_opportunity.id::text,
      jsonb_build_object(
        'requirement',
        'visible_required_fields_and_entry_or_installment'
      )
    )
    on conflict do nothing;
  end if;

  return v_opportunity;
end;
$$;

revoke all on function public.studiosp_finalize_qualification_if_ready(uuid)
from public, anon, authenticated;

grant execute on function public.studiosp_finalize_qualification_if_ready(uuid)
to service_role;
