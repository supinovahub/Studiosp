# Inventário visual do Studiosp

Data: 28 de julho de 2026  
Branch: `redesign/full-ui-refresh`  
Escopo: interface atual, rotas, perfis, responsividade e direção do redesign.  
Ambientes alterados: nenhum. Produção foi usada apenas como referência visual.

## Objetivo

Registrar a realidade atual do CRM antes da repaginação integral, identificar
os contratos que a nova interface deve preservar e definir uma ordem segura de
execução. Este documento não autoriza mudanças em APIs, banco, autenticação,
WhatsApp, IA, agenda, pipeline ou regras de permissão.

## Método

O inventário combinou:

- leitura do Plano Mestre, especificação V1 e contratos de rota;
- inspeção do roteamento, componentes, hooks e testes existentes;
- navegação autenticada nas rotas do owner em desktop e em viewport móvel;
- comparação com os fluxos já homologados para o perfil de corretor;
- classificação de cada superfície por valor operacional e risco de regressão.

## Retrato técnico

- 37 páginas no App Router;
- 77 rotas de API;
- 122 componentes de aplicação;
- 24 primitivas de interface;
- 99 arquivos de teste;
- Next.js 16.2, React 19, Tailwind 4, Shadcn, Lucide e Recharts;
- camada visual concentrada em `src/components/studiosp`;
- dados e ações operacionais centralizados em `useStudiospData` e
  `runStudiospAction`.

Os wrappers de rota são finos, o que favorece a substituição incremental da
apresentação. Em contrapartida, algumas telas concentram quase toda a jornada
em um único arquivo:

| Superfície | Tamanho aproximado |
| --- | ---: |
| Análise documental | 998 linhas |
| Detalhe do lead | 922 linhas |
| Reativação de base | 872 linhas |
| Importação de histórico | 835 linhas |
| Empreendimentos | 789 linhas |
| Inteligência | 773 linhas |
| Equipe | 570 linhas |
| Relatórios | 347 linhas |
| Visão geral | 289 linhas |

Esses números não exigem reescrita funcional, mas indicam onde a decomposição
visual precisará ser particularmente disciplinada.

## Perfis e navegação

### Owner

Navegação ativa da V1:

- Visão geral;
- Central de atenção;
- Inbox;
- Leads;
- Pipeline;
- Agenda;
- Follow-ups;
- Reativação de base;
- Empreendimentos;
- Equipe;
- Inteligência;
- Relatórios;
- Configurações.

O menu é completo, porém mistura comando, operação, comercial e configuração
em uma lista longa. A hierarquia existe, mas o volume reduz a velocidade de
orientação.

### Corretor

Navegação operacional:

- Meu dia;
- Central de atenção;
- Inbox;
- Meus leads;
- Agenda;
- Empreendimentos;
- Disponibilidade/equipe, conforme permissão.

O corretor precisa de uma experiência mais curta e orientada à próxima ação.
O redesign deve continuar ocultando administração e preservar o bloqueio de
leads após a conclusão da call. Nenhum recurso exclusivo do owner pode ser
reintroduzido por composição visual ou link direto.

### Rotas legadas

Automações genéricas, broadcasts, flows, contacts, pipelines, agents,
notifications e settings ainda aparecem no código por compatibilidade ou
migração. Elas não devem retornar à navegação da V1 apenas porque o redesign
encontrou componentes reutilizáveis nelas.

## Diagnóstico global

### Prioridade alta

1. **Estados de carregamento frágeis.** Visão geral, Central de atenção e
   Pipeline podem permanecer vários segundos em estados genéricos. Não há
   indicação de progresso, timeout, explicação ou recuperação proporcional ao
   impacto operacional.
2. **Responsividade por compressão.** Em várias rotas o layout desktop apenas
   encolhe. O Pipeline mantém colunas lado a lado e exige rolagem horizontal
   pouco evidente; formulários longos ficam excessivamente verticais.
3. **Hierarquia visual uniforme demais.** Cabeçalhos, cartões, filtros,
   explicações e áreas de ação competem com pesos semelhantes. O usuário lê
   muito antes de identificar o próximo passo.
4. **Jornadas críticas monolíticas.** Empreendimentos, Inteligência,
   Reativação e Equipe expõem muitas decisões na mesma superfície. Isso eleva
   carga cognitiva e torna estados parciais difíceis de explicar.
5. **Inconsistências de idioma e codificação.** Foram observados estados crus
   como `cancelled`, além do histórico de textos com acentuação quebrada. A
   nova camada deve usar um catálogo central de rótulos em português.

### Prioridade média

1. O padrão repetido de cartões brancos com borda oferece pouca separação
   semântica entre informação, decisão, alerta e ação.
2. A densidade é fixa. Listas operacionais precisam de leitura compacta no
   desktop e apresentação progressiva no celular.
