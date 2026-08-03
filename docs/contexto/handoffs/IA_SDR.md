# Handoff — IA SDR

## Objetivo

Qualificar leads de forma natural, persistente e segura; responder dúvidas imobiliárias; identificar oportunidades; conduzir disponibilidade e agendamento sem inventar fatos.

## Estado implementado

- Qualificação configurável e persistida por pergunta.
- Evidência vinculada à mensagem de origem.
- Consolidação de mensagens rápidas por turno.
- Normalização determinística de valores, tipologia e prazos naturais.
- Controle de domínio e prompt injection com Central de Atenção.
- Fila durável, retries, fingerprints e outbox de resposta.
- Matching e preparação de resumo/call brief.

## Última referência

- Commit `b04b65f`.
- 915 testes aprovados na última validação registrada.
- Relatórios: [multimensagem](../../RELATORIO_CORRECAO_QUALIFICACAO_MULTIMENSAGEM_2026-07-31.md), [prazo e recuperação](../../RELATORIO_CORRECAO_PRAZO_E_RECUPERACAO_IA_2026-07-31.md), [fronteira de domínio](../../RELATORIO_FRONTEIRA_DOMINIO_IA_2026-07-30.md).

## Pontos de atenção

- Não deixar o modelo escolher sozinho próxima pergunta, slot ou estado operacional.
- Persistir todos os fatos do turno antes de selecionar a próxima pergunta.
- Resposta duplicada não pode pausar indefinidamente uma conversa legítima.
- Resumos não podem alterar objetivo, prazo ou intenção comercial.
- Medir latência separando fila, extração, redação e envio.

## Próximo teste

Executar o roteiro de IA SDR em conversa limpa e registrar a primeira divergência com mensagem, run, job e resposta persistida.

