# Relatório — bloqueio do Inbox após a call

Data: 27/07/2026  
Branch: `fix/inbox-block-staging`

## Regra confirmada

- Registrar um fato humano pode movimentar o pipeline, mas não bloqueia o
  Inbox.
- O bloqueio acontece exclusivamente quando o corretor usa **Call finalizada**
  e registra o status resultante do lead.

## Diagnóstico

- A função `studiosp_complete_broker_call` já encerrava a conversa no banco
  (`conversations.status = 'closed'`).
- O Inbox ignorava esse estado e continuava exibindo o compositor habilitado.
- O endpoint de envio manual também não rejeitava conversas encerradas.
- No caso verificado de Arthur Rocha, foi registrado o fato
  `proposal_sent`, portanto o pipeline avançou, mas a ação **Call finalizada**
  não foi executada e a conversa permaneceu aberta, conforme a regra
  confirmada.

## Correção

- O compositor é desabilitado quando a conversa está encerrada.
- O Inbox exibe uma mensagem clara informando que o atendimento foi encerrado
  após a call.
- Texto, mídia, áudio, interativos, respostas rápidas, modelos e rascunho por
  IA ficam indisponíveis para o corretor.
- A API de envio faz a mesma validação no servidor e responde `409` com o
  código `conversation_closed`.

## Homologação necessária

1. Abrir um lead com reunião confirmada e horário já iniciado.
2. Clicar em **Call finalizada**.
3. Escolher o status do lead e confirmar.
4. Confirmar a movimentação do pipeline.
5. Abrir a conversa e confirmar o compositor bloqueado.
6. Confirmar que uma chamada direta à API também recebe HTTP `409`.

Nenhuma alteração de banco foi necessária.
