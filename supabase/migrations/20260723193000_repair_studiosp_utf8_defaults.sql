-- Repara somente textos padrão da V1, identificados por chaves estáveis.
-- Conteúdo livre de usuários e empreendimentos não é alterado automaticamente.

update public.ai_config_versions
set
  communication_prompt =
    'Converse de forma humana, clara e breve. Entenda o perfil da pessoa sem transformar a conversa em interrogatório. Responda dúvidas cobertas pela base e retome a qualificação naturalmente. Depois de concluir os dados necessários, explique que existem oportunidades compatíveis e ofereça uma conversa rápida de 5 a 10 minutos com um corretor.',
  completion_message =
    'Encontrei oportunidades que combinam com o que você procura. Posso reservar uma conversa rápida de 5 a 10 minutos com um corretor para explicar os detalhes?'
where status = 'active'
  and (
    communication_prompt like '%Ã%'
    or completion_message like '%Ã%'
  );

update public.followup_policies
set name = 'Cadência padrão'
where status = 'active'
  and name like '%Ã%';

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
  and r.label like '%Ã%';

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
    q.label like '%Ã%'
    or q.prompt_instruction like '%Ã%'
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
  and o.label like '%Ã%';
