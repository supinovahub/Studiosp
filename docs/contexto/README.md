# Contexto operacional do Studiosp

Este diretório é o ponto de entrada para retomar o projeto em uma nova sessão, chat, IDE ou agente. Ele não substitui o código, o banco, o Git nem o Plano Mestre; organiza a leitura dessas fontes.

## Ordem obrigatória de leitura

1. [Estado atual](ESTADO_ATUAL.md)
2. [Plano Mestre](../PLANO_MESTRE_STUDIOSP.md)
3. [Decisões confirmadas](DECISOES_CONFIRMADAS.md)
4. [Ambientes e publicação](AMBIENTES_E_DEPLOYS.md)
5. Handoff do domínio que será alterado
6. Relatórios técnicos citados no handoff

Para alterações de banco, leia também o [modelo de dados](../MODELO_DADOS_V1_STUDIOSP.md) e o [workflow de staging](../STAGING_WORKFLOW.md). Para jornadas e critérios da V1, use a [especificação](../ESPECIFICACAO_V1_STUDIOSP.md) e a [homologação](../HOMOLOGACAO_V1_STUDIOSP.md).

## Fonte de verdade

Em caso de divergência, use esta prioridade:

1. Código e migrations presentes na branch em trabalho.
2. Estado efetivo do ambiente explicitamente colocado em escopo.
3. Plano Mestre e especificações versionadas.
4. Relatórios técnicos com commit ou evidência identificável.
5. Estes documentos de contexto.
6. Resumos de chat e memória conversacional.

Nunca trate uma proposta antiga, uma tentativa revertida ou um teste parcial como funcionalidade homologada.

## Handoffs por domínio

- [IA SDR](handoffs/IA_SDR.md)
- [Reativação de base](handoffs/REATIVACAO.md)
- [Agenda e corretores](handoffs/AGENDA_E_CORRETORES.md)
- [Empreendimentos](handoffs/EMPREENDIMENTOS.md)
- [WhatsApp e UAZAPI](handoffs/WHATSAPP_UAZAPI.md)
- [UI e UX](handoffs/UI_UX.md)

## Regras de segurança

- Staging é o ambiente padrão para novas alterações.
- Produção exige autorização explícita e contemporânea.
- Não registrar senhas, tokens, chaves ou conteúdo pessoal de leads neste diretório.
- Não usar automação do Chrome para homologar o Studiosp; a interface é validada manualmente pelo usuário.
- Preservar auditoria, idempotência, RLS e histórico técnico imutável.
- Cada fase concluída deve gerar relatório `.md` e registrar o que ficou pendente de homologação.

