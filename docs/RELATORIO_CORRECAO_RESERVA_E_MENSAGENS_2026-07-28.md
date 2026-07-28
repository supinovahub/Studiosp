# Relatório — reserva automática e mensagens comerciais

Data: 28/07/2026

## Escopo

- impedir confirmação textual quando a reserva de reunião falhar;
- tornar determinística a oferta de “algumas oportunidades”;
- impedir que mensagens sejam cortadas no meio de uma frase;
- preparar o contato controlado Arthur Rocha para um novo teste integral.

## Diagnóstico

A última conversa ofereceu 28/07 às 13h15 e o lead aceitou. A reserva foi
recusada porque uma reunião anterior ainda permanecia ativa na oportunidade.
Mesmo sem reserva nova, a resposta livre do modelo informou incorretamente que
a reunião estava pré-agendada. Sem reserva, nenhuma oferta de distribuição foi
criada e, por consequência, o corretor não recebeu a mensagem no WhatsApp.

O segundo problema estava no segmentador de mensagens: frases maiores que 180
caracteres eram cortadas no último espaço disponível, sem respeitar o término
da ideia.

## Correções

- a falha da função de reserva passa a gerar resposta determinística sem
  alegação de agendamento;
- a mesma falha abre atenção crítica e registra somente uma descrição
  higienizada do erro;
- após a qualificação, a oferta passa a dizer sempre que existem “algumas
  oportunidades de acordo com o perfil”, sem depender da contagem do matching;
- a sugestão do primeiro horário garantido também é determinística;
- o segmentador mantém frases longas inteiras e agrupa apenas sentenças
  completas dentro do tamanho-alvo;
- o reset operacional encerra a reunião antiga, libera sua capacidade e limpa
  mensagens, qualificação, jobs, sessão de reativação e follow-ups sem apagar a
  auditoria imutável.

## Verificações

- testes direcionados de mensagens, agendamento, retry e auto-reply;
- lint sem erros (avisos preexistentes permanecem);
- build de produção do Next.js concluído;
- verificação final do banco: contato preservado, nenhuma mensagem ou
  qualificação ativa, nenhuma sessão de reativação e nenhuma reunião ativa.

## Rollback

O código pode ser revertido pelo commit desta correção. O histórico operacional
apagado do contato de teste não é recuperável pela aplicação; eventos de
auditoria imutáveis foram preservados.
