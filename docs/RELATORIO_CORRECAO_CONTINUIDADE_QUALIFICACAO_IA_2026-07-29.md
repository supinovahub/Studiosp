# Relatório — continuidade da qualificação pela IA

Data: 29/07/2026  
Branch: `fix/ai-qualification-continuity`

## Incidente analisado

Na conversa de teste com Arthur Rocha, a IA repetiu a pergunta sobre o objetivo
da compra e parou de responder. O banco e os logs de produção confirmaram:

- timeouts recorrentes no modelo principal;
- uso do modelo de contingência;
- respostas estruturadas simplificadas, sem o envelope `answers`;
- nenhuma resposta persistida em `qualification_answers`;
- `expectedQuestionKey` preso em `purchase_objective`;
- bloqueio da resposta repetida;
- pausa permanente da conversa por `duplicate_response_blocked`.

## Correções

- respostas únicas válidas do modelo de contingência são normalizadas para o
  contrato canônico `answers[]`;
- saídas sem `question_id` ou `normalized_value` continuam rejeitadas;
- confirmações naturais como “Sim, tá correto” e “Isso mesmo” encerram a
  confirmação inicial da reativação;
- a confirmação é reconhecida no histórico do ciclo, não apenas na última
  mensagem;
- quando uma resposta duplicada não pode ser reparada pelo modelo, o sistema
  tenta a próxima pergunta determinística da qualificação;
- se nenhuma continuação segura estiver disponível, o incidente é registrado
  sem desativar a resposta automática nem pausar permanentemente a conversa.

### Hotfix de alinhamento semântico

Um novo teste real mostrou que o modelo podia interpretar corretamente um valor
como `50k`, mas associá-lo ao ID de outra pergunta. Também podia formular uma
pergunta diferente da informação registrada em `expectedQuestionKey`.

O hotfix:

- realinha um candidato ao campo efetivamente perguntado somente quando o texto
  pertence à última mensagem e o valor normalizado é válido para esse campo;
- mantém a rejeição quando o tipo é incompatível, evitando gravar prazo como
  dinheiro ou localização como objetivo;
- substitui perguntas geradas sobre outro assunto pela próxima pergunta
  determinística registrada no estado da qualificação;
- garante que a pergunta visível e a metadata usada no turno seguinte indiquem
  o mesmo campo.

## Verificações

- testes direcionados: 40 aprovados;
- suíte completa: 860 testes aprovados;
- TypeScript: aprovado;
- ESLint sem avisos: aprovado;
- `git diff --check`: aprovado.

## Pendências de homologação

- publicar a branch em Preview/Staging;
- iniciar uma conversa limpa de reativação;
- confirmar pelo banco que cada resposta gera uma linha atual em
  `qualification_answers`;
- validar manualmente pelo WhatsApp que perguntas já respondidas não se
  repetem e que um bloqueio de duplicidade não silencia o próximo turno.

Nenhuma migration ou alteração de schema foi necessária.
