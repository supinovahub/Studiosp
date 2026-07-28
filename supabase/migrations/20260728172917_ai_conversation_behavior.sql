-- Mantém a conclusão da qualificação alinhada ao contrato da V1:
-- campos obrigatórios + entrada OU parcela. Preço total é desejável.

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
        'required_fields_and_entry_or_installment'
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

-- Novas preferências começam seguras e podem ser alteradas pelo dono.
alter table public.ai_config_versions
alter column identity_name set default 'Sofia';

update public.ai_config_versions
set identity_name = 'Sofia'
where identity_name = 'Assistente Studiosp';

update public.ai_config_versions
set tone_config =
  jsonb_build_object(
    'adapt_to_lead', true,
    'allow_contextual_laughter', true
  ) || tone_config
where not (
  tone_config ? 'adapt_to_lead'
  and tone_config ? 'allow_contextual_laughter'
);

-- Corrige respostas antigas geradas pelo problema que reaproveitava o
-- histórico inteiro. A validação é conservadora: respostas financeiras sem
-- evidência do campo na mensagem atual ou na pergunta anterior deixam de ser
-- atuais e serão coletadas novamente.
create temporary table studiosp_invalid_ai_answers as
with evidence as (
  select
    qa.id,
    qa.opportunity_id,
    qa.question_id,
    q.key,
    coalesce(m.content_text, qa.raw_text, '') as lead_text,
    coalesce(previous.content_text, '') as previous_assistant_text,
    regexp_replace(
      translate(
        lower(coalesce(m.content_text, '')),
        'áàâãéêíóôõúüç',
        'aaaaeeiooouuc'
      ),
      '[^[:alnum:]]',
      '',
      'g'
    ) as normalized_lead_text,
    regexp_replace(
      translate(
        lower(coalesce(qa.raw_text, '')),
        'áàâãéêíóôõúüç',
        'aaaaeeiooouuc'
      ),
      '[^[:alnum:]]',
      '',
      'g'
    ) as normalized_raw_text,
    count(*) filter (
      where q.key in (
        'entry_budget',
        'monthly_installment_budget',
        'total_price_budget'
      )
    ) over (partition by qa.source_message_id) as financial_answer_count
  from public.qualification_answers qa
  join public.qualification_questions q
    on q.id = qa.question_id
   and q.account_id = qa.account_id
  left join public.messages m
    on m.id = qa.source_message_id
  left join lateral (
    select prior.content_text
    from public.messages prior
    where prior.conversation_id = m.conversation_id
      and prior.sender_type in ('agent', 'bot')
      and (prior.created_at, prior.id) < (m.created_at, m.id)
    order by prior.created_at desc, prior.id desc
    limit 1
  ) previous on true
  where qa.is_current
    and qa.status in ('provisional', 'confirmed')
    and qa.extracted_by_run_id is not null
    and qa.source_message_id is not null
)
select id, opportunity_id, question_id, key
from evidence
where
    (
      normalized_raw_text <> ''
      and strpos(normalized_lead_text, normalized_raw_text) = 0
    )
    or (
      key in (
        'entry_budget',
        'monthly_installment_budget',
        'total_price_budget'
      )
      and (
    trim(lead_text) ~* '^(não|nao|n|não sei|nao sei|ainda não|ainda nao|não tenho|nao tenho)$'
    or (
      financial_answer_count > 1
      and (
        (
          key = 'entry_budget'
          and (lead_text || ' ' || previous_assistant_text)
            !~* '(entrada|sinal|valor[[:space:]]+inicial)'
        )
        or (
          key = 'monthly_installment_budget'
          and (lead_text || ' ' || previous_assistant_text)
            !~* '(parcela|mensal|por[[:space:]]+m[eê]s)'
        )
        or (
          key = 'total_price_budget'
          and (lead_text || ' ' || previous_assistant_text)
            !~* '(pre[cç]o[[:space:]]+total|valor[[:space:]]+total|or[cç]amento|(quanto|valor).{0,30}investir)'
        )
      )
    )
      )
    );

update public.qualification_answers qa
set is_current = false,
    status = 'rejected'
from studiosp_invalid_ai_answers invalid
where qa.id = invalid.id;

update public.opportunities o
set qualification_status = 'in_progress'
where o.id in (
  select distinct opportunity_id
  from studiosp_invalid_ai_answers
)
  and o.stage in ('received', 'contacting', 'qualifying', 'qualified');

