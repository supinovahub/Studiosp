# Plano Mestre do Studiosp

> Documento vivo de produto e arquitetura. As seções marcadas como **Confirmado** representam decisões já tomadas. As seções marcadas como **Proposta** ainda precisam de validação antes da implementação.

Especificação executável da primeira entrega: [Especificação da Versão 1](./ESPECIFICACAO_V1_STUDIOSP.md).

Contrato técnico do banco: [Modelo de Dados Executável da V1](./MODELO_DADOS_V1_STUDIOSP.md).

Roteiro de validação com contas e integrações reais: [Homologação da V1](./HOMOLOGACAO_V1_STUDIOSP.md).

Especificação da importação segura de conversas antigas:
[Importação de histórico do WhatsApp](./IMPORTACAO_HISTORICO_WHATSAPP.md).

## Estado da implementação

A V1 está implementada na branch de homologação `codex/v1-platform`. Produção e `main` permanecem preservadas. A promoção depende da conclusão do roteiro de homologação e de autorização expressa do dono.

### Situação em 24 de julho de 2026

#### Confirmado

- o ambiente de desenvolvimento e homologação continua sendo a branch
  `codex/v1-platform`;
- o banco usado para mudanças e testes é o projeto Supabase
  **Studiosp Staging** (`vgmmfzdifjhpqaopxfbj`);
- produção, `main` e o projeto Supabase **Studiosp** não devem receber as
  próximas mudanças antes de uma promoção expressamente autorizada;
- a conexão da empresa com o WhatsApp pela UAZAPI está ativa e permite iniciar
  a homologação dos fluxos que dependem de mensagens reais;
- conexão ativa não equivale a homologação concluída: entrada, saída,
  idempotência, mídia, áudio, respostas de corretores, falhas e contingência
  ainda precisam ser validados ponta a ponta;
- antes de retomar desenvolvimento, o produto passará por uma rodada de
  planejamento detalhado, com atualização deste documento e aprovação das
  fases.

### Modo atual de trabalho — planejamento antes de desenvolvimento

#### Confirmado

1. Não iniciar uma nova frente relevante apenas porque ela já aparece no
   roadmap.
2. Fechar primeiro o problema, o fluxo esperado, os limites, os dados, as
   permissões, as falhas e os critérios de aceite.
3. Registrar neste plano as decisões de produto; detalhes executáveis ficam na
   especificação da V1, no modelo de dados e na homologação.
4. Separar claramente:
   - comportamento já implementado e validado;
   - comportamento implementado que ainda precisa de homologação real;
   - correção necessária;
   - proposta ainda não aprovada;
   - item reservado para versão futura.
5. Executar mudanças somente no staging até a aprovação de uma fase.
6. Encerrar cada fase com testes automatizados, homologação real aplicável,
   relatório em Markdown e decisão explícita de avançar, corrigir ou adiar.

### Trilhas da rodada de planejamento

As trilhas abaixo organizam a descoberta. Elas ainda não representam ordem
definitiva de implementação.

1. **Produto, perfis e jornada:** dono, corretor, lead, oportunidade, estados,
   exceções e limites da V1.
2. **Experiência e arquitetura da informação:** fluxos completos em desktop e
   celular, começando por catálogo, lead, agenda e central de atenção.
3. **WhatsApp e UAZAPI:** conexão, webhooks, identidade dos números, mensagens,
   mídia, áudio, idempotência, observabilidade e contingência.
4. **IA-SDR e qualificação:** conversa, perguntas, extração, confiança,
   transcrição, matching, follow-up e transbordo humano.
5. **Agenda e distribuição:** capacidade, concorrência, confirmação do lead,
   oferta ao corretor, aceite, rejeição, transferência, redistribuição e limite
   de contingência.
6. **Catálogo e biblioteca de mídias:** cadastro guiado, condições comerciais,
   publicação, validade, upload, organização, permissões e uso pela IA.
7. **Métricas, auditoria e operação:** definições de indicadores, filtros,
   eventos, alertas, diagnóstico e relatórios.
8. **Segurança, dados e lançamento:** RLS, funções privilegiadas, retenção,
   LGPD, backup, migração, rollback e critérios de promoção.

### Critério para uma trilha ficar pronta para execução

Uma trilha só pode virar fase de desenvolvimento quando possuir:

- objetivo e resultado observável;
- fluxo principal e fluxos de exceção;
- atores e matriz de permissões;
- dados e eventos envolvidos;
- integrações e efeitos externos;
- regras invariáveis e parâmetros configuráveis;
- estados de carregamento, vazio, erro, repetição e contingência;
- comportamento em celular;
- critérios de aceite automatizados e manuais;
- estratégia de rollout, observabilidade e rollback;
- dependências, riscos e itens explicitamente fora do escopo.

## 1. Visão do produto

### Confirmado

O Studiosp será a plataforma operacional de uma única empresa de venda de studios. O CRM será um dos módulos dessa plataforma, e não o produto inteiro.

O fluxo principal começa na aquisição do lead, passa pelo atendimento e qualificação por IA, pelo agendamento e atendimento de um corretor, e termina no resultado comercial e financeiro.

O produto deve:

- concentrar a operação em um painel único;
- registrar dados estruturados e eventos de toda a jornada do lead;
- permitir que a IA qualifique o lead sem vender ou negociar;
- entregar ao corretor contexto suficiente para uma conversa curta e objetiva;
- automatizar mudanças de etapa apenas quando existirem fatos verificáveis;
- manter rastreabilidade de ações humanas, ações da IA e integrações;
- produzir métricas operacionais, comerciais e financeiras confiáveis.

### Princípios do produto

1. **Fatos movem o funil.** O usuário registra o que aconteceu; o sistema valida e atualiza a etapa correspondente.
2. **IA com autonomia limitada e auditável.** A IA conversa, interpreta e organiza, mas não inventa fatos comerciais.
3. **Configuração sem fragilizar o banco.** Perguntas, regras e comportamentos configuráveis não devem exigir alteração manual do esquema do banco.
4. **Uma fonte de verdade.** Conversa, qualificação, reunião, responsável, proposta, contrato e venda ficam ligados ao mesmo lead e à mesma oportunidade.
5. **Exceções têm motivo.** Rejeições, transferências, alterações forçadas e perdas exigem justificativa e ficam no histórico.
6. **Interface orientada a trabalho.** A navegação deve refletir a operação da empresa, não a estrutura herdada do WACRM.

## 2. Escopo organizacional

### Confirmado

- operação única, sem necessidade de produto SaaS multiempresa;
- usuários humanos atuais: dono e corretores;
- o dono precisa de visão centralizada da operação, métricas, configurações e auditoria;
- cada corretor trabalha com os leads atribuídos a ele e, futuramente, conecta a própria conta do Google;
- a separação interna por `account_id` pode ser mantida inicialmente como limite de segurança, sem aparecer como complexidade na experiência do usuário.

## 3. Perfis e permissões

### Proposta

Usar um perfil-base por usuário e permissões adicionais pontuais. Isso evita conflitos de múltiplos perfis e ainda permite liberar funções específicas quando necessário.

#### Dono

- acesso completo;
- usuários e permissões;
- configurações da IA e das integrações;
- catálogo de imóveis;
- regras de distribuição;
- visão de todos os leads, corretores, reuniões e resultados;
- métricas financeiras;
- auditoria e justificativas;
- capacidade de realizar exceções, sempre com motivo registrado.

#### Gestor de operação

Perfil opcional para delegação futura. Não precisa existir como usuário no lançamento.

- visão de toda a operação;
- gestão de corretores, filas e distribuição;
- tratamento de exceções;
- configuração operacional de agendas e follow-ups;
- relatórios operacionais;
- sem acesso à propriedade da conta, segredos sensíveis ou decisões reservadas ao dono.

#### Corretor

- leads atribuídos a ele;
- resumo do lead e oportunidades compatíveis;
- própria agenda e disponibilidade;
- registro de reunião realizada, proposta enviada, negociação, contrato, venda e perda;
- rejeição ou transferência com motivo obrigatório;
- histórico dos próprios atendimentos;
- métricas pessoais, conforme política definida pelo dono.

#### Analista de leitura

Permissão opcional, não um perfil operacional obrigatório. Pode atender gestor de tráfego, financeiro ou outro colaborador que precise apenas de indicadores e relatórios.

#### Ator de sistema

Não é um usuário humano. IA, automações e integrações devem aparecer na auditoria como atores identificáveis, separados dos usuários.

### Direção recomendada