3. Filtros e ações secundárias ocupam a mesma importância das ações
   primárias.
4. Estados vazios explicam o problema, mas nem sempre oferecem um caminho
   direto e coerente para resolvê-lo.
5. A navegação móvel é funcional, porém a mudança de contexto entre lista,
   detalhe e ação precisa ser projetada por jornada.

## Inventário por rota

| Rota | Perfil | Estado atual | Principal problema | Direção |
| --- | --- | --- | --- | --- |
| `/visao-geral` | Owner | métricas, atenção, reuniões e leads recentes | carregamento frio e pouca prioridade entre blocos | painel de comando com exceções primeiro e métricas secundárias |
| `/atencao` | Owner/corretor | fila de exceções | estado vazio e carregamento pouco informativos | fila acionável, severidade, responsável e prazo |
| `/meu-dia` | Corretor | resumo da operação pessoal | precisa concentrar confirmação, pendências e calls | home pessoal com próxima ação e tempo |
| `/inbox` | Ambos | lista, conversa e contexto | desktop desperdiça área no vazio; celular não explicita lista/detalhe; fundo ruidoso | layout mestre-detalhe adaptativo e painel contextual sob demanda |
| `/leads` | Ambos | busca, filtros e lista | escaneabilidade limitada e ações distantes do contexto | tabela responsiva no desktop e cards resumidos no celular |
| `/leads/[id]` | Ambos | qualificação, resumo, fatos, call e matches | informação crítica dispersa em página longa | cabeçalho de estado, abas semânticas e trilha operacional |
| `/pipeline` | Owner | 14 etapas por fatos | rolagem horizontal extensa e pouca visão macro | visão resumida por etapa + detalhe progressivo; manter movimentação só por fatos |
| `/agenda` | Ambos | reuniões próximas e histórico | mistura operação futura e histórico; estados não traduzidos | agenda por período, exceções e detalhe lateral |
| `/follow-ups` | Owner | fila e histórico | lista extensa, estados crus e baixa priorização | separar vencidos, hoje, futuros e concluídos |
| `/reativacao` | Owner | importação, segmentação, campanhas e logs | formulário e CRUD disputam a mesma tela | fluxo em etapas para criar; campanhas em área de gestão própria |
| `/imoveis` | Ambos | catálogo e importação documental | vazio manda cadastrar “acima”, mas cadastro está recolhido; ações concorrentes | catálogo como base, criação guiada e importação por IA isolada |
| `/equipe` | Owner | convite, disponibilidade e regras | muitos campos editáveis simultaneamente | lista de corretores + detalhe/edit em painel ou rota |
| `/inteligencia` | Owner | comportamento, qualificação, agenda, testes, credenciais | alta complexidade em abas e formulários longos | central de IA com resumo de estado, módulos e publicação explícita |
| `/relatorios` | Owner | indicadores, filtros, CSV e auditoria | hierarquia fraca entre análise e auditoria | visão analítica, filtros persistentes e auditoria separada |
| `/configuracoes` | Owner | hub de configurações | boa base, mas nomenclatura e destinos precisam ser consolidados | manter hub e reduzir duplicidade com Inteligência |
| `/join/[token]` e auth | Público | convite, cadastro e login | jornada sensível a sessão e identidade | melhorar clareza sem alterar os contratos de convite |

## Observações por superfície

### Inbox

- Em desktop, o estado sem conversa repete a mesma orientação no centro e no
  painel direito.
- O painel de contexto vazio consome largura sem entregar valor.
- O padrão decorativo no fundo compete com mensagens e estados.
- No celular, a lista é legível, mas os previews longos são cortados sem
  reforçar remetente, status e urgência.
- É uma superfície de alto risco: realtime, IA/humano, janela do WhatsApp,
  atribuição, histórico e bloqueio pós-call não podem mudar com o layout.

### Pipeline

- As 14 colunas comunicam o modelo operacional, mas não oferecem boa leitura
  global em telas menores.
- No celular, apenas uma coluna e parte da seguinte ficam visíveis; não há uma
  pista forte de quantas etapas ainda existem.
- O redesign deve preservar a regra central: cards não são arrastados e só
  mudam de etapa por fatos válidos.

### Empreendimentos

- O empty state orienta a cadastrar incorporadoras e bairros “acima”, enquanto
  a área de cadastros rápidos está recolhida e pouco evidente.
- “Novo empreendimento”, “Analisar documentos com IA” e “Cadastros rápidos”
  aparecem antes de o usuário compreender a ordem correta.
- Importação documental precisa continuar com preview e aprovação; não pode
  publicar diretamente.

### Equipe

- Informações de capacidade, prioridade, WhatsApp e disponibilidade aparecem
  como formulários abertos para vários corretores ao mesmo tempo.
- Falta separar leitura do estado, edição e ações de risco.
- O perfil do corretor não deve receber controles administrativos por
  reaproveitamento acidental.

