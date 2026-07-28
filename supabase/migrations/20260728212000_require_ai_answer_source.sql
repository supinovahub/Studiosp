-- Uma extração atribuída a uma execução de IA só pode persistir quando há
-- evidência rastreável na mensagem do lead e a execução pertence à mesma
-- conta/oportunidade. A validação de conteúdo continua no gatilho principal.

create or replace function studiosp_private.require_ai_answer_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.extracted_by_run_id is null then
    return new;
  end if;

  if new.source_message_id is null then
    raise exception 'Uma resposta extraída pela IA exige mensagem de origem.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.ai_runs run
    where run.id = new.extracted_by_run_id
      and run.account_id = new.account_id
      and run.opportunity_id = new.opportunity_id
  ) then
    raise exception 'Execução de IA inválida para esta resposta.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists qualification_answers_require_ai_source
  on public.qualification_answers;
create trigger qualification_answers_require_ai_source
before insert or update of
  account_id,
  opportunity_id,
  source_message_id,
  extracted_by_run_id
on public.qualification_answers
for each row execute function studiosp_private.require_ai_answer_source();
