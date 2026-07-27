# Relatório — orquestração de agendamento

Data: 27/07/2026  
Branch: `feature/appointment-orchestration`  
Banco alterado: Supabase Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)  
Produção: não alterada

## Incidente

Arthur informou disponibilidade para o dia seguinte às 10h. A IA respondeu que
o horário havia sido anotado e que um corretor entraria em contato para
confirmar. Entretanto, a oportunidade permaneceu em `qualifying`, não houve
registro em `appointments` e nenhuma linha foi criada em `assignment_offers`.

## Causas

- a conclusão da qualificação aceitava entrada ou parcela, mas não orçamento
  total;
- a agenda não era carregada enquanto a oportunidade permanecesse em
  `qualifying`;
- o extrator só aceitava um slot oferecido anteriormente pela assistente e não
  resolvia um horário proposto espontaneamente pelo lead;
- o texto livre do modelo podia afirmar uma confirmação sem comprovante
  transacional;
- o prompt tratava a confirmação do corretor como condição para o agendamento
  do lead.

## Alterações

- criada a RPC `studiosp_finalize_qualification_if_ready`;
- orçamento total, entrada ou parcela passam a satisfazer o requisito
  financeiro mínimo;
- data e hora solicitadas são extraídas em ISO 8601 com fuso de São Paulo;
- o horário solicitado é comparado com slots garantidos reais;
- um slot exato é reservado pela RPC transacional já existente;
- a reserva continua criando o compromisso, atualizando a oportunidade e
  criando a primeira oferta para corretor na mesma transação;
- a confirmação enviada ao lead é determinística e só existe quando a reserva
  retornou um `appointment`;
- sem reserva, o prompt proíbe “anotado”, “marcado”, “reservado” e “confirmado”;
- a distribuição do corretor passa a ser descrita como processo interno.

## Validações

- teste transacional no staging confirmou a passagem de `qualifying` para
  `qualified` com todas as respostas obrigatórias e apenas orçamento total;
- 94 arquivos de teste e 769 testes aprovados;
- typecheck aprovado;
- lint sem erros; 37 avisos preexistentes;
- build de produção aprovado com Next.js 16.2.11.

## Limite da homologação

O staging não possui slots garantidos futuros materializáveis no momento. Para
o teste real completo, o dono deve configurar cobertura futura e então validar:

1. horário exato disponível cria `appointment`;
2. a mensagem confirma o mesmo horário;
3. uma oferta aparece em `assignment_offers`;
4. horário indisponível gera alternativas reais;
5. ausência de reserva nunca produz confirmação.

## Rollback

A migration é aditiva. O rollback seguro consiste em reverter o código e
revogar o uso da nova RPC, preservando eventos e registros de agenda. A tabela
de compromissos e a fila existente não foram remodeladas.