### Inteligência

- A quantidade de módulos é coerente com a operação, mas a tela exige que o
  owner entenda a arquitetura interna para se orientar.
- Configuração, teste, histórico de execução e credenciais precisam ter pesos e
  estados distintos.
- Alterações devem indicar claramente rascunho, versão ativa e impacto.

### Reativação

- Criação de campanha, revisão de arquivo, campanhas existentes e logs
  convivem na mesma página longa.
- O modelo correto é criar por etapas e gerenciar campanhas em uma listagem
  estável, sem perder cadência, arquivamento, métricas ou idempotência.

## Direção visual recomendada

O Studiosp deve parecer uma central operacional confiável, não uma coleção de
formulários. A direção proposta é:

- interface calma, precisa e orientada por exceções;
- tipografia e espaçamento como principais instrumentos de hierarquia;
- cor roxa como identidade e ação, não como decoração onipresente;
- superfícies semânticas diferentes para informação, atenção, sucesso,
  bloqueio e edição;
- ícones sempre acompanhados de texto em ações críticas;
- motion curto e funcional, respeitando `prefers-reduced-motion`;
- densidade alta onde há comparação e baixa onde há decisão;
- português integral, com rótulos centralizados;
- estados de loading, vazio, erro, offline e sucesso projetados por rota.

As referências Taste e Apple servem como princípios de clareza, redução,
hierarquia e interação. Elas não devem transformar o CRM em uma interface
promocional nem introduzir gestos ocultos para ações críticas.

## Estratégia segura de implementação

### Fase 0 — baseline e contratos

- congelar capturas por perfil e breakpoint;
- registrar os fluxos E2E que não podem regredir;
- criar uma matriz de estados por rota;
- aprovar direção visual antes de alterar tokens.

### Fase 1 — fundações

- tokens semânticos, tipografia, espaçamento, elevação e motion;
- shell, cabeçalho, navegação e padrões de loading/erro/vazio;
- componentes de layout sem alterar componentes de domínio;
- validação claro/escuro, 390 px, tablet e desktop.

### Fase 2 — comando pessoal

- Visão geral e Central de atenção do owner;
- Meu dia e pendências do corretor;
- objetivos: prioridade, próxima ação, SLA e exceções.

### Fase 3 — lead

- listagem de leads;
- detalhe com resumo, qualificação, reunião, fatos e recomendações;
- validação rigorosa das permissões e do bloqueio pós-call.

### Fase 4 — Inbox

- lista, conversa e contexto responsivos;
- todos os estados de IA, humano, atribuição e janela WhatsApp;
- testes de realtime e mensagens duplicadas antes de qualquer promoção.

### Fase 5 — execução operacional

- Agenda;
- Follow-ups;
- Pipeline;
- Reativação de base.

### Fase 6 — administração e inteligência

- Empreendimentos e análise documental;
- Equipe e disponibilidade;
- Inteligência;
- Relatórios;
- Configurações.

### Fase 7 — acesso

- login, cadastro, convite, recuperação e estados de identidade;
- validação sem alterar o contrato de autenticação.

Cada fase deve ser implementada em commits pequenos, testada em staging e
comparada com os contratos atuais. A branch de redesign não deve receber
migrações de banco salvo aprovação explícita e justificativa funcional
separada.

## Critérios de aceite por rota

- a mesma ação produz a mesma chamada e o mesmo efeito no banco;
- owner e corretor continuam vendo apenas o que sua role permite;
- fluxos críticos funcionam com mouse, teclado e toque;
- nenhuma informação relevante depende apenas de cor;
- loading tem progresso ou contexto; erro tem recuperação;
- não há rolagem horizontal da página em 390 px;
- listas densas continuam escaneáveis em desktop;
- todos os textos visíveis estão em português correto;
- tema claro e escuro preservam contraste e hierarquia;
- testes atuais passam e os cenários E2E da rota são ampliados.

## Decisões pendentes antes do código visual

1. Aprovar a direção “central operacional calma e precisa”.
2. Escolher se o Pipeline móvel será uma lista por etapas ou um seletor de etapa
   com cards; a visualização completa pode continuar disponível no desktop.
3. Confirmar se Inteligência e Configurações serão apenas reorganizadas na
   navegação ou unificadas visualmente sob um único hub, sem mover contratos.
4. Definir a densidade padrão de listas no desktop: confortável ou compacta.

## Resultado

O repositório é adequado para um redesign progressivo. Não é recomendável uma
reescrita integral em paralelo, porque a operação já está funcional e concentra
contratos sensíveis em Inbox, agenda, IA, pipeline e permissões. A abordagem
mais segura é substituir a apresentação rota por rota sobre os mesmos hooks,
ações e APIs, começando pelas fundações e por superfícies de menor risco antes
do Inbox.

