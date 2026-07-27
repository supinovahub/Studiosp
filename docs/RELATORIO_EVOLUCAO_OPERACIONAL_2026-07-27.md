# Relatório de evolução operacional — 27/07/2026

## Ambiente

- Branch: `codex/v1-platform`, sincronizada com a `main`.
- Banco alterado: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`).
- Produção: não alterada.

## Implementado

1. Whitelist `AI_AUTOREPLY_ALLOWED_NUMBERS` para respostas automáticas da IA.
2. Reativação com abordagem especializada apenas em D0.
3. Cadência configurável de um a quatro contatos, entre D0 e D90.
4. Cancelamento da cadência na resposta e continuidade pela IA-SDR normal.
5. Ação `Call finalizada` com resultado, resumo, pipeline e fechamento do chat.

## Banco

- Migration `20260727103000_complete_broker_call.sql`.
- Aplicada somente em staging.
- Função `SECURITY INVOKER`, `search_path` fixo e sem execução por `anon`.

## Verificações

- 20 testes direcionados aprovados.
- TypeScript sem erros.
- Função e permissões confirmadas no staging.
- Nenhum alerta novo nos advisors.

## Avisos preexistentes

- `pg_net` no schema público.
- Funções `SECURITY DEFINER` antigas expostas.
- Proteção de senhas vazadas desativada.

## Pendente

- Configurar a whitelist no Preview.
- Homologar permitido versus bloqueado, cadência curta e resposta.
- Homologar com corretor: aceite, chat, call finalizada, pipeline e chat fechado.
- Receber exemplo real para melhorar a importação de empreendimentos.

## Correções após homologação

- A whitelist passou de variável técnica para campo visível em
  **Configurações → IA**, persistido por conta.
- O staging foi inicializado com os dois números controlados já aprovados.
- Removida a auditoria duplicada que causava `permission denied for table
  audit_events` e revertia a conclusão da call.
- Criada uma oferta de reunião somente no dashboard para o corretor Arthur
  Alves Rocha aceitar manualmente, sem disparo de WhatsApp.
