# Relatório — correção da confirmação de horário

Data: 30 de julho de 2026

## Incidente

Após apresentar os horários de hoje às 14:45, 15:00 e 15:15, a resposta
`pode ser 15h` não foi associada ao slot das 15:00. O fluxo repetiu o convite
para reunião e, no turno seguinte, a extração por IA interpretou a reclamação
do lead como um novo pedido para 05/08 às 15:00.

## Causa

A confirmação de um horário dentre várias opções dependia do campo
`accepted_slot_id` extraído pelo modelo. Embora os IDs dos três slots
estivessem persistidos no contexto semântico, não existia uma resolução
determinística do horário escrito pelo lead.

## Correção

- o servidor extrai hora e minuto da resposta do lead;
- a escolha é comparada exclusivamente com os slots oferecidos no turno
  anterior;
- `15h`, `15:00` e escolhas ordinais como `o segundo` selecionam o slot
  correspondente;
- um horário não oferecido nunca é aceito por essa resolução;
- a escolha determinística tem prioridade sobre a interpretação livre do
  modelo.

## Observação do teste

A notificação interna de distribuição chegou ao mesmo WhatsApp porque o
contato controlado Arthur Rocha e o perfil de corretor Arthur usam o mesmo
número. Ela foi enviada ao corretor, não projetada como mensagem do inbox do
lead. Em produção real, lead e corretor devem usar números distintos.

