# Relatório — Reativação de base no staging

## Ambiente

- Branch: `feature/reactivacao-leads`
- Supabase: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)
- Produção: não alterada

## Implementado

- importação CSV/XLSX com preview, normalização e segmentação;
- campanhas em rascunho, ativação, pausa, retomada e cancelamento;
- vínculo com contato existente ou criação de contato, conversa e oportunidade;
- origem operacional `reactivation` e contexto conhecido preservado em metadados;
- fila idempotente D0, D2, D5 e D9 com claim concorrente;
- envio pelo provedor já protegido por `OUTBOUND_TEST_NUMBERS`;
- cancelamento das próximas mensagens quando o lead responde;
- opt-out no contato, campanha e conversa;
- contexto específico de recuperação antes da qualificação normal da IA-SDR;
- eventos e métricas básicas de envios e respostas;
- acesso administrativo no cliente, API e RLS.

## Banco

- `20260724180000_reactivation_campaigns.sql`
- `20260724190000_reactivation_execution_queue.sql`
- tabelas: `reactivation_campaigns`, `reactivation_imports`,
  `reactivation_leads`, `reactivation_touches` e `reactivation_events`;
- função de claim disponível somente para `service_role`.

## Verificações executadas

- TypeScript: aprovado;
- ESLint do escopo alterado: aprovado;
- testes automatizados: 15 aprovados;
- build Next.js: aprovado;
- tabelas, função de claim e RLS verificadas no staging.

## Pendência de homologação real

A execução com WhatsApp deve usar exclusivamente o número controlado autorizado.
Antes de produção, validar D0, resposta, cancelamento de D2/D5/D9, opt-out,
handoff, pausa e retomada. Nenhum envio amplo está autorizado.

## Rollback

Pausar ou cancelar campanhas interrompe novos claims. Para rollback de
aplicação, retornar o alias do preview ao commit anterior. As tabelas são
expansivas e podem permanecer sem uso; não devem ser removidas enquanto houver
campanhas ou eventos de auditoria.
