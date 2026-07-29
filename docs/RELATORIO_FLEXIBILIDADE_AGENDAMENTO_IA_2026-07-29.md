# Relatório — flexibilidade de agendamento da IA

Data: 29/07/2026

## Problema observado

- a frase “tem algo no horário da tarde?” não era reconhecida como refinamento
  de disponibilidade;
- a busca carregava somente os oito primeiros horários, favorecendo os slots da
  manhã e ocultando opções posteriores;
- ao mudar apenas o período, o dia anteriormente informado podia ser perdido;
- a preferência de horário dependia da extração probabilística do modelo e
  podia não ser persistida;
- o contexto semântico podia associar a resposta a um slot diferente daquele
  efetivamente apresentado.

## Correções

- reconhecimento determinístico de consultas por manhã, tarde ou noite;
- preservação do dia solicitado durante refinamentos sucessivos;
- filtragem combinada por dia e período, sem oferecer horários fora do filtro
  quando não houver resultado;
- ampliação da leitura para até 200 slots elegíveis;
- persistência determinística de `schedule_preference` quando a mensagem contém
  uma preferência inequívoca;
- continuidade da preferência no contexto semântico entre turnos;
- IDs semânticos alinhados aos horários realmente apresentados.

## Verificações

- TypeScript: aprovado;
- testes automatizados: 109 arquivos e 874 testes aprovados;
- novos cenários cobrem “tem algo no horário da tarde?”, preservação do dia e
  exclusão de horários da manhã ou de outro dia.

## Homologação pendente

A validação ponta a ponta pelo WhatsApp permanece a cargo do usuário, conforme
o protocolo do projeto.
