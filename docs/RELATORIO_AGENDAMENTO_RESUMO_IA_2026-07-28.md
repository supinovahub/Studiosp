# Relatório — agenda, abordagem e resumo orientativo

Data: 28 de julho de 2026

## Escopo

- substituir contagens exatas por uma abordagem comercial factual sobre
  “algumas oportunidades”;
- comunicar calls de 10 a 15 minutos;
- reservar 15 minutos por padrão e preservar 10 minutos de intervalo;
- negociar preferências de horário e abrir exceção para o dono quando o lead
  recusar alternativas;
- adicionar uma aba Resumo ao lead, com preparação orientativa da call;
- permitir que o dono agende uma call para um corretor ou para si.

## Implementação

- o orquestrador diferencia catálogo com matches, catálogo sem matches e dados
  insuficientes, sem inventar disponibilidade;
- a confirmação determinística passou a informar 10 a 15 minutos;
- horários alternativos são ordenados por proximidade no mesmo dia e fuso de
  São Paulo;
- insistência em horário indisponível cria `schedule_exception` na Central de
  Atenção e usa a mensagem “vou validar esse encaixe”;
- `opportunities.call_brief` guarda o roteiro orientativo sanitizado e
  `call_brief_updated_at` informa sua atualização;
- a página do lead possui as abas Resumo, Qualificação, Oportunidades e
  Histórico;
- o dono possui a ação **Agendar call**, com responsável, data, duração, canal,
  observação e confirmação opcional ao lead;
- `studiosp_schedule_manual_appointment` valida papel, conta, conflito,
  intervalo, oportunidade ativa e idempotência;
- o dono recebe um perfil operacional de agenda fora do roteamento automático
  quando escolhe assumir uma call;
- falha ao enviar a confirmação não desfaz a reserva e abre uma pendência
  crítica para revisão.

## Banco de dados

Migration versionada:

- `20260728123000_lead_scheduling_summary.sql`

Alterações:

- colunas `call_brief` e `call_brief_updated_at`;
- intervalo permitido a partir de 10 minutos;
- política ativa atualizada para 15 minutos de call e 10 de intervalo;
- textos ativos de IA atualizados de 5–10 para 10–15 minutos;
- função privilegiada de agendamento manual com autorização interna explícita.

## Evidências em staging

- projeto: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`);
- chamada transacional pelo dono criou uma reunião `broker_confirmed` de 15
  minutos e foi revertida após a verificação;
- chamada equivalente por corretor foi rejeitada;
- política ativa consultada com duração 15 e intervalo 10;
- Preview da Vercel compilado com sucesso;
- login real do dono confirmou:
  - botão **Agendar call**;
  - modal completo de agendamento;
  - abas Resumo, Qualificação, Oportunidades e Histórico;
  - conteúdo orientativo e estado vazio legível;
- nenhum erro ou fatal foi encontrado nos logs do Preview durante a
  homologação.

## Verificações automatizadas

- TypeScript: aprovado;
- Vitest: 98 arquivos e 781 testes aprovados;
- ESLint: zero erros e 37 avisos preexistentes;
- testes específicos de horário exato, confirmação e alternativas próximas:
  aprovados;
- build remoto da Vercel: aprovado.

## Advisors

Os advisors de segurança e desempenho foram executados no staging. Permanecem
avisos preexistentes, como `pg_net` no schema público, funções
`SECURITY DEFINER` expostas e políticas permissivas duplicadas.

A nova função aparece na categoria geral de `SECURITY DEFINER` acessível a
usuários autenticados, mas possui validação interna obrigatória de
`auth.uid()`, conta e papel administrativo. Um teste com JWT de corretor
confirmou a rejeição.

Referências:

- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## Rollback

- reverter o frontend para o commit anterior;
- remover a permissão de execução da função manual;
- restaurar a política anterior de duração e intervalo;
- manter as colunas JSONB, pois são aditivas e não interferem no fluxo antigo;
- resolver ou cancelar pendências `schedule_exception` abertas durante o
  rollout, sem apagar o histórico.

## Promoção para produção

- migration aplicada no Supabase Studiosp de produção;
- política ativa validada com 15 minutos de duração e 10 minutos de intervalo;
- chamada transacional em produção confirmou uma reunião de 15 minutos e foi
  revertida sem deixar dados de teste;
- branch homologada integrada por fast-forward à `main`;
- commit promovido: `53a7074`;
- deployment oficial validado após a conclusão da Vercel;
- varredura de logs executada após o acesso ao frontend oficial.