Para a primeira versão, usar apenas **Dono** e **Corretor** na interface. Preservar no modelo a possibilidade de **Gestor de operação** e **Analista de leitura**, sem criar telas ou complexidade antes da necessidade real.

## 4. Modelo operacional do lead

### Confirmado

O humano não precisa arrastar livremente um card no Kanban. Ele registra um acontecimento e o sistema reorganiza o lead.

Exemplos:

- o corretor informa que a reunião aconteceu;
- o sistema confirma que a data e o horário agendados já passaram;
- o evento é registrado;
- a etapa do lead muda para reunião realizada;
- a ação fica disponível para métricas e auditoria.

### Contato e oportunidade

#### Decisão confirmada

- na primeira versão, o fluxo será orientado à compra atual que originou o lead de tráfego;
- cada contato terá, inicialmente, apenas uma oportunidade ativa;
- recompra e múltiplas jornadas simultâneas não precisam aparecer na experiência da primeira versão;
- o modelo de dados deve permitir que o mesmo contato possua novas oportunidades históricas no futuro, sem obrigar a operação atual a lidar com essa complexidade;
- suporte completo a recompra e múltiplas oportunidades fica reservado para a Versão 2 ou 3.

### Proposta: separar quatro dimensões

Uma única coluna de Kanban não é suficiente para representar toda a operação. O lead deve possuir estados relacionados, mas independentes:

#### Etapa do funil

Representa a posição principal da oportunidade:

1. lead recebido;
2. primeiro contato;
3. em qualificação;
4. qualificado;
5. aguardando agendamento;
6. reunião agendada;
7. reunião realizada;
8. proposta enviada;
9. negociação;
10. contrato/assinatura;
11. venda realizada;
12. perdido.

Os nomes e a quantidade exata ainda serão refinados antes da implementação.

#### Estado de atenção

Representa o que precisa acontecer agora:

- aguardando resposta do lead;
- follow-up programado;
- follow-up vencido;
- ação do corretor pendente;
- revisão do dono necessária;
- processamento pela IA;
- sem pendências.

**Follow-up não deve ser uma etapa fixa do Kanban.** Um lead pode precisar de follow-up durante a qualificação, após uma reunião ou durante uma negociação. Ele é uma pendência transversal.

#### Estado da reunião principal

- não iniciada;
- horários sendo combinados;
- agendada;
- realizada;
- não compareceu;
- cancelada;
- reagendamento solicitado.

#### Estado comercial

- sem proposta;
- proposta enviada;
- em negociação;
- contrato pendente;
- contrato assinado;
- ganho;
- perdido.

### Eventos humanos relevantes

- reunião realizada;
- ausência do lead;
- reunião cancelada;
- proposta enviada;
- negociação iniciada;
- contrato enviado;
- contrato assinado;
- venda confirmada;
- perda informada;
- corretor rejeitou atendimento;
- atendimento transferido;
- exceção aplicada pelo dono.

Cada evento deve registrar, no mínimo: data, ator, lead, estado anterior, estado resultante, origem, justificativa quando exigida e dados relacionados.

### Regra de tempo da reunião

O corretor só pode marcar uma reunião como realizada depois do horário agendado. O dono pode ter uma ação de exceção para corrigir casos reais, mas deverá informar o motivo.

## 5. Reunião principal

### Confirmado

- pode ser uma videoconferência ou ligação;
- duração comunicada ao lead: aproximadamente 5 a 10 minutos;
- a primeira versão precisa controlar uma reunião principal por oportunidade;
- deve registrar agendamento, comparecimento, cancelamento, ausência e reagendamento;
- o histórico precisa permanecer no banco mesmo quando a reunião for reagendada;
- não é necessário, na primeira versão, modelar uma sequência ilimitada de reuniões comerciais.

### Faseamento proposto

#### Versão 1

- concluir a qualificação antes de iniciar a etapa de agendamento;
- a IA solicitar ao lead um dia, horário ou período preferido para a conversa;
- registrar uma ou mais preferências, mesmo que a resposta seja ampla, como “à tarde” ou “qualquer horário”;
- manter o lead como `qualificado — aguardando preferência` quando ele ainda não responder à pergunta de agendamento;
- consultar a grade de horários e a capacidade registradas no banco;
- oferecer ao lead opções reais dentro dos períodos garantidos;
- confirmar imediatamente ao lead quando a reserva de capacidade for concluída com sucesso;
- distribuir a reunião internamente para um corretor pelo painel ou WhatsApp, sem fazer o lead aguardar;
- usar pré-agendamento sujeito a confirmação apenas quando o dono permitir horários fora dos períodos garantidos;
- registro estruturado da reunião e do seu resultado;
- sem necessidade de OAuth e sincronização completa com Google Agenda.

O corretor não precisa reiniciar a conversa para descobrir o perfil do lead. Ele recebe a qualificação, a preferência de horário, o resumo e os empreendimentos compatíveis. Só entra manualmente na conversa se houver uma exceção ou se a operação decidir que a confirmação deve ser humana.

#### Versão 2

- cada corretor conecta sua conta Google;
- disponibilidade definida por corretor;
- visão centralizada para o dono;
- seleção automática apenas em janelas válidas;
- criação do evento na agenda do corretor;
- confirmação, cancelamento, ausência e reagendamento sincronizados;
- lembretes e tratamento de conflitos.

### Horários garantidos

#### Decisão confirmada

O dono poderá configurar no painel períodos em que a empresa garante que haverá um corretor para atender. A configuração será persistida no banco e usada pelo mecanismo de agendamento.

Um horário garantido representa um compromisso da empresa, não de um corretor específico. Quando houver capacidade disponível, a IA poderá confirmar a reunião imediatamente ao lead. A escolha e a confirmação do corretor acontecem internamente, sem fazer o lead esperar.

O painel do dono deverá permitir configurar:

- fuso horário da operação;
- dias e horários de atendimento;
- períodos garantidos;
- capacidade de reuniões por intervalo;
- duração da call e intervalo de segurança entre reuniões;
- antecedência mínima e horizonte máximo para agendamento;
- corretores elegíveis e responsáveis por cada período;
- corretores de contingência;
- prazo para aceite interno;
- quantidade de tentativas de redistribuição;
- regras de escalonamento para o dono;
- bloqueios, feriados, férias e exceções de data.

O sistema não deve publicar como garantido um período sem cobertura ou capacidade válida. Reservas precisam consumir capacidade de forma atômica no banco para impedir que dois leads ocupem a mesma vaga.

Políticas comerciais e operacionais serão configuráveis pelo dono. Regras de integridade, segurança, auditoria e prevenção de conflito permanecerão invariáveis.

## 6. Distribuição para corretores

### Confirmado

- o corretor pode rejeitar ou transferir um atendimento;
- rejeição e transferência exigem motivo;
- o dono precisa visualizar todas essas ocorrências e justificativas;
- quando uma reunião for marcada, ela entra na fila de corretores elegíveis;
- a reunião é oferecida a um corretor por vez;
- cada corretor tem até **30 minutos** para aceitar ou responder à oferta;
- rejeição explícita ou ausência de resposta por 30 minutos encaminha
  imediatamente a mesma reunião ao próximo corretor elegível;
- aceite válido encerra a disputa e vincula a reunião ao corretor;
- o fluxo de fila e redistribuição será homologado com o usuário indicado pelo
  dono atuando como primeiro corretor e com um segundo corretor de teste
  controlado;
- as mensagens reais da homologação serão enviadas apenas para números
  controlados fornecidos fora deste documento.

#### Parâmetro temporário de homologação

Para testar o timeout sem aguardar 30 minutos em cada cenário, staging poderá
usar temporariamente o prazo de **2 minutos**. Esse valor deverá:

- ser identificado como configuração exclusiva de teste;
- ser registrado nas evidências da homologação;
- validar o mesmo mecanismo usado pelo prazo real, sem caminho especial no
  código;
- ser restaurado para **30 minutos** ao final da execução;
- ter sua restauração verificada e registrada no relatório.

### Roteamento

#### Confirmado

Aplicar filtros de elegibilidade antes da distribuição:

- corretor ativo;
- número de WhatsApp interno verificado;
- disponível no horário marcado para a reunião;
- sem indisponibilidade temporária que alcance esse horário;
- sem outra reunião sobreposta, considerando também o intervalo de segurança;
- carga de trabalho e capacidade dentro dos limites configurados;
- compatibilidade com região, empreendimento ou especialidade, quando essas
  regras estiverem ativas.

