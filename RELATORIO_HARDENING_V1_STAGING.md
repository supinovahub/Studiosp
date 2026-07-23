# Relatório de hardening da V1 — staging

Data: 23/07/2026  
Branch: `codex/v1-hardening`  
Supabase: **Studiosp Staging** (`vgmmfzdifjhpqaopxfbj`)

## Escopo executado

### Autorização no servidor

- A API `/api/studiosp/data` passou a rejeitar com HTTP 403 as views
  administrativas solicitadas por corretor ou visualizador.
- Views administrativas protegidas: visão geral, central de atenção, pipeline,
  follow-ups, empreendimentos, inteligência, configurações e relatórios.
- Corretor continua autorizado somente nas views operacionais: meu dia, leads
  próprios, detalhe de lead próprio, agenda própria e equipe pessoal.
- Corretor sem `broker_profile` ativo agora recebe erro explícito, em vez de uma
  consulta sem filtro.
- A view de equipe restringe no servidor corretores, perfil, disponibilidade,
  convites e reuniões ao próprio corretor.
- Pendências do “Meu dia” são filtradas pelo perfil atribuído.
- Foram adicionados testes unitários da matriz de permissões e testes de
  integração do Route Handler para owner e corretor.

### Estados de carregamento e erros

- `useStudiospData` ganhou timeout de 15 segundos com `AbortController`.
- Em caso de timeout, a interface mostra mensagem em português e mantém o botão
  “Tentar novamente” já oferecido pelo estado operacional.
- Foi criado um error boundary para o dashboard com recuperação por nova
  tentativa.

### Monitoramento do frontend

- Criado o endpoint autenticado `/api/client-errors`.
- Exceções de renderização do dashboard são enviadas em formato estruturado aos
  logs da Vercel.
- O payload é limitado e não envia stack trace, cookies ou credenciais.

### Roles e português

- A role técnica `agent` passou a ser apresentada como **Corretor** nos fluxos
  de convite, membros e automações.
- Datas relativas das notificações agora usam o locale `pt-BR` do `date-fns`.

### Relatórios e CSV

- Os cálculos deixaram de carregar até 500 leads e eventos no navegador.
- Criada a função `studiosp_report_summary`, executada como `SECURITY INVOKER`.
- A função valida internamente que o usuário é owner/admin e agrega no Postgres:
  leads recebidos, oportunidades ativas, reuniões realizadas, vendas e
  faturamento.
- Adicionados filtros de período, corretor, origem, empreendimento e etapa.
- Gráficos, métricas, listagem e CSV usam o mesmo resultado filtrado.
- A função não possui permissão para `anon`.

### Empreendimentos e uploads

- Empreendimentos não publicados mostram:
  “Invisível para corretores até publicar”.
- O upload múltiplo não para silenciosamente na primeira falha.
- A tela exibe resultado individual por arquivo e resumo de sucessos/falhas,
  tornando sucesso parcial explícito.

### Auditoria de disponibilidade

- A alteração de disponibilidade registra:
  usuário/perfil, data, estado anterior, estado novo e bloqueio anterior/novo.

### Concorrência de agenda

- Adicionada constraint de exclusão no Postgres para impedir sobreposição de
  reuniões ativas do mesmo corretor.
- A regra cobre reserva, confirmação, reagendamento, alteração de horário e duas
  confirmações concorrentes.
- Cancelamentos e reuniões finalizadas deixam de participar da restrição,
  liberando o horário.
- A constraint foi verificada no schema de staging.

### Build local reproduzível

- Os clientes Supabase das páginas de autenticação agora são inicializados
  apenas na ação do usuário.
- `next build` passou a funcionar sem variáveis reais durante a pré-renderização.
- Adicionado `npm run env:staging` e o guia
  `docs/STAGING_WORKFLOW.md`.
- O pull local de variáveis exige que a CLI da Vercel esteja autenticada na
  equipe proprietária do projeto. A sessão atual da CLI não tinha esse acesso,
  mas isso não bloqueou o build local.

## Migration aplicada somente no staging

- `20260723170000_v1_hardening_reports_audit_scheduling.sql`

Ela cria:

- extensão `btree_gist` no schema `extensions`;
- RPC segura de relatórios;
- auditoria completa de disponibilidade;
- constraint `appointments_no_broker_overlap`.

Nenhuma migration deste pacote foi aplicada no Supabase de produção.

## Segurança do Supabase

Revisão executada no staging:

- As tabelas da V1 não possuem chaves estrangeiras sem índice.
- As tabelas da V1 não possuem políticas permissivas duplicadas.
- As novas funções usam privilégios mínimos; a função de relatório é
  `SECURITY INVOKER`.
- Algumas funções `SECURITY DEFINER` existentes são endpoints intencionais e
  fazem validação de `auth.uid()` internamente. Mover ou revogar sem redesenhar
  as chamadas quebraria fluxos existentes.
- `pg_net` é uma extensão não relocável na instalação atual. Movê-la exige uma
  janela separada de manutenção e validação dos cron jobs.
- A proteção contra senhas vazadas deve ser habilitada manualmente no painel do
  Supabase Auth.
- Os avisos de índices e políticas duplicadas restantes pertencem ao CRM legado
  e devem ser tratados em uma migration própria, com medição de impacto.

Referências dos advisors:

- https://supabase.com/docs/guides/database/database-linter
- https://supabase.com/docs/guides/auth/password-security

## Validações

- `npm test`: **694 testes aprovados em 74 arquivos**.
- Testes novos de autorização: **32 cenários** entre matriz e Route Handler.
- `npm run typecheck`: aprovado.
- `npm run lint`: zero erros; permanecem avisos preexistentes fora deste pacote.
- `npm run build`: aprovado, 71 páginas geradas.
- Preview Vercel `studiosp-git-codex-v1-hardening-brio5.vercel.app`: `READY`.
- Smoke test público: página de login carregada em português, sem erro de
  runtime.
- O smoke test autenticado no Preview não foi concluído porque a credencial
  anteriormente fornecida não é mais aceita pelo projeto de staging.
- Migration aplicada com sucesso no Supabase Staging.
- RPC de relatório executada com contexto de owner.
- Constraint de sobreposição confirmada no catálogo do Postgres.

## Fora do escopo

- Nenhum código de UAZAPI ou WhatsApp foi alterado.
- Produção, branch `main` e projeto Supabase **Studiosp** permaneceram
  inalterados.
