# Correção do roteamento entre lead e corretor

## Problema

O número do Arthur estava cadastrado simultaneamente como contato e corretor.
O webhook tratava toda mensagem desse número como resposta operacional de
corretor, mesmo sem uma oferta de reunião pendente. Com isso, as mensagens não
chegavam ao Inbox nem à IA e cada uma recebia a resposta incorreta de que não
existia convite pendente.

## Alteração

- o handler de corretor agora retorna controle ao webhook quando não existe
  oferta pendente e válida;
- a conversa operacional do corretor só é criada ou atualizada depois que uma
  oferta é encontrada;
- o comportamento vale para UAZAPI e Meta, pois ambos usam o mesmo handler;
- com oferta válida, aceite, rejeição e transferência continuam no fluxo
  operacional existente.

## Validação

- número cadastrado como corretor sem oferta: mensagem não é consumida e
  nenhuma resposta operacional é enviada;
- corretor com oferta pendente: mensagem continua sendo consumida pelo fluxo
  operacional;
- testes direcionados, typecheck, lint, suíte completa e build executados antes
  da publicação.

## Observação

As mensagens interceptadas anteriormente não são recriadas automaticamente.
Uma nova mensagem do lead após o deploy deverá entrar normalmente no Inbox e
acionar a IA.
