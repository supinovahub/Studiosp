# Relatório — privacidade pós-call, qualificação e agenda

Data: 28/07/2026  
Branch: `fix/inbox-block-staging`  
Banco alterado: Supabase Staging `vgmmfzdifjhpqaopxfbj`

## Escopo

1. Impedir que o corretor continue vendo ou contatando o lead depois de
   finalizar a call.
2. Impedir oferta de reunião com métricas de qualificação ainda vazias.
3. Evitar divergência de horário quando a reserva é persistida, mas o envio da
   confirmação falha e o trabalho é repetido.

## Diagnóstico confirmado

- A política de acesso considerava somente a atribuição do corretor e não o
  estado fechado da conversa.
- A qualificação era concluída quando todas as perguntas marcadas como
  obrigatórias e apenas uma métrica financeira estavam confirmadas.
- No atendimento analisado, R$ 100.000,00 era o valor de entrada conhecido pela
  reativação. Parcela mensal e preço total não tinham resposta.
- A reserva das 08:00 foi persistida antes de uma falha de envio do WhatsApp.
  No retry, a própria reserva aparecia como ocupação e a IA oferecia horários a
  partir de 08:15.

## Alterações

- RLS e funções de autorização agora retiram do corretor o acesso ao contato,
  oportunidade, conversa e mensagens quando a conversa está `closed`.
- O corretor pode fechar uma conversa aberta, mas não pode reabri-la ou
  modificá-la depois do fechamento.
- A conclusão da qualificação exige todas as perguntas ativas, exceto
  `schedule_preference`.
- O contexto entregue à IA lista todas as lacunas que ainda impedem a oferta.
- Valores monetários normalizados passam a ser exibidos como moeda, evitando
  mostrar respostas genéricas como “Pode sim” no lugar de R$ 100.000,00.
- O retry de agendamento recupera a reserva vinculada à mensagem original e
  reapresenta a confirmação do mesmo horário.

## Migration

- `20260728083628_enforce_post_call_privacy_and_complete_qualification.sql`

## Evidências

- Teste transacional de RLS em staging:
  - conversa aberta: contato, conversa, gestão e oportunidade acessíveis;
  - conversa fechada: os quatro acessos retornaram `false`.
- Testes automatizados direcionados: 4 aprovados.
- Regressão completa: 98 arquivos e 780 testes aprovados.
- TypeScript e build de produção: aprovados.
- Lint: 0 erros e 37 avisos preexistentes.
- Preview publicado com sucesso. A homologação visual autenticada ficou
  pendente porque a credencial de corretor disponível não existe no Supabase
  Staging.

## Estado

Promovido para produção em 28/07/2026 após validação técnica no staging.

Também foram promovidos:

- recuperação idempotente da reserva após retry;
- bloqueio do Inbox depois da call finalizada;
- mensagens iniciais de reativação em blocos semânticos;
- reparo dos textos UTF-8 em Inteligência, qualificação, motivos operacionais,
  follow-ups, catálogo e auditoria.

As migrations foram aplicadas ao Supabase de produção e a varredura final de
mojibake retornou zero ocorrências. O teste transacional de RLS em produção
confirmou que o corretor possui acesso durante a conversa aberta e perde acesso
ao contato, conversa e oportunidade depois do fechamento.

## Rollback

Restaurar as versões anteriores das funções
`can_access_contact`, `can_manage_contact`, `can_access_conversation`,
`can_manage_conversation`, `can_access_opportunity` e
`studiosp_finalize_qualification_if_ready`, além da policy anterior
`conversations_update_assigned`.