A elegibilidade é calculada para o horário da reunião, não somente para o
momento em que a oferta é enviada. Ela deve ser revalidada atomicamente no
aceite. Se uma mudança de disponibilidade, capacidade ou agenda tornar o
corretor inelegível enquanto a oferta estiver pendente, a oferta expira e a
reunião segue para o próximo corretor.

Os dias, horários, fuso e períodos de cobertura da fila serão configurados pelo
dono. A V1 não terá uma janela operacional fixa imposta pelo produto. Dentro
dos períodos configurados, o prazo individual de resposta corre normalmente;
fora deles, novas ofertas aguardam a próxima abertura, salvo contingência
aplicável. Alertas críticos ao dono não dependem da janela de ofertas.

Enquanto a configuração operacional obrigatória não estiver concluída:

- a IA pode receber e qualificar leads;
- nenhum horário pode ser publicado ou oferecido como garantido;
- a fila não envia ofertas a corretores;
- o dono vê uma pendência crítica para configurar horários, fuso, cobertura e
  capacidade;
- a funcionalidade de agendamento só pode ser publicada após validação dessa
  configuração;
- mudanças posteriores afetam novas disponibilidades, sem invalidar
  silenciosamente reuniões já confirmadas.

Entre os elegíveis, aplicar rodízio equilibrado, iniciando por quem recebeu uma
reunião há mais tempo. Cada nova oferta respeita essa ordem e só avança para o
próximo corretor após rejeição explícita ou expiração do prazo do corretor
atual.

Quando todos os corretores elegíveis forem percorridos sem aceite:

- a reunião permanece confirmada para o lead;
- o estado operacional passa para **sem corretor responsável**;
- o dono recebe um alerta crítico;
- o caso fica visível na Central de atenção para tratamento manual;
- o sistema não promete ao lead uma atribuição que ainda não ocorreu.

Toda rejeição ou transferência deve ter um código de motivo e permitir
observação. O dono terá uma fila de auditoria com volume, recorrência e impacto
dessas ações.

#### Concorrência e exceções confirmadas

- rejeição explícita encerra a oferta corrente e aciona imediatamente o próximo
  corretor, sem aguardar o restante do prazo;
- uma oferta expirada não pode mais atribuir a reunião;
- aceite recebido após a expiração deve ser recusado com uma resposta clara
  informando que a oferta não está mais disponível;
- aceite e expiração devem disputar uma única transição atômica, de modo que
  apenas um resultado seja válido;
- respostas quase simultâneas nunca podem atribuir a mesma reunião a dois
  corretores;
- transferência após o aceite exige motivo, remove a atribuição anterior e
  devolve a reunião à fila;
- o corretor que solicitou a transferência fica excluído da nova rodada dessa
  mesma reunião, salvo exceção manual e auditada do dono;
- toda oferta, envio, resposta, rejeição, aceite, expiração, tentativa tardia,
  transferência e redistribuição deve permanecer registrada na auditoria.

#### Cancelamento, reagendamento e indisponibilidade confirmados

- cancelamento da reunião encerra todas as ofertas pendentes e libera a
  capacidade reservada;
- reagendamento revalida primeiro o corretor já atribuído;
- se ele continuar elegível no novo horário, a atribuição é mantida e o
  corretor recebe uma notificação da mudança;
- se ele estiver inelegível no novo horário, a atribuição é encerrada e a
  reunião retorna à fila;
- indisponibilidade informada depois do aceite não remove silenciosamente a
  atribuição: cria um alerta e solicita transferência;
- o dono pode forçar a atribuição ou sua manutenção como exceção, com
  justificativa obrigatória e auditoria do estado anterior e resultante.

#### Contingência de três horas confirmada

O limite de três horas é contado em relação ao início da reunião e depende do
tipo de reserva:

- em horário garantido, chegar a três horas da reunião sem corretor atribuído
  gera alerta crítico e exige atuação do dono, mas não cancela automaticamente
  o compromisso confirmado com o lead;
- em horário provisório ou fora da cobertura, chegar a três horas da reunião
  sem cobertura confirmada cancela preventivamente a reserva, informa o lead
  sobre o imprevisto e encaminha a conversa para atendimento humano;
- o prazo individual de 30 minutos por corretor continua válido enquanto houver
  tempo para percorrer a fila;
- ao alcançar o limite, o sistema interrompe novas ofertas incompatíveis com a
  contingência aplicável e registra a decisão, o motivo e as notificações.

#### Propostas ainda não confirmadas

- usar reuniões futuras como critério adicional de desempate;
- considerar conhecimento dos imóveis compatíveis;
- exibir taxa de rejeição ou ausência apenas como alerta, sem punição automática.

### Experiência da fila no CRM

#### Confirmado

O dono visualiza:

- reuniões aguardando aceite, corretor da oferta atual e contagem regressiva;
- posição, tentativas e histórico da distribuição;
- estados `aguardando oferta`, `aguardando aceite`, `atribuída`,
  `redistribuindo`, `sem responsável` e `em contingência`;
- motivos de rejeição e transferência;
- ações auditadas para atribuir manualmente, reenviar, pular um corretor ou
  encerrar a distribuição;
- alertas destacados para fila esgotada e reunião próxima sem responsável.

O corretor visualiza:

- somente a oferta ativa destinada a ele;
- data, horário, duração, prazo restante e código da reunião;
- ações para aceitar, rejeitar com motivo e informar indisponibilidade;
- resumo completo do lead somente depois do aceite;
- ofertas expiradas apenas no histórico, nunca como ação ainda disponível.

WhatsApp e painel representam o mesmo estado operacional. Uma ação válida em um
canal deve atualizar o outro e invalidar imediatamente comandos ou opções
antigas.

### Confirmação pelo WhatsApp do corretor

#### Decisão confirmada

Cada corretor poderá ter um número de WhatsApp verificado no seu cadastro. A IA de operação usará esse canal para solicitar aceite, rejeição, transferência ou alternativa de horário mesmo quando o corretor não estiver com o dashboard aberto.

O número do corretor fará parte de uma lista interna verificada. Mensagens vindas desses números serão encaminhadas ao fluxo operacional de corretores, separado do atendimento SDR dos leads.

#### Fluxo confirmado

1. o lead aceita um horário garantido e recebe a confirmação imediata;
2. o sistema cria a reserva, reduz a capacidade do intervalo e inicia a distribuição interna;
3. a IA de operação envia pelo WhatsApp do corretor uma solicitação com código
   identificador, data, horário, duração, prazo de resposta e resumo do interesse
   do lead;
4. o corretor pode aceitar, recusar, transferir ou sugerir outro horário;
5. a resposta natural é interpretada, validada contra as regras e transformada em uma ação estruturada;
6. o sistema confirma ao corretor o resultado da ação e registra tudo na auditoria;
7. se ele rejeitar ou não responder em até 30 minutos, a mesma reserva é
   oferecida ao próximo corretor elegível;
8. se nenhum corretor assumir, o dono recebe um alerta crítico e a conversa entra na central de atenção humana.

Antes do aceite, o resumo pode incluir perfil de interesse, região, tipologia,
faixa de orçamento, condições relevantes, urgência e necessidades declaradas,
mas não deve revelar nome, telefone ou outro identificador pessoal do lead. O
resumo completo e os dados dos empreendimentos ficam disponíveis ao corretor
depois da atribuição, preferencialmente no painel autenticado.

#### Contrato confirmado das mensagens

- a oferta inicial contém código, data, horário, duração, prazo restante, resumo
  do interesse e instruções para aceitar ou rejeitar;
- respostas naturais são interpretadas, mas sempre convertidas em uma intenção
  estruturada e validada;
- resposta ambígua gera uma confirmação curta sem pausar ou reiniciar o prazo;
- rejeição sem motivo solicita o motivo e só é concluída quando ele for
  informado;
- se o prazo terminar antes da confirmação ou do motivo, a oferta expira e
  segue para o próximo corretor;
- uma única lembrança é enviada na metade do prazo, sem reiniciar ou estender o
  cronômetro: após 15 minutos na operação real e após 1 minuto na homologação
  com timeout de 2 minutos;
- depois do aceite, o corretor recebe confirmação e link autenticado para o
  resumo completo;
- mensagens ou webhooks duplicados não podem executar uma ação mais de uma vez;
- comando relativo a oferta expirada recebe explicação clara e não altera a
  atribuição vigente.

#### Troca do número conectado à UAZAPI

##### Correção necessária

Após substituir o número conectado à UAZAPI, conversas e mensagens vinculadas ao
número anterior ainda aparecem na Caixa de entrada ativa. A correção deve
distinguir a identidade da conexão que originou cada conversa e impedir que
dados da conexão anterior sejam apresentados como parte da operação corrente.

