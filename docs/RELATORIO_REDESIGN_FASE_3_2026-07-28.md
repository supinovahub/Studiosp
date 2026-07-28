# Relatório do redesign — Fase 3

Data: 28/07/2026  
Branch: `redesign/full-ui-refresh`

## Escopo

- Leads e oportunidades;
- detalhe do lead;
- pipeline orientado por fatos;
- Inbox;
- agenda;
- follow-ups.

## Alterações visuais

- resumos operacionais e filtros com hierarquia consistente;
- listas responsivas com melhor leitura de etapa, atenção e responsável;
- pipeline horizontal com colunas e cards mais legíveis;
- detalhe do lead com navegação contextual fixa e painel de ações destacado;
- Inbox com três painéis visualmente separados, lista de conversas mais
  legível e cabeçalho móvel reforçado;
- agenda e follow-ups com indicadores de volume e exceção;
- português e acentuação revisados nas superfícies alteradas.

## Contratos preservados

- hooks `useStudiospData()` e ações `runStudiospAction()`;
- deep links e rotas existentes;
- realtime, ressincronização e deduplicação do Inbox;
- envio otimista, unread, atribuição e painel de contato;
- bloqueio do compositor após conclusão da call;
- filtros e eventos comerciais do lead;
- pipeline movido somente por fatos;
- nenhuma mudança em APIs, migrations, RLS, Supabase, IA ou WhatsApp.

## Validação

- `npm run typecheck`;
- `npm run lint`;
- `npm test`: 99 arquivos e 791 testes aprovados;
- revisão das práticas React aplicáveis;
- `git diff --check`.

## Rollback

Reverter o commit da Fase 3 restaura apenas a apresentação anterior. Não há
rollback de banco ou infraestrutura.
