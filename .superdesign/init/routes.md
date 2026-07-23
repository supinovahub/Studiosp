# Rotas

O projeto usa Next.js App Router. Grupos entre parênteses não fazem parte da URL. Não existe arquivo de configuração de roteador separado.

| URL | Arquivo | Layout | Resumo |
|---|---|---|---|
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | AuthLayout | Recuperação de senha. |
| `/login` | `src/app/(auth)/login/page.tsx` | AuthLayout | Autenticação. |
| `/signup` | `src/app/(auth)/signup/page.tsx` | AuthLayout | Cadastro. |
| `/agents` | `src/app/(dashboard)/agents/page.tsx` | DashboardShell | Testes de IA, catálogo de imóveis, configuração e uso; será desmembrado. |
| `/automations/[id]/edit` | `src/app/(dashboard)/automations/[id]/edit/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/automations/[id]/logs` | `src/app/(dashboard)/automations/[id]/logs/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/automations/new` | `src/app/(dashboard)/automations/new/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/automations` | `src/app/(dashboard)/automations/page.tsx` | DashboardShell | Lista de automações herdadas. |
| `/broadcasts/[id]` | `src/app/(dashboard)/broadcasts/[id]/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/broadcasts/new` | `src/app/(dashboard)/broadcasts/new/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/broadcasts` | `src/app/(dashboard)/broadcasts/page.tsx` | DashboardShell | Campanhas de disparo herdadas. |
| `/contacts` | `src/app/(dashboard)/contacts/page.tsx` | DashboardShell | Lista, importação, edição e detalhe de contatos; evoluirá para Leads. |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` | DashboardShell | Dashboard analítico herdado, a ser transformado em visão operacional. |
| `/flows/[id]` | `src/app/(dashboard)/flows/[id]/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/flows/[id]/runs` | `src/app/(dashboard)/flows/[id]/runs/page.tsx` | DashboardShell | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/flows` | `src/app/(dashboard)/flows/page.tsx` | DashboardShell | Lista de fluxos herdados. |
| `/inbox` | `src/app/(dashboard)/inbox/page.tsx` | DashboardShell | Caixa de entrada em três painéis: conversas, mensagens e contexto do contato. |
| `/notifications` | `src/app/(dashboard)/notifications/page.tsx` | DashboardShell | Notificações; deverá convergir para central de atenção. |
| `/pipelines` | `src/app/(dashboard)/pipelines/page.tsx` | DashboardShell | Kanban de negócios, configurações de etapas e análises. |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` | DashboardShell | Central de configurações por seções. |
| `/join/[token]` | `src/app/join/[token]/page.tsx` | JoinLayout | Fluxo auxiliar ou detalhe da funcionalidade correspondente. |
| `/` | `src/app/page.tsx` | RootLayout | Entrada da aplicação; redireciona para o fluxo apropriado. |

## Layouts de rota

- `src/app/layout.tsx`: raiz, tema e internacionalização.
- `src/app/(dashboard)/layout.tsx`: área autenticada.
- `src/app/(auth)/layout.tsx`: autenticação.
- `src/app/join/layout.tsx`: aceite de convite.

## Rotas-alvo previstas na V1

Estas rotas ainda não existem e serão refinadas na especificação funcional:

- `/visao-geral`
- `/inbox`
- `/leads`
- `/pipeline`
- `/agenda`
- `/follow-ups`
- `/imoveis`
- `/equipe`
- `/inteligencia`
- `/relatorios`
- `/configuracoes`