O histórico não deve ser apagado. Conversas da conexão anterior devem sair da
Caixa de entrada ativa e permanecer acessíveis em uma visualização arquivada,
claramente identificadas como pertencentes ao número ou à conexão anterior. A
troca não pode misturar mensagens, contatos ou estado operacional entre as duas
conexões.

##### Modelo confirmado

- cada conexão registra número, identificador da instância, período de atividade
  e estado;
- somente a conexão atual alimenta a Caixa de entrada ativa;
- conexão arquivada não pode originar novos envios;
- o dono acessa o histórico por um filtro de conexões arquivadas;
- contatos, leads, oportunidades e eventos comerciais permanecem preservados;
- nova mensagem do mesmo lead na conexão atual pode reutilizar o contato
  identificado pelo telefone normalizado, mas cria uma conversa pertencente à
  conexão atual;
- mensagens de conexões diferentes não são fundidas em uma única conversa;
- o detalhe do lead mantém a visão histórica com identificação clara da
  conexão de cada conversa;
- o corretor acessa histórico arquivado somente dos leads que pode consultar; o
  dono acessa todo o histórico da operação;
- arquivamento e troca de conexão não apagam nem migram dados silenciosamente.

##### Troca técnica confirmada

- apenas uma conexão de atendimento a leads pode estar ativa por vez;
- a nova conexão precisa validar status, número e webhook antes da ativação;
- ativar a nova conexão e arquivar a anterior constitui uma única operação
  lógica, sem período em que ambas operem como atuais;
- mensagens de saída pendentes na conexão anterior são canceladas e viram itens
  de atenção, sem reenvio automático pelo número novo;
- webhooks atrasados da conexão arquivada são armazenados no histórico correto,
  mas não reabrem a Caixa de entrada ativa nem acionam a IA;
- se a validação ou ativação da nova conexão falhar, a conexão anterior
  permanece ativa;
- a troca registra ator, horário, conexão anterior, conexão nova, resultado e
  erro, quando houver;
- reativar uma conexão arquivada exige ação explícita do dono e nova validação.

Se uma conexão arquivada receber uma mensagem realmente nova:

- a mensagem é armazenada no histórico arquivado;
- nenhuma resposta automática é enviada e a IA não é acionada;
- a conversa não retorna à Caixa de entrada ativa;
- o dono recebe um alerta com contato, horário e conexão anterior;
- o alerta pode ser resolvido depois que o lead for contatado pelo canal atual;
- não há encaminhamento automático entre números sem autorização do lead.

##### QR Code no dashboard — implementado, não homologado

Em 24 de julho de 2026, o staging:

- apresenta a integração UAZAPI como conectada;
- exibe a seção de conexão por QR Code e o botão `Gerar conexão`;
- possui frontend capaz de renderizar a imagem devolvida pela UAZAPI.

O teste real do QR Code não foi executado porque o botão atual chama
`POST /instance/connect` usando a mesma instância já conectada. O backend não
separa uma pré-visualização segura nem impede explicitamente nova tentativa
quando a instância está ativa. Acionar esse fluxo poderia alterar ou derrubar a
conexão corrente, contrariando o guardrail da homologação.

Antes do teste real, o produto deve:

- bloquear geração de QR na instância ativa ou exigir uma ação explícita de
  substituição;
- permitir homologar o QR com uma segunda instância controlada, sem trocar a
  conexão operacional;
- identificar claramente qual instância e número serão afetados;
- não atualizar a conexão ativa até a nova instância ser validada e a troca ser
  confirmada pelo dono.

#### Ações permitidas pelo WhatsApp na primeira versão

- aceitar uma reunião;
- rejeitar, com motivo obrigatório;
- sugerir outro horário;
- solicitar transferência;
- informar indisponibilidade temporária;
- abrir um link autenticado para ver o resumo completo.

Alterações financeiras, configurações, acesso a outros leads e confirmação de venda não devem ser autorizados apenas pela identificação do número de WhatsApp.

Quando um corretor sugerir outro horário, isso não altera automaticamente a reunião aceita pelo lead. O sistema verifica se outro corretor consegue manter o compromisso original. Se não conseguir, a sugestão vira uma contraproposta e a IA solicita a aprovação do lead.

#### Interpretação segura

A conversa com o corretor pode ser natural, mas a IA não altera diretamente o banco a partir de texto livre. Ela deve chamar ações controladas, como consultar disponibilidade, aceitar atribuição, rejeitar com motivo, propor horário ou escalar. Cada ação valida identidade, estado atual, capacidade e prazo antes de gravar a mudança.

### Matriz de homologação aprovada para fila e WhatsApp

Antes de considerar a distribuição homologada em staging, validar:

1. oferta no painel e WhatsApp do primeiro corretor, com resumo correto e sem
   dados pessoais;
2. aceite válido, atribuição única e liberação do resumo completo;
3. rejeição com motivo e envio imediato ao segundo corretor;
4. lembrete após 1 minuto e redistribuição após 2 minutos sem resposta;
5. resposta ambígua com confirmação sem extensão do prazo;
6. recusa segura de aceite tardio;
7. idempotência diante de webhook ou mensagem duplicada;
8. respostas concorrentes resultando em uma única atribuição;
9. invalidação da oferta quando a disponibilidade muda;
10. transferência após aceite, com motivo e nova fila sem o corretor anterior;
11. fila esgotada, alerta ao dono e estado `sem corretor responsável`;
12. cancelamento encerrando ofertas e reagendamento revalidando o responsável;
13. contingência de três horas distinta para horário garantido e provisório;
14. sincronização de estado entre painel e WhatsApp;
15. conversas da conexão anterior arquivadas e ausentes da Caixa de entrada
    ativa;
16. restauração e verificação do prazo operacional de 30 minutos ao final.

Cada cenário deve preservar evidências de mensagens, estados, horários, atores e
eventos de auditoria. Resultado parcial ou simulado não equivale a homologação
real.

## 7. Papel da IA-SDR

### Confirmado

A IA:

- não vende;
- não negocia;
- não recomenda um imóvel específico ao lead;
- entende o objetivo do lead por meio de uma conversa natural;
- pode lidar com desvios breves da conversa e depois retomar a qualificação;
- busca no banco quantas oportunidades são compatíveis com o perfil;
- comunica que existem oportunidades aderentes e conduz para uma conversa com um corretor;
- prepara um resumo estruturado do lead;
- mostra ao corretor os imóveis compatíveis e seus resumos para preparação da reunião.

Mensagem conceitual ao final da qualificação:

> Encontrei algumas oportunidades que combinam com o seu perfil. Para explicar as especificações e confirmar os detalhes, vou organizar uma conversa rápida de 5 a 10 minutos com um dos nossos corretores.

O texto exato será configurável e ajustado ao tom da empresa.

## 8. Autonomia da IA

### Proposta para a primeira versão

#### A IA pode agir sozinha

- cumprimentar e manter a conversa;
- transcrever e interpretar áudios;
- identificar e normalizar respostas de qualificação;
- decidir qual pergunta pendente faz mais sentido a seguir;
- responder dúvidas institucionais cobertas pela base de conhecimento;
- retomar a qualificação depois de uma digressão;
- calcular oportunidades compatíveis usando dados do banco;
- gerar resumo para o corretor;
- classificar confiança e pedir confirmação quando necessário;
- executar a cadência de follow-up dentro de limites definidos;
- registrar que a qualificação terminou;
- solicitar preferências de horário;
- encaminhar para humano quando uma regra de transbordo for atingida.

#### A IA não pode agir sozinha

- afirmar que uma reunião foi marcada sem uma reserva válida criada pela ferramenta ou uma confirmação humana;
- prometer preço, disponibilidade, condição de pagamento, financiamento ou prazo que não esteja validado;
- oferecer desconto ou negociar;
- escolher e recomendar um imóvel específico ao lead;
- afirmar que reunião, proposta, contrato ou venda aconteceram;
- enviar contrato;
- confirmar venda ou perda comercial;
- transferir responsabilidade sem uma regra de roteamento válida;
- encerrar definitivamente um lead apenas por silêncio;
- ocultar ou apagar histórico operacional.

#### Transbordo obrigatório para humano

##### Confirmado

A IA deve iniciar o transbordo quando:

- um agendamento for concluído;
- o lead pedir explicitamente para falar com uma pessoa ou demonstrar claramente
  que deseja atendimento humano;
- uma dúvida do lead não puder ser respondida com segurança pela base validada;
- o lead atingir os critérios objetivos de classificação como **lead quente**.

