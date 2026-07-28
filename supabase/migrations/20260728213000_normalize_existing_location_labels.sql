-- Reaplica a apresentação canônica às localizações já confirmadas, mantendo a
-- resposta literal em raw_text para auditoria.

update public.qualification_answers answer
set normalized_value = jsonb_set(
  answer.normalized_value,
  '{values}',
  (
    select jsonb_agg(
      to_jsonb(
        regexp_replace(
          regexp_replace(initcap(trim(item.value #>> '{}')), '\s+', ' ', 'g'),
          '\mSao\M',
          'São',
          'g'
        )
      )
    )
    from jsonb_array_elements(answer.normalized_value->'values') item(value)
  ),
  false
)
from public.qualification_questions question
where answer.question_id = question.id
  and answer.account_id = question.account_id
  and answer.is_current
  and answer.status in ('provisional', 'confirmed')
  and question.data_type = 'location'
  and jsonb_typeof(answer.normalized_value->'values') = 'array'
  and jsonb_array_length(answer.normalized_value->'values') > 0;
