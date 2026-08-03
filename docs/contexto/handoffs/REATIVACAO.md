# Handoff — reativação de base

## Objetivo

Importar bases antigas, segmentar campanhas, enviar uma abordagem contextual variável e encaminhar respostas para o fluxo normal da IA SDR.

## Estado implementado

- Importação e preview de planilhas.
- Vínculo com contatos existentes.
- Campanhas em rascunho, ativação, edição, exclusão segura, arquivamento e logs.
- Cadência configurável.
- Primeira abordagem de reativação com variações.
- Intervalo randômico de 30 a 50 segundos entre envios.
- Métricas de enviados, erros e respostas.

## Referências

- [Reativação staging](../../RELATORIO_REATIVACAO_BASE_STAGING_2026-07-24.md)
- [Compatibilidade Leads 100](../../RELATORIO_COMPATIBILIDADE_REATIVACAO_LEADS_100_2026-07-27.md)
- [Arquivamento e logs](../../RELATORIO_ARQUIVAMENTO_LOGS_REATIVACAO_2026-07-27.md)
- [Blocos semânticos](../../RELATORIO_BLOCOS_SEMANTICOS_REATIVACAO_2026-07-27.md)

## Pontos de atenção

- Campanha não deve depender dos interruptores gerais de resposta automática.
- Envio deve aparecer no inbox e preservar o nome importado.
- Evitar concorrência entre campanhas ativas para o mesmo contato.
- Resposta do lead deve cancelar toques futuros e iniciar uma única sessão SDR.
- Usar somente números autorizados em testes reais.

