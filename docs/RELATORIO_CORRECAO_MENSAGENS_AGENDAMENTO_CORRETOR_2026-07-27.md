# Correção de mensagens, agendamento e repasse ao corretor

## Evidência

- a conversa do Arthur permaneceu em `qualifying`;
- o valor de entrada conhecido na campanha não foi persistido como resposta de
  qualificação quando ele confirmou que o cenário continuava válido;
- sem qualificação concluída, nenhum horário garantido foi materializado para a
  oportunidade;
- não existiam registros em `appointments`, `assignment_offers` ou pendências;
- a conta do corretor mostrava zero reuniões e zero pendências, apesar de o
  texto da IA afirmar que abriria um atendimento humano.

## Correções

- confirmação simples da reativação passa a registrar objetivo e entrada
  conhecidos, sem aplicar a inferência quando o lead indicar mudança;
- respostas extensas passam a ser enviadas em blocos de até 180 caracteres,
  com pequeno intervalo entre eles;
- a impressão digital continua cobrindo a resposta completa;
- se um bloco posterior falhar, a conversa entra em revisão humana sem retry
  automático, evitando repetir blocos já entregues;
- a reserva e a oferta ao corretor continuam condicionadas a fatos persistidos
  e a um horário garantido disponível.

## Testes

- confirmação de objetivo e entrada conhecidos;
- recusa da inferência quando o lead informa mudança;
- preservação de mensagens naturalmente curtas;
- divisão de textos extensos em blocos;
- fluxo existente de confirmação determinística de reunião.
