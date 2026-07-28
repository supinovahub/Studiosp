---
name: studiosp-ui-redesign
description: Redesenhar, auditar ou padronizar qualquer tela, rota, fluxo, componente, estado visual, responsividade ou design system do CRM Studiosp sem alterar contratos funcionais. Use para trabalhos de UI/UX, navegação, acessibilidade, tipografia, temas, motion, mobile, loading, vazio e erro no repositório Studiosp.
---

# Studiosp UI Redesign

Redesenhar o Studiosp por substituição progressiva da camada visual. Preservar
o comportamento operacional já validado e tratar a aparência como uma camada
independente dos contratos de produto.

## Carregar o contexto

1. Aplicar também a skill `studiosp-project`.
2. Ler integralmente `docs/PLANO_MESTRE_STUDIOSP.md`.
3. Ler `docs/ESPECIFICACAO_V1_STUDIOSP.md` para a jornada afetada.
4. Ler `docs/STAGING_WORKFLOW.md` antes de editar ou publicar.
5. Ler o guia relevante em `node_modules/next/dist/docs/` antes de alterar
   código Next.js.
6. Consultar [route-contracts.md](references/route-contracts.md) para localizar
   superfícies críticas e contratos congelados.
7. Consultar [design-principles.md](references/design-principles.md) para
   direção visual, interação e acessibilidade.

## Classificar o pedido

- **Auditoria:** inspecionar e propor sem editar.
- **Fundação:** tokens, tipografia, primitives ou shell compartilhado.
- **Redesign de rota:** substituir apenas a apresentação de uma jornada.
- **Motion:** aplicar feedback ou transição a uma interação já definida.
- **Mudança funcional disfarçada:** parar e separar em outra fase quando o
  pedido alterar dados, permissões, etapas, ações, API ou regra operacional.

## Congelar contratos antes de editar

Registrar antes da mudança:

- rota, parâmetros e deep links;
- perfis autorizados e redirecionamentos;
- endpoints, métodos, payloads e nomes de ações;
- hooks, assinaturas de props e callbacks;
- estados de loading, vazio, erro, retry e sucesso;
- estados operacionais exibidos e ações possíveis;
- realtime, idempotência, timers e integrações;
- comportamento atual em desktop e celular.

Não alterar durante uma fase visual:

- schema, migrations, RLS ou dados;
- APIs e contratos de resposta;
- regras de owner/corretor;
- estados ou movimentação do pipeline;
- agenda, concorrência, distribuição ou contingência;
- processamento da IA, WhatsApp ou UAZAPI;
- identificadores usados por testes, auditoria ou idempotência.

Se uma melhoria visual exigir qualquer item acima, documentar a dependência e
pedir uma fase funcional separada.

## Executar por substituição progressiva

1. Auditar a rota e listar tarefas reais do usuário.
2. Capturar evidência do estado atual em desktop e celular.
3. Definir hierarquia, densidade e estados antes de estilizar.
4. Reusar os contratos existentes e preferir primitives compartilhadas.
5. Alterar uma superfície coerente por vez.
6. Manter o caminho antigo recuperável até a nova superfície ser validada.
7. Validar owner e corretor quando a rota for compartilhada.
8. Executar testes direcionados, lint, typecheck e build.
9. Fazer verificação visual e funcional em preview.
10. Registrar resultado, diferenças, pendências e rollback em Markdown.

Não promover uma alteração somente porque o build passou. Exigir evidência de
que as ações principais e os estados de exceção continuam funcionando.

## Direção de design

Priorizar calma, clareza, velocidade e confiança. O Studiosp é uma ferramenta
operacional densa, não um site de marketing.

- Manter navegação previsível e tarefas frequentes visíveis.
- Usar densidade adaptativa: compacta em operação, mais espaçada em
  configuração e onboarding.
- Construir hierarquia com tipografia, proximidade e contraste antes de criar
  novos contêineres.
- Usar números tabulares em métricas, valores, datas e horários.
- Manter labels específicos, textos em pt-BR e acentuação correta.
- Garantir alvos de toque, foco visível, teclado, contraste e zoom de texto.
- Oferecer botão visível para toda ação acessível por gesto.
- Evitar imagens decorativas, ruído, parallax, broken grids ou efeitos que
  reduzam legibilidade.
- Preservar sidebar quando ela sustentar orientação e velocidade; não remover
  padrões familiares apenas para parecer diferente.

## Aplicar movimento com propósito

Usar princípios de movimento somente para explicar relação espacial, feedback
ou mudança de estado.

- Dar feedback visual no pressionamento, mas executar a ação no `click` ou na
  confirmação final.
- Fazer entrada e saída pelo mesmo caminho.
- Permitir interrupção em drawers, sheets e interações arrastáveis.
- Animar apenas `transform` e `opacity` no caminho crítico.
- Respeitar `prefers-reduced-motion`, contraste e transparência reduzida.
- Não instalar biblioteca de motion sem uma interação que CSS não resolva.
- Não animar tabelas, métricas ou listas apenas como decoração.

## Critérios mínimos de aceite

- Nenhuma mudança de contrato funcional no diff.
- Ações principais e destrutivas continuam protegidas.
- Loading, vazio, erro, retry, sucesso e estado desabilitado estão cobertos.
- Layout funciona nos breakpoints relevantes sem overflow horizontal.
- Teclado, foco, contraste e redução de movimento foram verificados.
- Owner e corretor veem somente o que suas permissões permitem.
- Testes existentes continuam aprovados.
- Existe relatório da fase e plano de rollback.

## Ordem recomendada

1. Inventário e direção visual.
2. Tokens e primitives.
3. Shell e navegação.
4. Central de atenção, Meu dia, Leads e detalhe.
5. Inbox.
6. Agenda, follow-ups, pipeline e reativação.
7. Empreendimentos, equipe, inteligência, relatórios e configurações.
8. Autenticação, convite, onboarding e estados periféricos.
9. Homologação completa e promoção gradual.

