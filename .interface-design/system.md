# Sistema de interface — Studiosp

## Direção

Painel operacional escuro, compacto e calmo para uma operação de venda de studios. O dono precisa identificar gargalos e decidir; o corretor precisa saber o que fazer agora no celular. A interface privilegia clareza, consequência e rastreabilidade, não ornamentação.

Domínio: leads, qualificação, cobertura de agenda, reservas, corretores, empreendimentos, condições comerciais, fatos de venda e auditoria.

Paleta do domínio: noite grafite, concreto frio, violeta de ação, âmbar de atenção, verde de confirmação e vermelho de bloqueio. Cores semânticas sempre combinam ícone e texto.

Assinatura: `LeadStatusBar`, uma faixa que reúne etapa principal, atenção, reunião e estado comercial. Ela aparece no detalhe do lead, na caixa de entrada e em ações críticas.

Padrões rejeitados:

- grade genérica de cards iguais; usar atenção e conversão com hierarquia desigual;
- Kanban arrastável; usar ações de fatos humanos e consequência explícita;
- contatos como cadastro passivo; usar lead com responsável, prazo e próxima ação;
- gradientes decorativos e glassmorphism; usar superfícies sólidas e bordas discretas.

## Profundidade e superfícies

- Estratégia: superfícies sólidas com bordas discretas, sem sombras decorativas.
- Canvas: `bg-background`.
- Superfície principal: `bg-card`.
- Superfície secundária, hover e agrupamento: `bg-card-2` ou `bg-muted`.
- Popover e diálogo: `bg-popover`, um nível acima da origem.
- Input: superfície levemente rebaixada com `bg-background` e `border-input`.

## Hierarquia

- Um foco por tela: Central de atenção, próxima ação, calendário, lista de empreendimentos ou configuração em edição.
- Título de página: 24–30px, semibold, tracking sutilmente negativo.
- Seção: 16–20px, semibold.
- Conteúdo operacional: 14px.
- Metadado: 12–13px, `text-muted-foreground`.
- Números: tabulares.
- Valores e ações ganham peso e contraste; rótulos ficam menores e discretos.

## Densidade e espaçamento

- Unidade base: 4px.
- Micro: 4px.
- Interno: 8px.
- Grupo: 12px.
- Conteúdo: 16px.
- Seção: 24px.
- Bloco maior: 32px.
- Sidebar desktop: 240px.
- Área de toque: mínimo 44px em fluxos móveis.

## Raios e movimento

- Controle: `rounded-md`.
- Card: `rounded-lg`.
- Dialog/sheet: `rounded-xl` quando aplicável.
- Feedback local entre 100 e 200ms; apenas `opacity` e `transform`.
- Respeitar `prefers-reduced-motion`.

## Componentes persistentes

- `PageHeader`: título, descrição e ações contextuais.
- `AttentionCard`: gravidade, prazo, motivo e ação.
- `LeadStatusBar`: quatro dimensões do estado do lead.
- `HumanEventAction`: fato humano, consequência e confirmação.
- `QualificationProgress`: obrigatórias, desejáveis e confiança.
- `PropertyMatchCard`: aderência e condições somente para usuário autorizado.
- `OperationalEmptyState`: estado vazio com explicação e próximo passo.
- `FilterBar`: filtros em URL quando compartilháveis.

## Resiliência

- Toda lista tem carregamento, erro, vazio e repetição.
- Texto longo usa `min-w-0`, quebra ou truncamento com título acessível.
- Tabelas operacionais viram listas no mobile.
- Formulários preservam valores em erro e exibem validação junto ao campo.
- Dono e corretor veem apenas rotas e ações compatíveis com o papel.
- Toda string visível, aria-label, toast e erro fica em português do Brasil.
