# Handoff — WhatsApp e UAZAPI

## Objetivo

Garantir conexão da instância, recebimento e envio bidirecional, histórico coerente e execução segura das automações.

## Estado conhecido

- Configuração e conexão UAZAPI existem no dashboard.
- Webhook recebe mensagens e alimenta inbox/jobs.
- Envios da IA, reativação e notificações usam a conexão configurada.
- Importação de histórico foi incorporada em release anterior.

## Referências

- [Importação de histórico](../../IMPORTACAO_HISTORICO_WHATSAPP.md)
- [Release reativação + inbox](../../RELATORIO_RELEASE_REATIVACAO_BROKER_INBOX_2026-07-27.md)
- [Reativação, inbox e nomes](../../RELATORIO_CORRECAO_REATIVACAO_INBOX_NOMES_2026-07-27.md)

## Pontos de atenção

- Troca de número/instância não deve misturar conversas da conexão anterior.
- Mensagens enviadas fora do dashboard pelo número conectado precisam chegar ao inbox quando o provedor emitir o evento correspondente.
- QR code deve ser verificado sem desconectar uma instância ativa.
- Deduplicar webhook e envio por IDs do provedor.
- Não registrar tokens ou credenciais em documentação.