O lead quente será identificado por uma combinação de pontuação e respostas
específicas. A fórmula, os pesos, as respostas indicativas e o limiar ainda
serão definidos nesta rodada de planejamento.

O transbordo deve ser registrado como evento auditável, pausar os follow-ups da
IA e deixar visível que o lead aguarda atendimento humano. A conclusão do
agendamento e o pedido explícito do lead não podem depender da pontuação de
qualificação para acionar o transbordo.

O prazo máximo para um humano assumir o atendimento após o acionamento do
transbordo será de **30 minutos**. A forma de distribuição, os alertas e a
contingência após esse prazo ainda serão definidos.

Durante a espera, a IA deve confirmar ao lead que chamou um especialista e
informar o prazo de até 30 minutos, sem continuar a qualificação. Quando houver
agendamento, o atendimento seguirá a distribuição da reunião. Sem agendamento,
o lead ficará na Central de atenção e será oferecido aos corretores elegíveis.
Se ninguém assumir no prazo, o dono será alertado e a contingência será
iniciada.

##### Regras complementares propostas, ainda não confirmadas

- reclamação ou conflito;
- pergunta jurídica, contratual ou financeira fora da base validada;
- pedido de promessa ou negociação;
- baixa confiança persistente na interpretação;
- falha repetida de integração;
- situação sensível não coberta pelas regras.

Ainda precisam ser definidos a fórmula objetiva de lead quente, a ordem dos
corretores elegíveis e a contingência quando toda a fila se esgotar.

### Regra recomendada de confiança

- confiança alta: normaliza e registra;
- confiança média: registra como provisório e confirma naturalmente na conversa;
- confiança baixa: não conclui o campo e formula uma pergunta de esclarecimento;
- informação crítica, como orçamento ou prazo, pode exigir confirmação mesmo com confiança alta quando houver ambiguidade contextual.

## 9. Configuração do comportamento da IA

### Confirmado

O dono precisa configurar pelo painel:

- comportamento e tom da IA;
- contexto da empresa;
- perguntas principais de qualificação;
- ordem ou prioridade das perguntas;
- perguntas novas adicionadas pela interface;
- regras relevantes para o atendimento.

### Proposta: prompt em camadas

Não usar um único campo de texto como fonte de todo o comportamento. A execução deve combinar camadas:

1. **Regras invariáveis do sistema:** segurança, limites de autonomia, proibição de inventar fatos e regras de uso das ferramentas.
2. **Política da empresa:** tom, vocabulário, apresentação, posicionamento e instruções configuradas pelo dono.
3. **Objetivos de qualificação:** perguntas ativas, tipos de resposta, prioridade, obrigatoriedade e critérios de conclusão.
4. **Estado atual do lead:** respostas conhecidas, campos pendentes, confiança, etapa e última ação.
5. **Contexto dinâmico:** conversa recente, dados dos imóveis e resultados das ferramentas.
6. **Saída estruturada:** resposta ao lead, dados extraídos, confiança, próxima ação e justificativa operacional.

O dono poderá configurar a política comercial e a comunicação, mas não poderá remover as regras invariáveis de segurança e consistência.

## 10. Perguntas configuráveis e respostas estruturadas

### Decisão arquitetural proposta

Adicionar uma coluna ao banco para cada pergunta criada pelo dono parece simples, mas causaria alterações de esquema em produção, campos vazios em massa, relatórios frágeis e dificuldade para editar ou desativar perguntas.

Usar dois níveis:

#### Definição da pergunta

Cada pergunta configurável terá:

- identificador estável;
- título interno;
- orientação para a IA;
- tipo de resposta: texto, número, moeda, opção única, múltipla escolha, sim/não, data, localização ou outro tipo controlado;
- opções permitidas, quando aplicável;
- prioridade e ordem sugerida;
- obrigatoriedade;
- regras de validação;
- condição de exibição;
- status ativo/inativo;
- vínculo opcional com um campo canônico de métricas.

#### Resposta do lead

Cada resposta terá:

- lead e pergunta;
- texto original;
- valor normalizado;
- tipo do valor;
- confiança da interpretação;
- mensagem de origem;
- data da resposta;
- status provisório ou confirmado;
- histórico de alterações.

Campos centrais e estáveis, como faixa de preço, valor de entrada, capacidade de parcela mensal, urgência, região, financiamento e preferência por imóvel na planta ou pronto, podem continuar como campos canônicos para filtros e métricas rápidas. Perguntas personalizadas permanecem no modelo flexível. Se uma pergunta personalizada se tornar essencial ao negócio, ela poderá ser promovida de forma controlada.

### Base inicial de qualificação

#### Obrigatórias para concluir a qualificação

- objetivo da compra: moradia ou investimento;
- bairro ou região desejada;
- pelo menos uma referência financeira entre valor disponível para entrada e faixa de parcela mensal;
- preferência por imóvel na planta, pronto ou indiferença;
- urgência ou prazo pretendido para compra.

#### Desejáveis, mas não bloqueantes

- faixa de preço total do imóvel, caso o lead saiba informar;
- a segunda referência financeira, quando apenas entrada ou parcela tiver sido respondida;
- uso de financiamento ou recursos próprios.

#### Pertence ao agendamento, não à qualificação

- melhor dia, horário ou período para uma conversa rápida com o corretor.

A ausência da preferência de horário não desfaz a qualificação. Ela impede apenas que o agendamento avance para confirmação. Nesse caso, a IA continua responsável por solicitar o horário e o lead aparece no painel como qualificado, mas com agendamento pendente.

“Características desejadas” não será uma pergunta genérica. Caso surja uma característica realmente necessária para o matching, ela será transformada em uma pergunta específica e configurável.

## 11. Áudios do WhatsApp

### Proposta

O áudio percorre o mesmo fluxo de qualificação das mensagens de texto:

1. receber e vincular a mídia à mensagem;
2. armazenar metadados e acesso seguro;
3. transcrever;
4. registrar idioma, confiança e eventual erro;
5. exibir áudio e transcrição na conversa;
6. enviar a transcrição para interpretação;
7. extrair respostas estruturadas;
8. permitir reprocessamento quando necessário;
9. manter vínculo entre resposta normalizada, transcrição e áudio de origem.

A transcrição não deve ser tratada como verdade absoluta. Informações ambíguas ou de baixa confiança precisam ser confirmadas com o lead.

## 12. Compatibilidade com imóveis

### Confirmado

- a IA consulta o catálogo para encontrar aderência;
- para o lead, comunica a existência e a quantidade de oportunidades compatíveis;
- não recomenda uma unidade ou empreendimento específico;
- para o corretor, apresenta os empreendimentos compatíveis e um resumo de cada um;
- nem a IA nem o corretor precisam visualizar ou selecionar unidades específicas;
- o resultado deve registrar critérios usados, momento da consulta e versão dos dados para auditoria.

### Modelo do catálogo

O item comercial principal será o **empreendimento**. Cada empreendimento terá dados configuráveis pelo dono:

- nome do empreendimento;
- incorporadora;
- bairro e localização;
- situação comercial, incluindo opções na planta ou prontas;
- metragens disponíveis;
- preço de referência para cada metragem;
- entrada de referência para cada metragem;
- parcela média de referência para cada metragem;
- observações, diferenciais e informações necessárias ao resumo do corretor;
- data de atualização e validade das condições comerciais.

As opções de metragem e condição comercial devem ser registros relacionados ao empreendimento, e não colunas fixas como `preco_30m2` e `preco_50m2`. Assim, o dono poderá adicionar 25 m², 30 m², 50 m² ou qualquer nova configuração pelo painel sem alterar o esquema do banco.

O matching compara o perfil financeiro, a localização, a preferência por imóvel na planta ou pronto e outras perguntas estruturadas com essas opções comerciais. O lead recebe apenas a quantidade de oportunidades aderentes; o corretor recebe os empreendimentos, metragens e referências comerciais relevantes.

### Biblioteca de mídias dos empreendimentos

#### Decisão confirmada para a Versão 1

O dono poderá cadastrar e administrar pelo painel todas as mídias relacionadas a cada empreendimento. Por padrão, o corretor terá acesso de leitura aos empreendimentos ativos da operação; no contexto de um lead, a interface destacará primeiro as mídias dos empreendimentos compatíveis. O dono poderá restringir uma mídia específica quando necessário.

O painel permitirá:

