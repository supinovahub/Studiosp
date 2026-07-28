-- Reaplica os textos padrão com literais UTF-8 e corrige os poucos valores
-- herdados que ficaram gravados como mojibake em produção.
-- A migration é idempotente e evita alterar conteúdo livre sem assinatura
-- inequívoca de dupla codificação.

update public.ai_config_versions
set
  communication_prompt =
    'Converse de forma humana, clara e breve. Entenda o perfil da pessoa sem transformar a conversa em interrogatório. Responda dúvidas cobertas pela base e retome a qualificação naturalmente. Depois de concluir os dados necessários, explique que existem oportunidades compatíveis e ofereça uma conversa rápida de 5 a 10 minutos com um corretor.',
  completion_message =
    'Encontrei oportunidades que combinam com o que você procura. Posso reservar uma conversa rápida de 5 a 10 minutos com um corretor para explicar os detalhes?'
where status = 'active'
  and (
    communication_prompt ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)'
    or completion_message ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)'
  );

update public.followup_policies
set name = 'Cadência padrão'
where status = 'active'
  and name ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)';

update public.reason_definitions r
set label = seed.label
from (
  values
    ('loss', 'no_response', 'Não respondeu'),
    ('loss', 'budget_mismatch', 'Condição financeira incompatível'),
    ('loss', 'location_mismatch', 'Localização incompatível'),
    ('loss', 'timing_mismatch', 'Momento de compra incompatível'),
    ('loss', 'bought_elsewhere', 'Comprou com outra empresa'),
    ('broker_rejection', 'temporary_unavailability', 'Indisponibilidade temporária'),
    ('owner_override', 'data_correction', 'Correção de informação'),
    ('owner_override', 'operational_exception', 'Exceção operacional')
) as seed(category, code, label)
where r.category = seed.category
  and r.code = seed.code
  and r.label ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)';

update public.qualification_questions q
set
  label = seed.label,
  prompt_instruction = seed.instruction
from (
  values
    ('purchase_objective', 'Objetivo da compra', 'Entenda se a pessoa procura o imóvel para morar, investir ou combinar os dois objetivos.'),
    ('preferred_locations', 'Bairros ou regiões de interesse', 'Descubra ao menos um bairro ou uma região e confirme ambiguidades naturalmente.'),
    ('entry_budget', 'Faixa de entrada disponível', 'Pergunte qual faixa de entrada a pessoa consegue usar, sem pressionar por um número exato.'),
    ('monthly_installment_budget', 'Faixa de parcela mensal', 'Entenda qual faixa de parcela mensal fica confortável para a pessoa.'),
    ('total_price_budget', 'Faixa de preço total', 'Colete a faixa de preço total somente quando fizer sentido na conversa.'),
    ('property_timing', 'Na planta ou pronto', 'Entenda se a pessoa prefere imóvel na planta, pronto ou se é indiferente.'),
    ('purchase_urgency', 'Prazo para comprar', 'Entenda a urgência real da compra de forma conversacional.'),
    ('schedule_preference', 'Preferência de horário', 'Quando a qualificação terminar, descubra o melhor dia e período para uma conversa rápida com o corretor.')
) as seed(key, label, instruction)
where q.key = seed.key
  and (
    q.label ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)'
    or q.prompt_instruction ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)'
  );

update public.qualification_question_options o
set label = seed.label
from public.qualification_questions q
join (
  values
    ('purchase_objective', 'unknown', 'Ainda não definiu'),
    ('purchase_urgency', 'up_to_30_days', 'Até 30 dias')
) as seed(question_key, value, label)
  on seed.question_key = q.key
where o.question_id = q.id
  and o.value = seed.value
  and o.label ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)';

update public.developers
set
  name = case
    when name = 'Incorporadora nÃ£o informada'
      then 'Incorporadora não informada'
    else name
  end,
  description = case
    when description = 'Registro temporÃ¡rio criado na migraÃ§Ã£o do catÃ¡logo anterior.'
      then 'Registro temporário criado na migração do catálogo anterior.'
    else description
  end
where name = 'Incorporadora nÃ£o informada'
   or description =
      'Registro temporÃ¡rio criado na migraÃ§Ã£o do catÃ¡logo anterior.';

update public.developments
set internal_notes = 'Importado do catálogo anterior.'
where internal_notes = 'Importado do catÃ¡logo anterior.';

update public.development_offers
set label = replace(replace(label, 'Â·', '·'), 'mÂ²', 'm²')
where label like '%Â·%'
   or label like '%mÂ²%';

-- Os eventos continuam semanticamente imutáveis. O trigger é suspenso apenas
-- dentro desta migration para reparar a representação dos mesmos motivos.
lock table public.audit_events in access exclusive mode;
alter table public.audit_events disable trigger audit_events_immutable;

update public.audit_events
set reason = convert_from(convert_to(reason, 'LATIN1'), 'UTF8')
where reason ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)';

alter table public.audit_events enable trigger audit_events_immutable;
