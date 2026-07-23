# Studiosp Design System

## Produto

Studiosp é uma plataforma operacional para venda de studios. O CRM é um módulo dentro de uma experiência maior que reúne aquisição, atendimento por IA, qualificação, agenda, corretores, empreendimentos, pipeline e métricas.

Usuários principais:
- Dono: visão global, configuração, auditoria e decisões.
- Corretor: agenda, tarefas, leads atribuídos e atualização dos fatos comerciais.

Objetivos de UX:
- deixar pendências e riscos imediatamente visíveis;
- reduzir digitação e decisões ambíguas;
- mostrar o próximo passo de cada lead;
- preservar contexto entre IA e humano;
- funcionar muito bem no desktop do dono e no celular do corretor.

## Direção visual

Manter a identidade atual:
- aplicação escura como padrão;
- acento violeta;
- Inter como fonte;
- superfícies sóbrias, bordas discretas e hierarquia por contraste;
- densidade operacional compacta;
- evitar gradientes decorativos, glassmorphism excessivo e cards sem função;
- modo claro e acentos alternativos podem continuar disponíveis, mas não orientam os primeiros desenhos.

## Tokens

Fonte: Inter em todos os níveis.

Cores padrão escuras:
- background: `oklch(0.13 0.01 260)`
- foreground: `oklch(0.985 0 0)`
- card: `oklch(0.18 0.01 260)`
- card-2: `oklch(0.205 0.01 260)`
- border: `oklch(0.28 0.01 260)`
- muted foreground: `oklch(0.65 0.01 260)`
- primary violet: `oklch(0.526 0.247 293)`
- primary hover: `oklch(0.6 0.22 293)`
- destructive: `oklch(0.577 0.245 27.325)`

Raio base: `0.625rem`.

Escala de espaçamento preferida:
- 4px para microajustes;
- 8px para elementos internos compactos;
- 12px para grupos;
- 16px para conteúdo padrão;
- 24px para separação de seções;
- 32px para blocos principais.

## Tipografia

- Título de página: 24–30px, semibold.
- Título de seção: 16–20px, semibold.
- Título de card: 14–16px, medium/semibold.
- Corpo: 14px.
- Metadado e ajuda: 12–13px.
- Valores operacionais: tabular quando numéricos.
- Evitar caixa alta em frases; usar apenas em marcadores curtos quando necessário.

## Estrutura global

Desktop:
- sidebar persistente;
- conteúdo principal com largura fluida;
- cabeçalho contextual por página;
- filtros e ações próximos do título;
- central de atenção acessível globalmente.

Mobile:
- navegação compacta;
- tarefas críticas primeiro;
- ações primárias fixas quando necessário;
- tabelas convertidas em listas ou cards;
- nenhuma dependência exclusiva de hover;
- áreas de toque mínimas de 44px.

## Navegação pretendida

- Visão geral
- Operação
  - Caixa de entrada
  - Leads
  - Pipeline
  - Agenda
  - Follow-ups
- Comercial
  - Empreendimentos
  - Equipe
- Inteligência
  - Comportamento da IA
  - Perguntas
  - Base de conhecimento
  - Simulador
- Relatórios
- Configurações

Notificações não serão uma área isolada principal; convergem para a Central de atenção.

## Padrões de interação

### Próxima ação

Todo lead deve exibir:
- etapa principal;
- estado de atenção;
- responsável;
- próxima ação;
- prazo;
- risco ou bloqueio.

### Fatos humanos

Não usar arraste livre como mecanismo principal do funil. Ações estruturadas registram fatos, validam regras e atualizam etapas. Exibir a consequência antes da confirmação.

### IA e humano

Identificar claramente:
- IA ativa;
- aguardando lead;
- aguardando humano;
- intervenção manual;
- erro de integração.

Nunca esconder do usuário quem executou uma ação.

### Configurações

Configurações complexas usam:
- modo rascunho;
- validação;
- pré-visualização;
- publicação;
- histórico de versões;
- restauração.

### Uploads

Uploads em lote mostram:
- total de arquivos;
- progresso por arquivo;
- sucessos, repetidos e falhas;
- categoria sugerida;
- revisão antes de publicar;
- possibilidade de retomar.

## Componentes semânticos

- `AttentionCard`: pendência com prazo, gravidade e ação.
- `LeadStatusBar`: etapa, atenção, reunião e estado comercial.
- `HumanEventAction`: registro estruturado de fato.
- `AiStateBadge`: estado e confiança da IA.
- `BrokerAssignmentCard`: aceite, rejeição, transferência e SLA.
- `GuaranteedSlot`: capacidade e cobertura de horário.
- `QualificationProgress`: respostas obrigatórias, desejáveis e confiança.
- `PropertyMatchCard`: aderência, metragens e condições de referência.
- `MediaLibrary`: upload, categorias, ordem e visibilidade.
- `AuditTimeline`: histórico de atores e mudanças.

## Estados e feedback

Toda ação assíncrona deve ter:
- estado inicial;
- carregamento;
- sucesso;
- erro acionável;
- repetição segura;
- estado vazio com orientação.

Não usar apenas cor para comunicar status. Combinar texto, ícone e cor.

## Acessibilidade

- contraste compatível com WCAG AA;
- foco visível;
- ordem de teclado coerente;
- rótulo em todos os controles;
- mensagens de erro ligadas aos campos;
- suporte a redução de movimento;
- ícones de ação com nome acessível;
- dados tabulares com cabeçalhos semânticos.

## Movimento

- transições entre 100 e 200ms para feedback local;
- animações apenas para orientar mudança de estado;
- evitar movimento em gráficos e listas quando não agrega compreensão;
- respeitar `prefers-reduced-motion`;
- uploads e tarefas usam progresso determinístico quando conhecido.

## Regras para drafts

- Usar somente Inter, tokens existentes e acento violeta.
- Manter sidebar e shell atuais como ponto de partida.
- Priorizar clareza operacional sobre ornamentação.
- Não inventar dados genéricos em inglês.
- Usar conteúdo realista em português do Brasil.
- Reproduzir a interface atual antes de criar qualquer variação.
