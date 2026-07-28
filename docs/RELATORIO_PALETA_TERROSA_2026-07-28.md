# Relatório — Paleta terrosa do redesign

Data: 28/07/2026  
Branch: `redesign/full-ui-refresh`

## Objetivo

Remover a identidade violeta da reforma visual e adotar preto, neutros quentes
e tons terrosos, sem alterar contratos ou comportamentos funcionais.

## Alterações

- ações principais pretas no modo claro;
- superfícies carvão e ações em marfim no modo escuro;
- fundos e cartões aquecidos com areia e creme;
- bordas e estados suaves em argila;
- gráficos e destaques em tabaco, cobre e âmbar;
- tema padrão apresentado como `Ébano`;
- ícone da aplicação atualizado para preto quente;
- cores violeta explícitas removidas das superfícies ativas relacionadas.

O identificador técnico legado `violet` foi preservado internamente para manter
compatibilidade com preferências já gravadas no navegador. Ele agora renderiza
a paleta Ébano e não a cor violeta.

## Guardrails

- nenhuma API, ação, callback ou hook operacional foi alterado;
- nenhuma migration ou alteração de banco foi criada;
- nenhuma permissão, integração, regra de IA ou WhatsApp foi modificada;
- produção permanece inalterada.

## Validação

- TypeScript sem erros;
- ESLint sem erros; avisos preexistentes permanecem;
- testes e build devem continuar sendo executados antes da promoção.

## Rollback

Reverter o commit desta fase restaura integralmente a paleta anterior, pois a
mudança está concentrada nos tokens globais e em cores estáticas de gráficos.
