# Handoff — empreendimentos

## Objetivo

Manter catálogo factual para operação, matching, corretor e contexto controlado da IA.

## Escopo esperado

- Empreendimento, incorporadora, bairro e endereço.
- Situação e previsão de entrega.
- Unidades/condições com tipologia, metragem, vagas, preços, preço por m² e margem.
- Imagens e arquivos.
- Rascunho/publicação.
- Submissão pelo corretor com aprovação do dono.
- Análise documental com preview antes da gravação.

## Referências

- [Correção do agente documental](../../RELATORIO_CORRECAO_AGENTE_DOCUMENTAL_PRODUCAO_2026-07-24.md)
- [Modelo de dados](../../MODELO_DADOS_V1_STUDIOSP.md)
- [Plano Mestre](../../PLANO_MESTRE_STUDIOSP.md)

## Pontos de atenção

- Confirmar CRUD após recarregar, não apenas estado otimista da interface.
- Publicado e rascunho precisam ter visibilidade coerente por role.
- Upload múltiplo deve explicar sucesso parcial ou oferecer reversão.
- Extração documental precisa tolerar layouts heterogêneos e preservar evidência de página/fonte.
- Nunca publicar automaticamente o resultado da IA.

