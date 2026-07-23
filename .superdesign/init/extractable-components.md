# Componentes extraíveis

## Sidebar

- Source: `src/components/layout/sidebar.tsx`
- Category: layout
- Description: Navegação principal responsiva com identidade Studiosp, grupos e conta do usuário.
- Extractable props: `activeItem` (string, default: "dashboard"), `isOpen` (boolean, default: true), `notificationCount` (number, default: 0)
- Hardcoded: logotipo tipográfico, rótulos de navegação, ícones Lucide e classes visuais.

## Header

- Source: `src/components/layout/header.tsx`
- Category: layout
- Description: Cabeçalho móvel com menu e controles da área autenticada.
- Extractable props: `showMenuButton` (boolean, default: true), `notificationCount` (number, default: 0)
- Hardcoded: ícones e classes de layout.

## DashboardShell

- Source: `src/app/(dashboard)/dashboard-shell.tsx`
- Category: layout
- Description: Estrutura global com sidebar fixa, header e conteúdo rolável.
- Extractable props: `sidebarOpen` (boolean, default: true)
- Hardcoded: breakpoints, espaçamento e composição.

## ConversationList

- Source: `src/components/inbox/conversation-list.tsx`
- Category: basic
- Description: Lista pesquisável e filtrável de conversas.
- Extractable props: `activeConversationId` (string, default: ""), `unreadCount` (number, default: 0)
- Hardcoded: estrutura dos filtros, ícones e estilo dos itens.

## MessageThread

- Source: `src/components/inbox/message-thread.tsx`
- Category: basic
- Description: Cabeçalho do atendimento, histórico de mensagens e compositor.
- Extractable props: `humanMode` (boolean, default: false), `showAiStatus` (boolean, default: true)
- Hardcoded: ícones, estrutura das mensagens e composição.

## ContactSidebar

- Source: `src/components/inbox/contact-sidebar.tsx`
- Category: basic
- Description: Painel contextual do contato dentro da inbox.
- Extractable props: `isVisible` (boolean, default: true)
- Hardcoded: seções, ícones e campos.

## PipelineBoard

- Source: `src/components/pipelines/pipeline-board.tsx`
- Category: basic
- Description: Quadro horizontal de etapas e cards comerciais.
- Extractable props: `activeStage` (string, default: ""), `showValues` (boolean, default: true)
- Hardcoded: estrutura das colunas e interações de arrastar.

## MetricCard

- Source: `src/components/dashboard/metric-card.tsx`
- Category: basic
- Description: Card compacto de indicador, tendência e comparação.
- Extractable props: `value` (string, default: "0"), `trend` (string, default: "neutral")
- Hardcoded: tipografia, ícones de tendência e superfícies.

## SettingsRail

- Source: `src/components/settings/settings-rail.tsx`
- Category: layout
- Description: Navegação lateral interna das configurações.
- Extractable props: `activeItem` (string, default: "overview")
- Hardcoded: grupos, rótulos e ícones.

## PropertyCatalog

- Source: `src/components/agents/property-catalog.tsx`
- Category: basic
- Description: Catálogo atual de imóveis; referência funcional para a futura área de empreendimentos.
- Extractable props: `activeView` (string, default: "grid"), `itemCount` (number, default: 0)
- Hardcoded: formulário, cards e ações.

## Componentes básicos não recomendados para extração

Button, Input, Textarea, Select, Badge, Card, Tabs, Dialog, Sheet e Table devem permanecer inline nos drafts; são primitivas pequenas e já estão integralmente documentadas em `components.md`.
