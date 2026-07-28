-- Uma condição órfã nunca deve se tornar aplicável em nenhum ambiente.

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
  v_dependency_id uuid;
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

  select dependency.id
  into v_dependency_id
  from public.qualification_questions dependency
  where dependency.account_id = p_account_id
    and dependency.key = p_condition->>'question_key'
  limit 1;

  if v_dependency_id is null then
    return false;
  end if;

  v_operator := p_condition->>'operator';
  select qa.normalized_value
  into v_answer
  from public.qualification_answers qa
  where qa.account_id = p_account_id
    and qa.question_id = v_dependency_id
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
