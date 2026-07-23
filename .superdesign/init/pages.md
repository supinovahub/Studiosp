# Árvores de dependência das páginas principais

As árvores abaixo priorizam dependências locais que afetam a interface. Bibliotecas externas, acesso a dados e hooks sem UI foram omitidos.

## Shell autenticado

Entry: `src/app/(dashboard)/layout.tsx`

Dependencies:
- `src/app/(dashboard)/dashboard-shell.tsx`
  - `src/components/layout/sidebar.tsx`
    - `src/components/layout/mode-toggle.tsx`
    - `src/components/ui/tooltip.tsx`
  - `src/components/layout/header.tsx`
    - `src/components/ui/button.tsx`
    - `src/components/ui/sheet.tsx`
    - `src/components/layout/sidebar.tsx`
  - `src/components/presence/presence-heartbeat.tsx`

## /dashboard

Entry: `src/app/(dashboard)/dashboard/page.tsx`

Dependencies:
- `src/components/dashboard/metric-card.tsx`
- `src/components/dashboard/skeleton.tsx`
- `src/components/dashboard/quick-actions.tsx`
- `src/components/dashboard/conversations-chart.tsx`
  - `src/components/dashboard/empty-state.tsx`
  - `src/components/dashboard/skeleton.tsx`
- `src/components/dashboard/pipeline-donut.tsx`
  - `src/components/dashboard/empty-state.tsx`
  - `src/components/dashboard/skeleton.tsx`
- `src/components/dashboard/response-time-chart.tsx`
  - `src/components/tremor/bar-chart.tsx`
  - `src/components/dashboard/empty-state.tsx`
  - `src/components/dashboard/skeleton.tsx`
- `src/components/dashboard/activity-feed.tsx`
  - `src/components/dashboard/empty-state.tsx`
  - `src/components/dashboard/skeleton.tsx`

## /inbox

Entry: `src/app/(dashboard)/inbox/page.tsx`

Dependencies:
- `src/components/inbox/conversation-list.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/dropdown-menu.tsx`
  - `src/components/ui/scroll-area.tsx`
- `src/components/inbox/message-thread.tsx`
  - `src/components/presence/presence-dot.tsx`
  - `src/components/ui/badge.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/scroll-area.tsx`
  - `src/components/inbox/message-bubble.tsx`
    - `src/components/inbox/reply-quote.tsx`
    - `src/components/inbox/message-reactions.tsx`
    - `src/components/interactive/interactive-preview.tsx`
  - `src/components/inbox/message-actions.tsx`
  - `src/components/inbox/message-composer.tsx`
    - `src/components/inbox/reply-quote.tsx`
    - `src/components/inbox/quick-reply-picker.tsx`
    - `src/components/ui/button.tsx`
    - `src/components/ui/gated-button.tsx`
  - `src/components/inbox/template-picker.tsx`
  - `src/components/inbox/ai-thread-banner.tsx`
- `src/components/inbox/contact-sidebar.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/scroll-area.tsx`

## /contacts

Entry: `src/app/(dashboard)/contacts/page.tsx`

Dependencies:
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/gated-button.tsx`
- `src/components/contacts/contact-form.tsx`
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/label.tsx`
  - `src/components/ui/badge.tsx`
- `src/components/contacts/contact-detail-view.tsx`
  - `src/components/ui/tabs.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/textarea.tsx`
  - `src/components/ui/avatar.tsx`
  - `src/components/ui/badge.tsx`
  - `src/components/ui/scroll-area.tsx`
- `src/components/contacts/import-modal.tsx`
- `src/components/contacts/custom-fields-manager.tsx`

## /pipelines

Entry: `src/app/(dashboard)/pipelines/page.tsx`

Dependencies:
- `src/components/pipelines/pipeline-board.tsx`
  - `src/components/pipelines/deal-card.tsx`
  - `src/components/ui/button.tsx`
- `src/components/pipelines/pipeline-settings.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/label.tsx`
  - `src/components/ui/dialog.tsx`
- `src/components/pipelines/deal-form.tsx`
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/textarea.tsx`
  - `src/components/ui/select.tsx`
- `src/components/pipelines/pipeline-analytics.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/dialog.tsx`

## /agents

Entry: `src/app/(dashboard)/agents/page.tsx`

Dependencies:
- `src/components/ui/tabs.tsx`
- `src/components/agents/ai-playground.tsx`
- `src/components/agents/ai-usage.tsx`
- `src/components/settings/ai-config.tsx`
- `src/components/agents/property-catalog.tsx`
  - `src/components/ui/badge.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/card.tsx`
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/input.tsx`
  - `src/components/ui/label.tsx`
  - `src/components/ui/select.tsx`
  - `src/components/ui/textarea.tsx`

## /settings

Entry: `src/app/(dashboard)/settings/page.tsx`

Dependencies:
- `src/components/settings/settings-rail.tsx`
- `src/components/settings/settings-overview.tsx`
  - `src/components/settings/settings-chip.tsx`
  - `src/components/ui/avatar.tsx`
  - `src/components/ui/card.tsx`
- `src/components/settings/profile-form.tsx`
- `src/components/settings/security-panel.tsx`
- `src/components/settings/appearance-panel.tsx`
- `src/components/settings/whatsapp-config.tsx`
- `src/components/settings/template-manager.tsx`
- `src/components/settings/quick-replies-manager.tsx`
- `src/components/settings/fields-and-tags-panel.tsx`
- `src/components/settings/deals-settings.tsx`
- `src/components/settings/members-tab.tsx`
- `src/components/settings/api-keys-settings.tsx`

## /automations e /flows

Entry:
- `src/app/(dashboard)/automations/page.tsx`
- `src/app/(dashboard)/flows/page.tsx`

Dependencies:
- `src/components/automations/automation-builder.tsx`
- `src/components/flows/flow-builder.tsx`
- `src/components/flows/flow-canvas.tsx`
- `src/components/flows/flow-editor-shell.tsx`
- `src/components/flows/header.tsx`
- `src/components/flows/validation-panel.tsx`
- `src/components/flows/forms/node-config-form.tsx`

## Observação para futuros drafts

Antes de desenhar uma rota, abrir a página real e confirmar o ramo responsivo renderizado. `message-thread.tsx` ultrapassa 900 linhas e deve ser fornecido ao Superdesign apenas nos intervalos de renderização relevantes; os demais arquivos listados podem ser passados integralmente quando estiverem abaixo do limite.
