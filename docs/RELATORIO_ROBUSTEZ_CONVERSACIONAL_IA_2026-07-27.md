# Relatório — robustez conversacional da IA

Data: 27/07/2026  
Branch: `feature/ai-conversation-guardrails`  
Banco alterado: Supabase Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)  
Produção: não alterada

## Incidente analisado

A conversa de Arthur Rocha recebeu duas mensagens em poucos segundos. Cada
mensagem criou corretamente um job idempotente, porém os dois jobs foram
tratados como turnos independentes e produziram respostas equivalentes. O
contato também apareceu em várias campanhas de reativação, enquanto a
oportunidade existente preservou uma origem antiga e ocultou o contexto da
reativação para o orquestrador.

## Alterações realizadas

- criada a tabela `reactivation_sessions`, com RLS, grants explícitos e índice
  único parcial que permite somente uma sessão ativa por contato;
- ativação de campanha bloqueia contato já ativo ou em período de segurança;
- a resposta do contato encerra a sessão, cancela contatos agendados ou em
  processamento em todas as campanhas e aplica cooldown de 30 dias;
- o contexto conhecido da importação fica ligado à sessão e passa a orientar a
  IA mesmo quando a oportunidade já existia;
- a fila aplica uma janela de silêncio de 8 segundos e marca jobs anteriores da
  mesma conversa como `superseded_by_newer_inbound`;
- uma resposta gerada é descartada quando uma mensagem mais nova chegou durante
  o processamento;
- um fingerprint normalizado é reivindicado atomicamente antes do envio;
- conteúdo equivalente fica bloqueado por 10 minutos;
- cada turno da IA produz uma única mensagem consolidada no WhatsApp;
- o worker de reativação só envia quando campanha, lead e sessão ativa
  correspondem.

## Migration

- `20260727220000_ai_conversation_guardrails.sql`
- aplicada somente no staging;
- produção permanece sem esta migration.

## Evidências

- teste transacional da fila: primeiro job ficou `skipped`, com motivo
  `superseded_by_newer_inbound`; apenas o segundo permaneceu `queued`;
- teste transacional do fingerprint: primeira reivindicação retornou `true` e
  a repetição retornou `false`;
- `npm test -- --run`: 93 arquivos e 765 testes aprovados;
- `npm run typecheck`: aprovado;
- `npm run lint`: aprovado;
- `npm run build`: aprovado com Next.js 16.2.11;
- advisors executados. Os avisos de segurança e desempenho encontrados são
  preexistentes e abrangem funções privilegiadas, `pg_net`, índices e políticas
  RLS duplicadas; não foi criado aviso específico para a nova tabela.

## Homologação ainda necessária

- enviar duas mensagens controladas com intervalo inferior a 8 segundos e
  confirmar uma única resposta coerente;
- tentar ativar o mesmo telefone em duas campanhas e confirmar o bloqueio;
- responder ao D0 e confirmar o cancelamento de toda a cadência;
- repetir uma resposta equivalente e confirmar o evento
  `duplicate_response_blocked`;
- validar o cooldown e a apresentação do erro em português no dashboard.

## Rollback

O código pode ser revertido pela branch. No banco, preservar as colunas e a
tabela é o rollback mais seguro; basta restaurar a versão anterior das funções
`enqueue_ai_reply_job` e desativar o uso de `reactivation_sessions`. Excluir
trilhas de auditoria não é recomendado.