- selecionar ou arrastar uma pasta completa de arquivos;
- selecionar múltiplos arquivos sem depender de uma pasta;
- acompanhar progresso, falhas e tentativas de reenvio;
- revisar os arquivos antes de publicar;
- categorizar em fachada, áreas comuns, interiores, plantas, localização, apresentação, documentos, vídeos ou categoria personalizada;
- definir capa, legenda, ordem e visibilidade;
- vincular uma mídia ao empreendimento inteiro ou a uma opção de metragem;
- editar metadados em lote;
- desativar, substituir ou arquivar mídias;
- identificar arquivos repetidos.

Quando a pasta tiver subpastas reconhecíveis, como `fachada`, `plantas` ou `areas-comuns`, o sistema poderá sugerir automaticamente as categorias. O dono revisa o resultado antes da publicação. Upload por arquivo compactado poderá existir como alternativa para ambientes que não permitam selecionar uma pasta diretamente.

#### Armazenamento

Os arquivos binários não serão gravados em colunas do banco. Eles ficarão em um bucket privado do Supabase Storage, organizados por identificadores internos do empreendimento e da mídia. O banco guardará os registros que relacionam cada arquivo ao empreendimento.

Cada registro de mídia terá, no mínimo:

- empreendimento e opção de metragem opcional;
- caminho interno no Storage;
- nome original e tipo do arquivo;
- tamanho e assinatura para identificação de duplicidade;
- categoria, legenda e texto alternativo;
- capa e ordem de exibição;
- visibilidade para dono, corretor ou eventual envio ao lead;
- usuário responsável pelo upload;
- estado de processamento, publicação ou erro;
- datas de criação, atualização, arquivamento e validade;
- versão lógica do arquivo substituído.

Arquivos novos usarão caminhos únicos. A substituição cria uma nova versão lógica, em vez de sobrescrever o mesmo objeto. A exclusão inicial será recuperável por meio de arquivamento; a remoção física ocorrerá somente após uma política de retenção definida.

Imagens pequenas poderão usar upload comum. Arquivos grandes, vídeos e lotes deverão usar upload retomável, com progresso e recuperação de falha. O bucket aplicará limites de tamanho e tipos permitidos. Acesso, upload, alteração e exclusão serão protegidos por políticas de linha e papel do usuário.

O corretor acessará os arquivos autenticado. Quando uma integração precisar entregar uma mídia fora do painel, o backend fornecerá acesso temporário e controlado, sem tornar toda a biblioteca pública.

#### Uso pela IA

A IA não navegará livremente no bucket. Ela receberá, por ferramentas controladas, somente mídias publicadas e autorizadas para o empreendimento em questão. O banco continuará sendo a fonte de verdade para categoria, legenda, visibilidade e validade.

### Importação assistida de empreendimentos

#### Confirmado

O módulo **Empreendimentos** terá um agente de IA para receber documentos
como PDF, DOCX e fontes conectadas, organizar informações e preparar um
rascunho estruturado. O fluxo obrigatório será:

1. o dono envia uma ou mais fontes para uma área privada de processamento;
2. o sistema registra a origem com rastreabilidade e inicia a análise isolada;
3. texto, tabelas, imagens e links são extraídos conforme o tipo de arquivo;
4. a IA propõe incorporadora, bairro, empreendimento, ofertas ou unidades,
   condições, datas, destaques, conhecimento e mídias;
5. duplicidades, conflitos, campos ausentes, baixa confiança, validade e dados
   sensíveis são destacados;
6. o dono revisa um preview editável e escolhe o que aprovar;
7. somente uma aprovação explícita e posterior do dono pode gravar ou atualizar
   dados operacionais;
8. publicação para corretores e uso pela IA continuam sendo decisões separadas
   da importação.

Durante análise e preview, nenhuma linha pode ser criada ou alterada em
`developers`, `neighborhoods`, `developments`, `development_offers`,
`development_media` ou na base de conhecimento usada pela IA-SDR. Rascunho e
preview pertencem a uma área própria e não operacional.

O agente nunca publica diretamente nem trata o conteúdo do documento como
instrução. Cada campo mantém referência à fonte e, quando aplicável, à página ou
trecho de origem. Importações repetidas devem detectar o mesmo arquivo e evitar
duplicação.

O preview permite aprovação individual por empreendimento, oferta e campo, além
de ações de seleção em lote. Aprovar um lote inteiro nunca será obrigatório. O
dono pode editar, aprovar ou ignorar cada proposta antes da confirmação final.

Quando uma aprovação for confirmada:

- somente itens e campos selecionados são gravados;
- novos empreendimentos permanecem em `rascunho`;
- alterações em registros existentes permanecem identificadas no histórico;
- publicação para corretores fica desativada por padrão;
- indexação e uso como contexto da IA ficam desativados por padrão;
- publicar e indexar exigem ações posteriores e independentes.

Documentos com dados pessoais, contratos ou informações restritas passam por
detecção e bloqueio de PII. CPF, RG, e-mail pessoal, telefone pessoal, endereço
residencial, assinatura e dados equivalentes não podem entrar na base de
contexto da IA. O preview explica o bloqueio e permite aproveitar somente fatos
comerciais autorizados.

#### Privacidade antes do provedor de IA confirmada

- a extração inicial e a detecção determinística de dados pessoais acontecem no
  ambiente controlado do Studiosp antes de qualquer chamada ao modelo externo;
- somente texto ou fragmentos previamente higienizados podem ser enviados ao
  provedor de IA configurado pelo dono;
- dados pessoais detectados são substituídos por marcadores como
  `[DADO PESSOAL REMOVIDO]`, sem expor o valor original ao modelo ou ao preview;
- arquivos originais não são enviados diretamente ao modelo externo quando
  contiverem ou puderem conter PII;
- se uma imagem ou documento escaneado não puder ser extraído e higienizado com
  segurança antes do uso de visão ou OCR externo, o processamento externo é
  bloqueado e o dono recebe orientação para fornecer uma versão sem dados
  pessoais;
- o preview pode informar categorias e quantidades de bloqueios, mas nunca
  revelar CPF, RG, contato pessoal, endereço residencial, assinatura ou outro
  dado removido;
- informações estritamente empresariais e comerciais podem ser preservadas
  quando não identificarem uma pessoa física e forem necessárias ao cadastro;
- logs, métricas, erros e auditoria não armazenam prompts ou fragmentos contendo
  os dados pessoais removidos.

#### Retenção confirmada

- arquivos originais ficam em bucket privado de quarentena;
- somente o dono pode abrir ou baixar as fontes;
- arquivos originais e conteúdo extraído são excluídos automaticamente 30 dias
  após o processamento;
- o dono pode excluir a fonte e seu conteúdo imediatamente;
- rascunhos que não forem aprovados expiram após 30 dias;
- depois da exclusão permanecem somente hash, nome, tipo, tamanho, datas,
  resultado do processamento e eventos de auditoria, sem texto extraído ou PII;
- documentos com PII recebem sinalização destacada e nunca são indexados;
- exclusão da fonte invalida previews pendentes dependentes dela.

#### Fontes e formatos da primeira entrega

##### Confirmado

- upload direto de PDF, DOCX, XLSX, CSV, TXT, PNG e JPG;
- múltiplos arquivos no mesmo lote;
- OCR quando o documento ou a imagem não possuir texto extraível suficiente;
- Google Drive por link compartilhado com permissão de leitura;
- sem conexão OAuth, navegação pela conta Google ou seleção de pastas nesta
  primeira entrega;
- links privados sem acesso retornam orientação clara, sem solicitar
  credenciais Google dentro do CRM;
- fontes remotas são copiadas para a quarentena privada antes da análise.

Links remotos devem usar uma lista restrita de domínios Google reconhecidos,
validar tipo, tamanho e redirecionamentos e bloquear acesso a endereços internos
ou destinos arbitrários. O link de origem não torna o documento público no CRM.

##### Limites confirmados

- máximo de 50 MB por arquivo;
- máximo de 20 arquivos por lote;
- máximo de 250 MB por lote;
- máximo de 300 páginas por documento;
- processamento assíncrono com progresso e estado por arquivo;
- documento protegido por senha é rejeitado com orientação;
- extensão, MIME e assinatura real do arquivo são validados;
- macros, executáveis e anexos incorporados nunca são executados;
- falha em uma fonte não cancela as demais;
- preview apresenta resultado, avisos e erros individualmente por fonte.

#### Experiência confirmada no dashboard

O módulo **Empreendimentos** terá a ação `Analisar documentos com IA`, que abre
um fluxo retomável em quatro etapas:

1. **Fontes:** upload ou inclusão de links compartilhados;
2. **Processamento:** progresso, avisos e erros por fonte;
3. **Preview:** propostas estruturadas, conflitos, confiança e origem;
4. **Aprovação:** seleção individual, revisão final e confirmação.

