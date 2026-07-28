# Mapa de superfícies e contratos

## Arquitetura atual

- Next.js 16 App Router, React 19 e Tailwind CSS 4.
- Shell autenticado em `src/app/(dashboard)/dashboard-shell.tsx`.
- Navegação em `src/components/layout/`.
- Primitives em `src/components/ui/`.
- Telas V1 em `src/components/studiosp/`.
- Dados V1 por `useStudiospData()` e ações por `runStudiospAction()`.
- Inbox com Supabase Realtime e estado local especializado.
- Autorização no cliente e servidor; nunca reduzir a proteção a esconder UI.

## Superfícies críticas

### Shell, autenticação e perfis

Preservar redirecionamentos, onboarding do corretor, presença, heartbeat de
reativação, logout, tema e distinção owner/corretor.

### Inbox

Preservar deep link `?c=`, sincronização realtime, deduplicação, reconexão,
mensagem otimista, unread, atribuição, bloqueio após call, compositor e painel
do contato. Redesenhar por extração de componentes, não por reescrita total.

### Leads e detalhe

Preservar qualificação, resumo orientativo, fatos humanos, conclusão de call,
status comercial, agendamento manual, bloqueios e movimentação do pipeline.

### Agenda e distribuição

Preservar slots reais, capacidade, concorrência, reservas, ofertas, aceite,
rejeição, transferência, redistribuição e contingência.

### Reativação

Preservar análise de CSV, preview, campanhas, cadência, timer aleatório,
arquivamento, logs, idempotência, whitelist e primeira mensagem especializada.

### Empreendimentos

Preservar rascunho/publicação, condições, mídia, múltiplos arquivos, análise
por IA, preview, aprovação e visibilidade para corretores.

### Inteligência e configurações

Preservar credenciais, prompts, whitelist, limites, integração WhatsApp,
convites, equipe, permissões e dados sensíveis.

## Matriz de validação por rota

Para cada rota alterada, registrar:

1. perfil testado;
2. carregamento normal;
3. vazio;
4. erro e retry;
5. ação principal;
6. ação destrutiva ou irreversível;
7. acesso via teclado;
8. desktop;
9. celular;
10. evidência de que requests e respostas não mudaram.

## Limite de uma fase visual

Arquivos de API, Supabase, migrations, workers, IA, WhatsApp e regras de
negócio só podem mudar para corrigir um defeito funcional aprovado
separadamente. Um redesign não autoriza essa expansão.

