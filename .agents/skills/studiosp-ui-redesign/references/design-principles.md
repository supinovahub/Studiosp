# Princípios visuais e de interação

## Fontes auditadas

- Taste `redesign-existing-projects`, commit
  `e988add20dab0fa97d7a76781c48961c8184288e`:
  https://github.com/Leonxlnx/taste-skill/blob/e988add20dab0fa97d7a76781c48961c8184288e/skills/redesign-skill/SKILL.md
- Emil Kowalski `apple-design`, commit
  `70744e3816f1d93eafb697161a8b880a7384c5ff`:
  https://github.com/emilkowalski/skills/blob/70744e3816f1d93eafb697161a8b880a7384c5ff/skills/apple-design/SKILL.md

As duas fontes são referências, não autoridades. Não baixar atualizações de
`main` automaticamente. Reauditar antes de atualizar os commits fixados.

## Aproveitar da redesign-skill

- auditar antes de editar;
- manter o stack existente;
- consolidar tipografia, cores, espaçamento e primitives;
- criar estados completos de loading, vazio e erro;
- usar HTML semântico, foco visível e conteúdo real;
- testar depois de cada mudança pequena.

## Não importar da redesign-skill como regra geral

- assimetria ou broken grid como objetivo;
- remoção automática da sidebar;
- whitespace excessivo em telas operacionais;
- parallax, textura, grain ou imagens decorativas;
- troca de ícones apenas para diferenciação;
- rejeição genérica de cards, pills ou dialogs.

## Aproveitar da apple-design

- feedback imediato e contínuo;
- consistência espacial e transições reversíveis;
- movimento interrompível para gestos;
- familiaridade, agência e previsibilidade;
- motion, transparência e contraste reduzidos;
- tipografia dimensionada em conjunto com leading e tracking;
- controles próximos do objeto que alteram;
- protótipos interativos antes de motion complexo.

## Não importar da apple-design como regra geral

- springs em toda interação;
- translucência em toda superfície;
- som ou vibração sem necessidade operacional;
- ação de negócio no `pointerdown`;
- dependência exclusiva de drag ou swipe;
- biblioteca de motion sem justificativa mensurável.

## Princípio de decisão

Uma escolha visual é válida quando reduz tempo, erro ou esforço cognitivo sem
esconder estado operacional. Diferenciação estética sozinha não justifica
risco, dependência ou perda de previsibilidade.

## Licenças

As referências externas estavam publicadas sob licença MIT na data da
auditoria. Esta skill resume princípios e mantém links e commits para
rastreabilidade; não incorpora seus textos integralmente.