Uma área conversacional opcional permite refinar o rascunho, por exemplo
filtrando imóveis prontos, ignorando unidades vendidas ou agrupando condições do
mesmo empreendimento. A conversa:

- altera somente o rascunho isolado;
- nunca grava ou publica dados operacionais;
- destaca cada mudança realizada;
- permite desfazer alterações;
- mantém vínculo entre instrução, mudança e versão do preview.

O preview estruturado, e não a resposta textual do chat, é a fonte da aprovação.
O processamento continua em segundo plano e pode ser retomado depois que o dono
sair da tela.

#### Deduplicação e conflitos confirmados

- comparação considera nome normalizado, incorporadora, endereço e bairro;
- correspondência forte gera proposta de atualização do registro existente;
- correspondência parcial fica marcada como `possível duplicidade`;
- possível duplicidade exige que o dono escolha vincular ao existente, criar
  novo ou ignorar;
- o agente nunca mescla registros incertos automaticamente;
- novas condições comerciais criam versão, preservando a condição anterior;
- valores conflitantes exibem versões, fontes e datas lado a lado;
- unidade indicada como vendida gera proposta de inativação, nunca exclusão;
- informação sem data ou validade recebe alerta de possível desatualização;
- fontes divergentes no mesmo lote permanecem em conflito até decisão do dono;
- edição manual do dono prevalece sobre a sugestão e fica auditada.

#### Isolamento técnico e aprovação confirmados

Análise e preview usam estruturas próprias para:

- lotes e estados de processamento;
- fontes, hash, metadados e quarentena;
- itens e campos propostos;
- página, trecho, confiança e proveniência;
- conflitos, alertas de PII e decisões do dono;
- conversa e versões do preview;
- eventos de processamento, edição, aprovação, erro e exclusão.

Somente o dono acessa essas estruturas. Corretores não visualizam fontes,
rascunhos, conversas ou previews. Cada refinamento cria uma versão recuperável.

A aprovação:

- revalida no servidor a identidade, role, conta, estado e versão do preview;
- executa em uma única transação;
- grava todos os itens selecionados ou não grava nenhum;
- mantém o rascunho quando falha, permitindo correção e nova tentativa;
- registra o antes, o depois, a versão aprovada e o ator;
- nunca expõe chave privilegiada ao navegador.

Eventos de auditoria permanecem após a expiração do conteúdo, sem preservar PII
ou texto extraído eliminado pela política de retenção.

#### Configuração do agente confirmada

- o agente de documentos possui configuração separada da IA-SDR;
- por padrão, herda provedor, modelo e credencial criptografada configurados
  pelo dono;
- o dono pode selecionar outro modelo compatível sem alterar o atendimento dos
  leads;
- prompts, versões, limites e métricas de uso são independentes;
- cada execução registra modelo, versão do prompt, tokens, duração e custo
  estimado quando disponível;
- ausência de suporte a visão ou OCR é apresentada como limitação explícita;
- falha, pausa ou indisponibilidade do agente de documentos não afeta WhatsApp,
  qualificação ou demais rotinas da IA-SDR.

#### Processamento assíncrono confirmado

- o envio das fontes retorna imediatamente e cria um lote retomável, sem manter
  a tela ou a requisição HTTP aberta durante toda a análise;
- cada lote e cada fonte possuem estados explícitos: `aguardando`,
  `extraindo`, `verificando_privacidade`, `analisando`, `consolidando`,
  `pronto`, `falhou` e `expirado`;
- extração, proteção de dados, análise e consolidação usam checkpoints
  persistidos, permitindo retomar o trabalho sem reiniciar fontes já concluídas;
- falhas transitórias recebem até três tentativas com espera progressiva;
- o dono pode cancelar um lote ainda não aprovado, interrompendo novos trabalhos
  e iniciando a limpeza segura dos artefatos temporários;
- um mecanismo de lease impede que dois workers processem simultaneamente a
  mesma etapa ou fonte;
- fechar o navegador não interrompe o processamento; ao retornar, o dono vê o
  progresso, o histórico, os erros e as ações disponíveis;
- fontes podem terminar em estados diferentes e a falha de uma delas não
  invalida automaticamente os previews produzidos pelas demais;
- essa fila é isolada das rotinas de WhatsApp, qualificação e distribuição de
  corretores, para que documentos grandes não prejudiquem o atendimento;
- retries, cancelamentos, retomadas, duração por etapa e falhas definitivas
  ficam registrados para observabilidade e auditoria.

#### Fontes iniciais para validar somente a análise e o preview

- um tabelão de junho com múltiplos empreendimentos, unidades e preços;
- uma revista de parcerias com portfólio, materiais e links;
- um aditamento contratual relativo ao Condomínio Vitacon Domingos de Morais,
  que contém dados pessoais e deverá comprovar a proteção contra ingestão
  indevida.

Esses três documentos não estão autorizados para importação. Eles serão usados
em staging somente para validar extração, proteção de dados, organização,
detecção de conflitos e qualidade do preview. A homologação deve parar antes da
aprovação e comprovar que nenhuma tabela operacional ou base de contexto foi
alterada.

## 13. Origem e atribuição dos leads

### Confirmado

Primeiras origens:

- WhatsApp proveniente de Meta Ads;
- importação manual;
- indicação.

Origem futura:

- Google Ads;
- outras fontes configuráveis.

Sempre que os dados existirem, registrar canal, campanha, conjunto de anúncios, anúncio, identificadores externos, parâmetros de atribuição, data da primeira entrada e data da conversão.

## 14. Arquitetura de navegação proposta

### Visão geral

- painel executivo;
- tarefas e alertas;
- indicadores do funil;
- reuniões próximas;
- follow-ups vencidos;
- desempenho da IA e dos corretores.

### Operação

- Caixa de entrada;
- Leads;
- Pipeline;
- Agenda;
- Follow-ups.

### Comercial

- Imóveis;
- Oportunidades compatíveis;
- Corretores e equipe;
- Propostas, contratos e vendas, conforme a evolução das versões.

### Aquisição

- Fontes;
- Campanhas;
- Atribuição;
- Importações.

### Inteligência

- Comportamento da IA;
- Perguntas de qualificação;
- Base de conhecimento;
- Simulador de conversa;
- histórico de decisões e consumo.

### Automações

- cadências de follow-up;
- regras de transição;
- distribuição;
- lembretes e alertas.

### Relatórios

- funil;
- atendimento;
- qualificação;
- reuniões;
- corretores;
- vendas e faturamento;
- origem e campanha.

### Configurações

- empresa;
- usuários e permissões;
- integrações;
- motivos e categorias;
- segurança e auditoria.

O visual escuro com identidade violeta será mantido, mas a arquitetura da informação será redesenhada.

## 15. Métricas iniciais

### Aquisição

- leads por origem, campanha e período;
- custo por lead quando o custo estiver disponível;
- taxa de duplicidade e importação.

### IA e qualificação

- tempo até primeira resposta;
- taxa de resposta do lead;
- taxa de qualificação concluída;
- tempo médio de qualificação;
- perguntas com maior abandono;
- campos confirmados e campos de baixa confiança;
- taxa de transbordo para humano;
- follow-ups enviados e recuperações.

### Reuniões

- qualificado para reunião;
- reunião solicitada e agendada;
- tempo até agendamento;
- comparecimento;
- ausência;
- cancelamento e reagendamento;
- reunião realizada por corretor.

### Comercial

- proposta enviada;
- proposta para negociação;
- contrato enviado e assinado;
- venda;
- perda por motivo;
- tempo em cada etapa;
- conversão total e por corretor.

### Financeiro

Será definido se o painel mede valor total do imóvel, receita/comissão da empresa, valores recebidos ou todos eles como métricas separadas.

## 16. Roadmap preliminar

### Fase 0 — Produto e fundação

- fechar conceitos e regras neste documento;
- mapear o modelo de dados atual e o modelo-alvo;
- definir arquitetura de navegação;
- definir perfis e permissões;
- definir eventos, estados e transições;
- desenhar os fluxos antes de implementar;
- planejar migração gradual do WACRM sem interromper funções úteis.

### Versão 1 — Núcleo operacional

