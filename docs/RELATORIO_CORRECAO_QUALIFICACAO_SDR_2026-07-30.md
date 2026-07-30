# Relatório — correção estrutural da qualificação SDR

Data: 30/07/2026

## Sintoma reproduzido

Na conversa de Arthur Rocha, a resposta “Prefiro imóveis já terminados” foi compreendida pelo modelo como imóvel pronto, mas o campo `property_timing` não foi persistido. Depois da resposta seguinte (“Até 2 anos”), o fluxo perguntou novamente se o lead preferia imóvel na planta ou pronto.

## Causa raiz

O problema não estava no entendimento do modelo. O extrator retornou corretamente o valor canônico `ready`, mas uma validação semântica posterior, implementada com uma lista rígida de palavras, não reconhecia “terminados”. O candidato era descartado silenciosamente antes da gravação no banco. Em seguida, o orquestrador avançava para a próxima pergunta mesmo sem ter confirmado a persistência da resposta anterior.

Também foram encontrados dois efeitos relacionados:

- “Conheço nada aí de São Paulo” podia ser persistido como nome de região, em vez de ausência de preferência;
- a expressão coloquial “Pô, pode ser 5 mil” podia ser interpretada como frustração.

## Correção aplicada

- Criado normalizador único para estado do imóvel, cobrindo formas naturais como pronto, terminado, finalizado, concluído, entregue, já construído, na planta, lançamento, em obras e indiferente.
- Valores normalizados agora usam os códigos canônicos esperados pelo banco: `ready`, `off_plan` e `indifferent`.
- A associação de evidência passou a priorizar a mensagem exata que contém a resposta e, havendo ambiguidade, a compatibilidade semântica.
- Respostas de escolha única interpretadas pelo modelo só podem passar pela tolerância semântica quando correspondem exatamente à pergunta que o servidor acabou de fazer. Evidência textual, confiança e valor permitido continuam obrigatórios.
- O fluxo não pode avançar para outra pergunta se o campo recém-perguntado continuar ausente após a tentativa de persistência.
- Todo candidato descartado agora registra um motivo estruturado no `ai_run`, permitindo diferenciar falta de evidência, valor inválido, incompatibilidade semântica, baixa confiança e rejeição do banco.
- Frases naturais de desconhecimento de região são tratadas como resposta desconhecida, e “pô” deixou de ser sinal isolado de frustração.

## Validação

- 56 testes direcionados de qualificação e comportamento: aprovados.
- 909 testes da suíte completa: aprovados.
- TypeScript (`tsc --noEmit`): aprovado.
- Build de produção (`next build`): aprovado.
- Cenários cobertos por regressão:
  - “Prefiro imóveis já terminados” → `ready`;
  - “apartamento finalizado” → `ready`;
  - “imóvel já entregue” → `ready`;
  - “na planta” e “em obras” → `off_plan`;
  - “qualquer um dos dois” → `indifferent`;
  - o fluxo não avança quando a resposta esperada não foi persistida;
  - correções rápidas e mensagens agrupadas permanecem ligadas à evidência correta.

## Resultado esperado

Ao receber “Prefiro imóveis já terminados”, o sistema deve persistir imediatamente “Pronto” e seguir para a pergunta de prazo. Mesmo que uma nova variante linguística não seja reconhecida, o sistema não repetirá outra etapa nem fingirá que a resposta foi salva: manterá a pergunta atual e registrará o motivo técnico do descarte para auditoria.