-- Se uma versão anterior do mesmo campo possui evidência literal válida,
-- restaura a mais recente. Isso evita perguntar de novo algo que o lead já
-- respondeu corretamente antes da sobrescrita defeituosa.
with supported_history as (
  select
    qa.id,
    row_number() over (
      partition by qa.opportunity_id, qa.question_id
      order by qa.version desc
    ) as preference_order
  from public.qualification_answers qa
  join studiosp_invalid_ai_answers invalid
    on invalid.opportunity_id = qa.opportunity_id
   and invalid.question_id = qa.question_id
  join public.qualification_questions q
    on q.id = qa.question_id
   and q.account_id = qa.account_id
  join public.messages m
    on m.id = qa.source_message_id
  where not qa.is_current
    and qa.status = 'superseded'
    and q.is_active
    and nullif(
      regexp_replace(
        translate(
          lower(coalesce(qa.raw_text, '')),
          'áàâãéêíóôõúüç',
          'aaaaeeiooouuc'
        ),
        '[^[:alnum:]]',
        '',
        'g'
      ),
      ''
    ) is not null
    and strpos(
      regexp_replace(
        translate(
          lower(coalesce(m.content_text, '')),
          'áàâãéêíóôõúüç',
          'aaaaeeiooouuc'
        ),
        '[^[:alnum:]]',
        '',
        'g'
      ),
      regexp_replace(
        translate(
          lower(coalesce(qa.raw_text, '')),
          'áàâãéêíóôõúüç',
          'aaaaeeiooouuc'
        ),
        '[^[:alnum:]]',
        '',
        'g'
      )
    ) > 0
    and not (
      q.key in (
        'entry_budget',
        'monthly_installment_budget',
        'total_price_budget'
      )
      and trim(coalesce(m.content_text, qa.raw_text, '')) ~*
        '^(não|nao|n|não sei|nao sei|ainda não|ainda nao|não tenho|nao tenho)$'
    )
    and not exists (
      select 1
      from public.qualification_answers current_answer
      where current_answer.opportunity_id = qa.opportunity_id
        and current_answer.question_id = qa.question_id
        and current_answer.is_current
    )
)
update public.qualification_answers qa
set is_current = true,
    status = case
      when qa.confidence >= 0.8 then 'confirmed'
      else 'provisional'
    end,
    confirmed_at = case
      when qa.confidence >= 0.8
        then coalesce(qa.confirmed_at, qa.created_at)
      else qa.confirmed_at
    end
from supported_history supported
where qa.id = supported.id
  and supported.preference_order = 1;

insert into public.qualification_answers (
  account_id,
  opportunity_id,
  question_id,
  version,
  status,
  raw_text,
  normalized_value,
  confidence,
  source_message_id,
  extracted_by_run_id,
  confirmed_by,
  confirmed_at,
  idempotency_key,
  is_current
)
select
  qa.account_id,
  qa.opportunity_id,
  qa.question_id,
  qa.version + 1,
  'confirmed',
  qa.raw_text,
  '{"values":[],"unknown":true}'::jsonb,
  greatest(qa.confidence, 0.8),
  null,
  null,
  null,
  now(),
  'repair-location-unknown:' || qa.id::text,
  true
from public.qualification_answers qa
join studiosp_invalid_ai_answers invalid
  on invalid.id = qa.id
where invalid.key = 'preferred_locations'
  and not exists (
    select 1
    from public.qualification_answers current_answer
    where current_answer.opportunity_id = qa.opportunity_id
      and current_answer.question_id = qa.question_id
      and current_answer.is_current
  )
  and (
    coalesce(qa.raw_text, '') ~*
      '(não sei|nao sei|sei não|sei nao|sem preferência|sem preferencia|tanto faz)'
    or exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(qa.normalized_value->'values', '[]'::jsonb)
      ) item(value)
      where item.value ~*
        '^(sem definição|sem definicao|não sei|nao sei|indefinido)$'
    )
  )
on conflict do nothing;

drop table studiosp_invalid_ai_answers;

-- "Não sei a região" é uma resposta válida e ampla, não o texto fictício
-- "sem definição". Criamos uma nova versão para preservar o histórico.
with candidates as (
  select qa.*
  from public.qualification_answers qa
  join public.qualification_questions q
    on q.id = qa.question_id
   and q.account_id = qa.account_id
  where qa.is_current
    and qa.status in ('provisional', 'confirmed')
    and q.key = 'preferred_locations'
    and (
      coalesce(qa.raw_text, '') ~*
        '^[[:space:]]*(não sei|nao sei|sei não|sei nao|ainda não sei|ainda nao sei|sem preferência|sem preferencia|tanto faz)([[:space:]]+(ainda|p[oô]))?[[:space:]]*$'
      or exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(qa.normalized_value->'values', '[]'::jsonb)
        ) item(value)
        where item.value ~*
          '^(sem definição|sem definicao|não sei|nao sei|indefinido)$'
      )
    )
    and qa.normalized_value <> '{"values":[],"unknown":true}'::jsonb
),
superseded as (
  update public.qualification_answers qa
  set is_current = false,
      status = 'superseded'
  from candidates
  where qa.id = candidates.id
  returning candidates.*
)
insert into public.qualification_answers (
  account_id,
  opportunity_id,
  question_id,
  version,
  status,
  raw_text,
  normalized_value,
  confidence,
  source_message_id,
  extracted_by_run_id,
  confirmed_by,
  confirmed_at,
  idempotency_key,
  is_current
)
select
  account_id,
  opportunity_id,
  question_id,
  version + 1,
  status,
  raw_text,
  '{"values":[],"unknown":true}'::jsonb,
  confidence,
  source_message_id,
  extracted_by_run_id,
  confirmed_by,
  confirmed_at,
  'repair-location-unknown:' || id::text,
  true
from superseded
on conflict do nothing;
