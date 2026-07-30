# Relatório — correção de falso positivo na segurança da IA

Data: 30 de julho de 2026

## Incidente confirmado

Na conversa controlada de Arthur Rocha, a confirmação `podemos sim` foi
registrada como assunto não reconhecido. Em seguida, a resposta comercial
`seria até 700 mil` foi registrada como segundo assunto externo e bloqueou a
conversa.

Nos dois eventos, o classificador semântico estava indisponível e retornou
`semantic: null`. A proteção determinística tratava linguagem comercial
ambígua como evidência de risco, gerando o falso positivo.

## Correção

- confirmações comerciais curtas como `podemos sim`, `vamos sim` e
  `faz sentido` são reconhecidas deterministicamente;
- valores monetários isolados, inclusive `700 mil`, `50k` e `R$ 400.000`, são
  aceitos como respostas de qualificação;
- uma classificação semântica equivocada não pode rejeitar uma resposta
  monetária determinística sem detectar um pedido externo;
- quando o classificador semântico está indisponível e não existe sinal
  explícito de ataque ou assunto externo, o fluxo comercial continua;
- strikes produzidos pela política anterior não são reutilizados pela nova
  versão do detector;
- prompt injection, pedidos mistos e assuntos externos explícitos continuam
  bloqueados.

## Verificações

- testes direcionados da política híbrida: 15 aprovados;
- suíte completa: 111 arquivos e 896 testes aprovados;
- TypeScript: aprovado;
- build de produção: aprovado.

## Homologação manual

Repetir o fluxo com respostas curtas e financeiras. A conversa não deve ser
pausada por `podemos sim` nem por valores como `seria até 700 mil`. Pedidos
externos explícitos e tentativas de manipulação devem continuar gerando a
notificação de segurança para o dono.
