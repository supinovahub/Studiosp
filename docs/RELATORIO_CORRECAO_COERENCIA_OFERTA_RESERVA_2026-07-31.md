# Relatório — coerência entre oferta e reserva de horário

Data: 31/07/2026

## Incidente

Depois de concluir corretamente a qualificação, o lead recusou o horário das
12h e perguntou se havia um horário mais tarde. A assistente ofereceu 17h. O
lead respondeu “Bacana, pode ser sim”, mas o sistema pediu nova confirmação
para 17h45.

## Evidência e causa raiz

A mensagem que exibiu 17h manteve no metadado semântico o ID do slot anterior,
das 12h. A frase “você tem algum horário mais tarde?” não era reconhecida pela
classificação determinística de consulta de disponibilidade e foi respondida
pelo modelo em texto livre. Assim, a camada conversacional prometeu 17h sem
vincular essa promessa ao slot transacional correspondente.

No aceite seguinte, o servidor recusou corretamente reservar um horário que
não estava entre os IDs oferecidos. O modelo ainda interpretou o aceite como um
pedido para 20h e a regra de proximidade sugeriu o slot real das 17h45.

## Correção

- consultas com “algum/outro horário” e “mais tarde” são reconhecidas no
  servidor;
- a busca relativa usa o slot real anteriormente oferecido como referência e
  mantém o mesmo dia;
- uma consulta por horário mais tarde apresenta somente um slot real, para que
  um aceite sem repetir a hora continue inequívoco;
- o ID gravado no contexto é o mesmo usado para construir o texto apresentado;
- “Bacana, pode ser sim” é aceito como confirmação natural quando existe uma
  única opção;
- depois da qualificação, o caminho padrão de oferta deixa de depender da
  classificação de postura do modelo e usa sempre a oferta determinística;
- a reserva continua verificando disponibilidade novamente no banco antes do
  efeito transacional.

## Verificação

- replay automatizado do pedido “você tem algum horário mais tarde?” e do
  aceite “Bacana, pode ser sim”;
- 34 testes direcionados aprovados;
- 910 testes da suíte completa aprovados;
- TypeScript aprovado;
- build de produção aprovado.

## Banco

Não houve alteração de schema ou migration. A correção é exclusivamente de
orquestração e pode ser revertida pelo commit correspondente.
