# Handoff — agenda e corretores

## Objetivo

Reservar horários reais, distribuir reuniões, obter aceite do corretor e registrar o resultado comercial com auditoria.

## Estado implementado

- Disponibilidade e slots.
- Consulta e reserva separadas.
- Oferta de reunião para corretores.
- Aceite, rejeição e transferência.
- Contingência/redistribuição.
- Convite e cadastro de corretores.
- Registro de fato humano e movimentação do pipeline.
- Call brief e resumo orientativo.

## Referências

- [Orquestração](../../RELATORIO_ORQUESTRACAO_AGENDAMENTO_2026-07-27.md)
- [Resumo de IA](../../RELATORIO_AGENDAMENTO_RESUMO_IA_2026-07-28.md)
- [Coerência da oferta e reserva](../../RELATORIO_CORRECAO_COERENCIA_OFERTA_RESERVA_2026-07-31.md)
- [Flexibilidade](../../RELATORIO_FLEXIBILIDADE_AGENDAMENTO_IA_2026-07-29.md)

## Pontos de atenção

- Horário textual, slot e compromisso precisam coincidir.
- Não ofertar reunião antes de concluir os campos obrigatórios.
- Corridas entre dois aceites devem ter decisão atômica.
- Testar cancelamento, liberação da vaga, alteração de horário e aceite tardio.
- Inbox block acontece depois da call finalizada, conforme regra de negócio confirmada.

