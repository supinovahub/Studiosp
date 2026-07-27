# Relatório — correção de Inbox e nomes da reativação

Data: 27/07/2026

## Problemas observados

1. A mensagem enviada para Mariana foi aceita pela UAZAPI e persistida, mas a
   conversa não apareceu no Inbox.
2. O CSV continha `Joao Brito`, porém o Inbox apresentou o telefone como nome.

## Evidências

- O CSV `Leads - 100s.csv` contém `Joao Brito` na linha do telefone
  `+5527992854994`.
- O lead de reativação preservou `Joao Brito`, mas o contato reutilizado tinha
  `5527992854994` como nome.
- A conversa de Mariana e a mensagem enviada possuíam
  `whatsapp_connection_key = null`.
- O Inbox consulta somente conversas e mensagens ligadas à chave da conexão
  ativa, portanto esses registros eram ocultados.

## Causa

- A ativação reutilizava contatos existentes sem corrigir nomes-placeholder.
- Conversas criadas ou reutilizadas pela reativação não recebiam a identidade
  da conexão ativa.
- O envio pelo motor de fluxos persistia a mensagem sem
  `whatsapp_connection_key`.

## Correção

- A ativação agora calcula a chave da conexão a partir da configuração atual.
- Conversas novas recebem essa chave; conversas reutilizadas são atualizadas
  antes do envio.
- Mensagens de texto enviadas pelo motor são persistidas com `account_id` e
  `whatsapp_connection_key`.
- Um nome importado substitui apenas nome vazio ou nome igual ao próprio
  telefone.
- Nomes humanos e e-mails já existentes continuam preservados.
- E-mail importado preenche somente contato que ainda não possui e-mail.

## Validação automatizada

- Nome numérico é substituído por `Joao Brito`.
- Nome humano existente não é sobrescrito.
- Nome vazio é preenchido.
- Chave UAZAPI usa a instância atual e possui fallback estável.
- Parsing do CSV e demais testes da reativação continuam cobertos.

## Ambiente e rollout

- Implementação inicial: branch `codex/v1-platform`.
- Banco de homologação: Supabase staging.
- Nenhuma migração de schema é necessária.
- Registros históricos de produção ainda exigem reparo controlado depois da
  promoção do código.
