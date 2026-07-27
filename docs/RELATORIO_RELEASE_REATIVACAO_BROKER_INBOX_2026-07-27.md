# Relatório de release — Reativação e Inbox de corretores

Data: 27/07/2026

## Escopo integrado

- Correções da reativação de base: cadência aleatória de 30 a 50 segundos, vínculo das mensagens ao Inbox, preservação do nome importado e reinício seguro do estado da IA.
- Controle de acesso do Inbox por corretor e exigência de conexão do WhatsApp no fluxo de entrada.
- Migrações de RLS que separam leitura e modificação das conversas e mensagens por perfil.

## Integração

- Branch base: `codex/v1-platform`.
- Branch solicitada: `feature/broker-inbox-account`.
- Branch encontrada e integrada: `feature/broker-inbox-access`.
- Branch temporária de release: `release/reactivation-broker-inbox-20260727`.
- Commit de integração: `025a43e80bf1321db951eefa55bdf8dec862430a`.

## Validações

- 757 testes automatizados aprovados em 91 arquivos.
- TypeScript, lint e build de produção aprovados.
- Preview Vercel publicado e validado no navegador.
- Inbox carregada no preview sem erro interno.
- As duas migrações já estavam aplicadas e validadas no Supabase staging.

## Banco de dados

Migrações incluídas:

- `20260727193126_restrict_broker_inbox_and_require_whatsapp.sql`
- `20260727194444_split_broker_inbox_modify_policies.sql`

As migrações devem ser aplicadas no Supabase de produção junto com a publicação da `main`.

## Rollback

- Aplicação: promover o deployment anterior da Vercel.
- Banco: revisar antes de desfazer as políticas, pois o rollback pode reabrir acesso indevido ao Inbox.