- dono e corretor;
- leads, inbox e pipeline orientados a eventos;
- perguntas configuráveis;
- prompt em camadas;
- IA-SDR de qualificação;
- transcrição de áudio;
- compatibilidade com imóveis e resumo para o corretor;
- follow-up controlado;
- registro das ações humanas;
- grade configurável de horários garantidos e capacidade;
- reunião principal registrada, com reserva automática nos períodos garantidos;
- distribuição interna e aceite do corretor pelo dashboard ou WhatsApp;
- acompanhamento manual estruturado de reunião, proposta, negociação, contrato, venda e perda;
- auditoria;
- painel operacional e métricas essenciais;
- Meta Ads/WhatsApp, importação manual e indicação como origens.

### Versão 1.1 — Estabilização pós-lançamento

- roteamento avançado;
- fila de rejeições e transferências;
- alertas, SLAs e exceções;
- relatórios aprofundados;
- melhor atribuição de campanhas;
- simulador e avaliação da IA;
- controles de qualidade e reprocessamento.

### Versão 2 — Agenda, automação e aquisição

- conexão individual dos corretores;
- disponibilidade por corretor;
- gestão centralizada;
- agendamento automático;
- conflito, cancelamento, ausência e reagendamento;
- lembretes;
- múltiplas oportunidades históricas por contato;
- atribuição aprofundada de Meta Ads;
- entrada de leads por Google Ads;
- automações e SLAs mais sofisticados;
- relatórios operacionais avançados.

### Versão 3 — Jornada comercial e financeira

- geração e envio de proposta;
- acompanhamento detalhado de negociação;
- documentos, contrato e assinatura eletrônica;
- confirmação integrada de venda;
- faturamento, comissão e recebimentos;
- métricas financeiras e de atribuição;
- previsões e metas comerciais;
- integrações comerciais e financeiras adicionais;
- suporte completo a recompra e jornadas comerciais recorrentes.

### Versão 4 — Inteligência e escala operacional

- otimização de distribuição com base em capacidade e desempenho;
- avaliação contínua da qualidade da IA e experimentos controlados de prompt;
- inteligência preditiva para risco de abandono, comparecimento e conversão;
- coaching e resumos de desempenho para corretores;
- integrações automáticas com catálogos e condições das incorporadoras;
- novos canais de entrada e atendimento;
- pós-venda, indicação e reativação;
- camada avançada de BI, metas e previsões;
- expansão da equipe e novos perfis sem transformar o produto em SaaS multiempresa.

As versões representam horizontes de complexidade, não compromissos imutáveis. Cada versão passará por uma rodada própria de descoberta antes da implementação e poderá incorporar necessidades ainda desconhecidas.

## 17. Decisões pendentes

### Produto e funil da Versão 1

- fechar nomes, ordem e critérios de entrada e saída de cada etapa;
- definir estados paralelos de atenção, reunião e situação comercial;
- definir reabertura, duplicidade e mesclagem de contatos;
- definir motivos padronizados de perda e regras para correção pelo dono;
- definir os fatos mínimos de proposta, negociação, contrato e venda que serão registrados manualmente.

### IA e qualificação da Versão 1

- definir opções normalizadas para urgência e preferência por imóvel na planta ou pronto;
- definir textos, prioridades, condições e confirmações das perguntas;
- definir regras de transbordo, baixa confiança e recuperação de erro;
- definir cadência de follow-up, limites, horários e condições de encerramento;
- definir política de áudio, transcrição e retenção;
- definir publicação, versionamento e simulador das configurações da IA;
- definir métricas de qualidade e custo da IA.

### Imóveis e matching da Versão 1

- fechar todos os campos do empreendimento e das opções comerciais;
- definir validade, atualização e aviso de condição desatualizada;
- definir filtros obrigatórios, pontuação e tratamento de dados ausentes;
- definir exatamente o que o lead pode ouvir e o que somente o corretor pode ver;
- definir importação, edição e desativação dos empreendimentos;
- fechar categorias, limites e formatos aceitos pela biblioteca de mídias;
- definir política de publicação, substituição, arquivamento e retenção dos arquivos;
- definir quais mídias podem ser usadas pela IA e enviadas ao lead.

### Agenda e corretores da Versão 1

- definir duração, intervalo, antecedência e horizonte de agendamento;
- definir capacidade e cobertura dos horários garantidos;
- definir prazo de aceite, redistribuições e escalonamento para o dono;
- definir motivos de rejeição, transferência, ausência e indisponibilidade;
- definir verificação e permissões do WhatsApp dos corretores;
- definir cancelamento, ausência, reagendamento e exceções;
- definir quais notificações aparecem no painel e quais são enviadas por WhatsApp.

### Dashboard e experiência da Versão 1

- fechar arquitetura de navegação do dono e do corretor;
- definir painel inicial, central de atenção e prioridades;
- desenhar inbox, lead, pipeline, agenda, imóveis, IA, relatórios e configurações;
- definir experiência móvel dos corretores;
- definir indicadores, filtros, períodos e regras de cálculo;
- prototipar e aprovar os fluxos antes da implementação visual.

### Dados, segurança e operação da Versão 1

- definir permissões e políticas de acesso de cada perfil;
- definir auditoria, retenção, exportação e exclusão de dados;
- definir LGPD, consentimentos e tratamento de mídia;
- garantir idempotência, filas, tentativas e prevenção de reservas duplicadas;
- definir monitoramento da IA, UAZAPI e tarefas assíncronas;
- definir resposta a falhas, contingência humana e recuperação;
- definir estratégia de migração das estruturas herdadas do WACRM;
- criar critérios de aceite, cenários de teste e checklist de lançamento.

### Definições reservadas para versões futuras

- regras detalhadas do Google Agenda e sincronização bidirecional;
- modelo de proposta, documentos, contrato e assinatura;
- conceito financeiro de faturamento, comissão e recebimento;
- atribuição avançada, Google Ads e novas origens;
- múltiplas oportunidades e recompra;
- indicadores e metas avançadas por corretor;
- inteligência preditiva, integrações de incorporadoras e expansão de canais.

## 18. Governança deste documento

- registrar decisões como confirmadas somente após validação explícita;
- manter propostas separadas de decisões;
- atualizar o documento antes de implementar uma mudança relevante de escopo;
- ligar futuras especificações de tela, banco e automação às seções correspondentes;
- evitar duplicar estas regras em uma skill; uma futura skill do Studiosp deverá consultar este documento como fonte de verdade.

## 19. Estado da promoção da V1 em 24/07/2026

- a V1 homologada em `codex/v1-platform` foi promovida para `main`;
- as migrações finais foram aplicadas ao projeto Supabase Studiosp de produção;
- o inbox passou a projetar somente mensagens da conexão atual do WhatsApp, sem apagar o histórico anterior;
- o scheduler foi validado no staging e configurado com credenciais próprias em produção;
- a oferta inicial ao corretor inclui o resumo do interesse do lead;
- o agente documental permanece dentro de Empreendimentos e exige preview e aprovação do dono antes da persistência;
- o relatório técnico da promoção está em `docs/RELATORIO_PROMOCAO_V1_PRODUCAO_2026-07-24.md`.

## 20. Reativação de base

### Confirmado

- o dono importa CSV ou XLSX com nome, número, e-mail opcional, objetivo
  principal e valor de entrada;
- dados incompletos são aceitos quando existe telefone válido;
- campanhas podem separar moradia, investimento e faixas de entrada;
- o primeiro contato reconhece a conversa anterior e confirma os dados
  conhecidos antes de seguir a qualificação normal;
- a cadência inicial é D0, D2, D5 e D9;
- resposta, opt-out, pausa ou cancelamento interrompem mensagens futuras;
- após a resposta, qualificação, matching, agendamento e fila de corretores
  reutilizam o núcleo operacional da IA-SDR;
- somente o dono administra importações e campanhas;
- desenvolvimento e homologação acontecem na branch integrada
  `feature/reactivacao-leads` e no Supabase staging.

## 21. Importação de histórico do WhatsApp

### Confirmado em 24/07/2026

- a importação é uma ação do Dono em **Configurações**, não uma carga técnica
  executada fora do produto;
- o JSONL passa por upload privado, prévia obrigatória e confirmação explícita;
- contatos reconhecidos no backup entram com automações suprimidas;
- mensagens novas desses contatos continuam visíveis no inbox, mas não acionam
  IA, fluxos, follow-ups ou criação automática de oportunidade;
- mensagens importadas são dados históricos, nunca instruções ou fonte de
  condição comercial atual;
- o contexto da IA possui uma fronteira explícita por conversa;
- a importação é idempotente, retomável e não cria oportunidades;
- a reativação de contatos é uma feature separada e não faz parte desta
  entrega;
- a implementação foi integrada à branch `feature/reactivacao-leads` e
  permanece no Supabase Staging até homologação e autorização expressa para
  promoção.
