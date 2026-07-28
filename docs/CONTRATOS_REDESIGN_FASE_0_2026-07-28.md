# Contratos congelados — redesign Fase 0

Data: 28 de julho de 2026  
Branch: `redesign/full-ui-refresh`

## Escopo congelado

A primeira entrega visual altera somente fundações compartilhadas:

- tokens semânticos;
- tipografia, foco, seleção e redução de movimento;
- canvas do dashboard;
- shell, cabeçalho e navegação;
- cabeçalho interno das páginas;
- estados de carregamento, vazio e erro;
- cartões, botões e faixa de métricas.

## Contratos preservados

- nenhuma rota, parâmetro ou deep link foi alterado;
- os redirecionamentos de owner e corretor permanecem no
  `DashboardShell`;
- `useStudiospData`, `runStudiospAction` e todos os payloads permanecem
  inalterados;
- autenticação, onboarding do corretor, presença e heartbeat de reativação
  permanecem inalterados;
- não houve mudança em API, Supabase, RLS, IA, UAZAPI, WhatsApp, agenda,
  pipeline ou idempotência;
- os labels da navegação e as permissões por role permanecem iguais;
- o tema continua usando `data-theme` e `data-mode`;
- os componentes mantêm nomes, props e callbacks existentes.

## Estados cobertos

- loading autenticado;
- erro de ativação do corretor;
- loading, vazio e erro das rotas operacionais;
- navegação desktop e drawer móvel;
- tema claro e escuro;
- foco de teclado e link para pular navegação;
- redução de movimento.

## Decisões visuais

- direção aprovada: central operacional calma e precisa;
- densidade padrão: compacta nas listas e confortável em configuração;
- Pipeline móvel será tratado em fase própria com seleção explícita de etapa;
- Inteligência e Configurações permanecerão rotas distintas, apresentadas por
  um hub visual coerente, sem mover contratos.

## Rollback

Reverter os commits da Fase 1 restaura integralmente a apresentação anterior.
Não existe rollback de dados ou infraestrutura porque esta fase não altera
ambientes remotos nem schema.
