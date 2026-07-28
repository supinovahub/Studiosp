# Preparação do redesign integral da UI

Data: 28 de julho de 2026  
Branch: `redesign/full-ui-refresh`  
Ambiente alterado: somente repositório; staging e produção permaneceram
inalterados.

## Objetivo

Preparar uma base de trabalho versionada para repaginar todas as telas do
Studiosp sem alterar os contratos funcionais da operação existente.

## Entregas

- criação da skill `.agents/skills/studiosp-ui-redesign`;
- guardrails explícitos para API, dados, permissões, IA, WhatsApp, realtime,
  agenda, pipeline e idempotência;
- fluxo de substituição visual progressiva;
- critérios mínimos de aceite por rota e perfil;
- mapa das superfícies de maior risco;
- direção de design adequada a um CRM operacional;
- regras de motion, acessibilidade e gestos;
- referências externas fixadas por commit.

## Referências auditadas

- `redesign-existing-projects`:
  `e988add20dab0fa97d7a76781c48961c8184288e`;
- `apple-design`:
  `70744e3816f1d93eafb697161a8b880a7384c5ff`.

As referências foram resumidas e adaptadas. Nenhuma dependência de runtime,
biblioteca visual ou script externo foi adicionada ao Studiosp.

## Validação

- estrutura criada pelo gerador oficial de skills;
- frontmatter e nome validados pelo `quick_validate.py`;
- arquivos externos limitados a referências textuais;
- nenhum arquivo de aplicação, API, banco ou infraestrutura alterado;
- nenhum deploy realizado.

## Inventário visual

O inventário foi concluído em
`docs/INVENTARIO_VISUAL_STUDIOSP_2026-07-28.md`. Ele registra rotas, perfis,
problemas por superfície, riscos funcionais, direção visual e uma sequência
segura de implementação.

## Próximo passo recomendado

Aprovar a direção visual e as quatro decisões pendentes do inventário. Depois,
executar a Fase 0, congelando os cenários E2E e a matriz de estados antes de
editar tokens ou componentes.

## Rollback

Remover `.agents/skills/studiosp-ui-redesign`, este relatório e a seção de
redesign no Plano Mestre. Não existe rollback de banco ou infraestrutura.
