# Relatório — trava de qualificação e consulta de disponibilidade

Data: 28/07/2026

## Incidente reproduzido

Na conversa controlada de Arthur Rocha, às 11h33, a IA ofereceu uma reunião
apesar de a oportunidade permanecer em qualificação. Às 11h33:45, a pergunta
“Hoje você tem quais horários?” foi interpretada como uma solicitação para
15h e como insistência em encaixe. Embora existissem horários reais para o
mesmo dia, a resposta informou que não havia disponibilidade.

O banco também continha “Higienópolis” como faixa de entrada, parcela mensal
ausente e prazo ainda provisório.

## Causas

- a finalização da qualificação era protegida no banco, mas a resposta livre do
  modelo ainda podia ofertar reunião;
- a consulta de slots retornava vazio sempre que a oportunidade ainda estava
  em `qualifying`;
- não havia validação do formato normalizado conforme o tipo da pergunta;
- a intenção genérica de consultar horários podia ser confundida com pedido de
  horário exato;
- a busca usava duas horas fixas em vez da política ativa.

## Implementação

- validação tipada para dinheiro, localização, escolha, data, booleano e texto;
- bloqueio de oferta e reserva enquanto qualquer pergunta ativa estiver
  pendente;
- substituição de oferta prematura pela próxima pergunta da qualificação;
- consulta real de horários permitida durante a qualificação, com retomada da
  pergunta pendente;
- perguntas genéricas de disponibilidade zeram horário solicitado, aceite e
  insistência inferidos pelo modelo;
- respostas de disponibilidade são determinísticas e mostram até três opções;
- antecedência e horizonte vêm da política da conta;
- slots são limitados a corretores ativos, disponíveis e com WhatsApp
  confirmado;
- a reserva continua transacional e somente acontece após a qualificação
  completa.

## Verificações previstas

- regressão do caso “Higienópolis” em campo monetário;
- consulta “Hoje você tem quais horários?” sem horário inventado;
- oferta prematura substituída por pergunta pendente;
- consulta com três slots reais e retomada da parcela mensal;
- aceite e reserva somente depois de todas as respostas confirmadas;
- testes completos, lint, typecheck e build de produção.

## Banco e rollback

Não foi necessária alteração de schema. O rollback do comportamento é feito
pela reversão do commit. O contato controlado será limpo depois da publicação,
preservando os eventos imutáveis de auditoria.
