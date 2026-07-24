# Especificação da Versão 1 — Studiosp

> Baseline executável de produto, UX e arquitetura. Este documento transforma o Plano Mestre em decisões implementáveis. Parâmetros operacionais indicados como padrão serão configuráveis pelo dono; regras de segurança e integridade são invariáveis.

Contrato técnico relacionado: [Modelo de Dados Executável da V1](./MODELO_DADOS_V1_STUDIOSP.md).

## 1. Resultado esperado

A Versão 1 entrega uma plataforma operacional completa para:

- receber leads pelo WhatsApp conectado via UAZAPI;
- registrar Meta Ads, importação manual e indicação como origem;
- atender e qualificar por IA, incluindo mensagens de áudio;
- normalizar respostas e manter histórico;
- encontrar empreendimentos aderentes sem recomendar um imóvel específico ao lead;
- oferecer e reservar horários garantidos;
- distribuir a reunião para corretores pelo dashboard ou WhatsApp;
- acompanhar a jornada até proposta, negociação, contrato, venda ou perda;
- mostrar pendências, desempenho e conversões para o dono;
- dar ao corretor uma experiência simples e prioritariamente móvel;
- auditar ações humanas, da IA e das integrações.

## 2. Fora do escopo

Não fazem parte da V1:

- sincronização com Google Agenda;
- geração de proposta ou contrato;
- assinatura eletrônica;
- cálculo completo de comissão e recebimentos;
- recomendação de unidade específica ao lead;
- estoque de unidades;
- múltiplas oportunidades simultâneas por contato;
- Google Ads;
- produto SaaS multiempresa;
- editor visual irrestrito de automações;
- autonomia da IA para negociar ou confirmar fatos humanos.

## 3. Decisões estruturais

### 3.1 Contato, oportunidade e conversa

- Contato representa a pessoa e permanece ao longo do tempo.
- Oportunidade representa a intenção de compra atual.
- Na V1, um contato possui no máximo uma oportunidade ativa.
- Conversa representa o canal e o histórico de mensagens.
- Uma oportunidade pode estar ligada à conversa principal do WhatsApp.
- O modelo admite oportunidades históricas futuras sem expor essa complexidade na V1.

### 3.2 Atores

- Dono: controle integral.
- Corretor: operação dos leads atribuídos.
- Gestor de operação: preparado no modelo, oculto na V1.
- Analista de leitura: preparado no modelo, oculto na V1.
- IA-SDR: conversa com leads.
- IA de operação: conversa com corretores e executa ações controladas.
- Sistema: regras, filas, integrações e transições determinísticas.

### 3.3 Papéis técnicos herdados

Os papéis atuais permanecem no banco durante a V1:

| Papel técnico | Nome na interface | Uso |
|---|---|---|
| owner | Dono | acesso integral |
| admin | Gestor de operação | preparado para delegação |
| agent | Corretor | operação dos leads atribuídos |
| viewer | Analista | somente leitura |

Na primeira entrega, a interface oferece apenas Dono e Corretor.

## 4. Máquina de estados

### 4.1 Etapa principal

| Código | Rótulo | Entrada |
|---|---|---|
| received | Lead recebido | contato e oportunidade criados |
| contacting | Primeiro contato | primeira tentativa de atendimento |
| qualifying | Em qualificação | primeira pergunta de qualificação enviada ou respondida |
| qualified | Qualificado | todos os campos obrigatórios confirmados |
| awaiting_schedule | Aguardando agendamento | IA iniciou coleta ou oferta de horário |
| meeting_scheduled | Reunião agendada | reserva válida criada |
| meeting_completed | Reunião realizada | fato informado após o horário |
| proposal_sent | Proposta enviada | corretor registra envio |
| negotiating | Em negociação | corretor registra negociação |
| contract_pending | Contrato/assinatura | contrato informado como enviado ou aguardando assinatura |
| won | Venda realizada | venda confirmada por humano autorizado |
| lost | Perdido | perda registrada com motivo |

### 4.2 Estados paralelos

#### Atenção

- no_action;
- awaiting_lead;
- followup_scheduled;
- followup_due;
- awaiting_broker;
- broker_sla_expired;
- owner_attention;
- human_takeover;
- ai_processing;
- integration_error.

#### Reunião

- not_started;
- collecting_preference;
- slot_proposed;
- reserved;
- confirmed;
- completed;
- no_show;
- cancelled;
- reschedule_requested.

#### Comercial

- no_proposal;
- proposal_sent;
- negotiating;
- contract_sent;
- awaiting_signature;
- signed;
- won;
- lost.

### 4.3 Eventos

Toda mudança relevante nasce de um evento imutável:

- lead_received;
- contact_attempted;
- qualification_started;
- qualification_answered;
- qualification_completed;
- schedule_preference_recorded;
- slot_proposed;
- appointment_reserved;
- broker_offer_sent;
- broker_accepted;
- broker_rejected;
- broker_transfer_requested;
- appointment_confirmed;
- appointment_reschedule_requested;
- appointment_cancelled;
- meeting_completed;
- meeting_no_show;
- proposal_sent;
- negotiation_started;
- contract_sent;
- contract_signed;
- sale_confirmed;
- lead_lost;
- opportunity_reopened;
- owner_override;
- ai_handoff;
- integration_failed.

Cada evento registra conta, oportunidade, contato, conversa, ator, horário, dados anteriores, dados novos, origem, correlação e justificativa quando aplicável.

### 4.4 Regras de transição

- O usuário não move cards livremente.
- A interface oferece ações que representam fatos.
- O sistema mostra a consequência antes de confirmar.
- Reunião realizada só pode ser registrada após o horário agendado.
- O dono pode corrigir uma exceção com justificativa.
- Perda pode ocorrer em qualquer etapa não terminal e exige motivo.
- Venda e perda são terminais na V1.
- Apenas o dono reabre uma oportunidade terminal, com justificativa.
- Follow-up nunca é etapa do funil.

### 4.5 Fluxo principal

~~~mermaid
flowchart LR
  A[Lead recebido] --> B[Primeiro contato]
  B --> C[Em qualificação]
  C --> D[Qualificado]
  D --> E[Aguardando agendamento]
  E --> F[Reunião agendada]
  F --> G[Reunião realizada]
  G --> H[Proposta enviada]
  H --> I[Em negociação]
  I --> J[Contrato e assinatura]
  J --> K[Venda realizada]
  A -. perda .-> L[Perdido]
  B -. perda .-> L
  C -. perda .-> L
  D -. perda .-> L
  E -. perda .-> L
  F -. perda .-> L
  G -. perda .-> L
  H -. perda .-> L
  I -. perda .-> L
  J -. perda .-> L
~~~

## 5. Qualificação

### 5.1 Campos obrigatórios

- Objetivo: morar, investir, ambos ou não definido.
- Localização: ao menos um bairro ou região normalizada.
- Referência financeira: entrada disponível ou parcela mensal.
- Situação do imóvel: na planta, pronto ou indiferente.
- Urgência de compra.

### 5.2 Campos desejáveis

- Faixa de preço total.
- Segunda referência financeira.
- Financiamento, recursos próprios ou composição.
- Melhor período de contato, coletado na etapa de agendamento.

### 5.3 Normalização

#### Objetivo

- live;
- invest;
- both;
- unknown.

#### Situação

- off_plan;
- ready;
- indifferent.

#### Urgência

- up_to_30_days;
- one_to_three_months;
- three_to_six_months;
- six_to_twelve_months;
- over_twelve_months;
- researching.

#### Financeiro

- valores armazenados como `numeric(14,2)` no banco e tratados como decimais pela aplicação;
- moeda BRL na V1;
- entrada mínima e máxima;
- parcela mínima e máxima;
- preço total mínimo e máximo;
- texto original preservado.

#### Localização

- resposta original preservada;
- bairros normalizados ligados ao catálogo;
- regiões amplas podem mapear para vários bairros;
- a IA confirma quando houver ambiguidade.

### 5.4 Confiança

- Alta: 0,80 a 1,00; resposta confirmada automaticamente quando não ambígua.
- Média: 0,55 a 0,79; resposta provisória e confirmação natural.
- Baixa: abaixo de 0,55; não conclui o campo e pergunta novamente.
- Campos obrigatórios precisam estar confirmados para concluir a qualificação.

### 5.5 Perguntas configuráveis

O dono pode:

- editar o texto e a orientação das perguntas;
- alterar prioridade e ordem;
- configurar opções permitidas;
- adicionar perguntas personalizadas;
- criar condições de exibição;
- desativar perguntas personalizadas;
- testar em simulador;
- salvar rascunho;
- publicar versão;
- restaurar versão anterior.

Os cinco objetivos mínimos da qualificação permanecem invariáveis. O dono pode mudar como são perguntados, mas não remover o dado necessário.

## 6. IA

### 6.1 Camadas do contexto

1. Regras invariáveis de segurança e ferramentas.
2. Política e tom configurados pelo dono.
3. Perguntas e critérios publicados.
4. Estado estruturado da oportunidade.
5. Histórico recente da conversa.
6. Empreendimentos e horários retornados por ferramentas.
7. Saída estruturada e resposta ao usuário.

### 6.2 Capacidades

A IA pode:

- conversar em português do Brasil;
- transcrever áudio;
- interpretar respostas;
- normalizar dados;
- pedir esclarecimento;
- escolher a próxima pergunta;
- responder dúvidas cobertas pela base;
- retornar ao roteiro após uma digressão;
- iniciar follow-up configurado;
- consultar matching;
- solicitar preferência de horário;
- consultar slots;
- criar uma reserva por ferramenta;
- resumir o lead;
- encaminhar para humano.

A IA não pode:

- negociar;
- oferecer desconto;
- recomendar empreendimento específico ao lead;
- afirmar preço ou condição não validada;
- marcar reunião sem reserva válida;
- declarar reunião realizada;
- declarar proposta enviada;
- declarar contrato assinado;
- declarar venda ou perda;
- alterar dados financeiros;
- apagar histórico;
- burlar capacidade, acesso ou auditoria.

### 6.3 Ferramentas controladas

- load_lead_context;
- record_qualification_answer;
- confirm_qualification_answer;
- list_property_matches;
- list_available_slots;
- reserve_guaranteed_slot;
- create_provisional_hold;
- send_lead_message;
- send_broker_offer;
- record_broker_response;
- create_attention_item;
- handoff_to_human.

A IA nunca escreve livremente nas tabelas. Cada ferramenta valida identidade, estado, permissão e concorrência.

### 6.4 Saída por turno

Cada execução produz:

- mensagem para o destinatário;
- respostas extraídas;
- confiança;
- campos ainda pendentes;
- próxima ação;
- ferramentas solicitadas;
- necessidade de humano;
- justificativa interna;
- versão do prompt;
- modelo e consumo.

### 6.5 Áudio

1. Receber mídia.
2. Registrar mensagem e metadados.
3. Baixar com acesso controlado.
4. Transcrever.
5. Guardar transcrição e confiança.
6. Exibir áudio e transcrição.
7. Processar como texto.
8. Permitir reprocessamento.
9. Confirmar dados ambíguos.

Falha de transcrição não bloqueia o atendimento: a IA pede que o lead repita em texto ou novo áudio.

## 7. Follow-up

### 7.1 Padrão inicial

- tentativa 1: 2 horas após a última pergunta sem resposta;
- tentativa 2: 24 horas;
- tentativa 3: 72 horas;
- tentativa 4: 7 dias;
- depois: inativo por ausência de resposta, sem marcar como perdido.

### 7.2 Regras

- Primeiro atendimento responde imediatamente, inclusive fora da janela de follow-up.
- Follow-ups respeitam o horário configurado pelo dono.
- Padrão sugerido: 09h às 20h no fuso America/Sao_Paulo.
- Tentativa que cair fora da janela é adiada para a próxima janela.
- Resposta do lead cancela follow-ups pendentes.
- Handoff humano pausa follow-up da IA.
- Opt-out bloqueia mensagens futuras.
- Uma execução possui chave idempotente para não duplicar envio.
- O dono pode configurar tempos, limite, textos e canais.

## 8. Empreendimentos

### 8.1 Entidades

#### Incorporadora

- nome;
- nome normalizado;
- descrição;
- site;
- contatos opcionais;
- status ativo;
- logotipo opcional.

#### Bairro

- nome;
- cidade;
- estado;
- região opcional;
- aliases para normalização;
- status ativo.

#### Empreendimento

- incorporadora;
- nome;
- código interno;
- descrição;
- bairro e endereço;
- coordenadas opcionais;
- situação: na planta, pronto ou ambos;
- previsão de entrega;
- diferenciais;
- status rascunho, publicado, pausado ou arquivado;
- validade das condições;
- observações internas;
- dados para a base de conhecimento.

#### Opção comercial

- empreendimento;
- rótulo;
- metragem;
- preço de referência;
- entrada de referência;
- parcela média;
- prazo ou observação da condição;
- situação;
- validade;
- status ativo;
- ordem.

Não existe unidade individual na V1.

### 8.2 Publicação

- Rascunhos não entram no matching.
- Empreendimento publicado precisa ter bairro, incorporadora e ao menos uma opção ativa.
- Condição vencida não entra na contagem informada ao lead.
- Corretor pode visualizar condição vencida com aviso, sem usá-la como promessa.
- Toda edição registra autor e horário.

### 8.3 Agente de análise documental

O dono inicia `Analisar documentos com IA` dentro de Empreendimentos. O fluxo
retomável possui Fontes, Processamento, Preview e Aprovação. Upload ou link
compartilhado cria um lote isolado; análise e conversa nunca escrevem no
catálogo nem na base da IA-SDR.

Estados do lote e de cada fonte:

```text
awaiting, extracting, privacy_check, analyzing, consolidating,
ready, failed, cancelled, expired
```

Regras obrigatórias:

- somente dono ou administrador acessa lote, fonte, preview ou conversa;
- o arquivo entra em quarentena privada e é validado por tamanho, extensão,
  MIME e assinatura;
- extração e detecção de PII acontecem antes do provedor externo;
- somente fragmentos higienizados podem sair do ambiente controlado;
- documento que não puder ser higienizado com segurança é bloqueado;
- cada campo proposto guarda fonte, página ou trecho e confiança;
- duplicidade e conflito nunca são resolvidos automaticamente;
- refinamento conversacional cria nova versão recuperável do preview;
- aprovação revalida identidade, conta, role, estado e versão no servidor;
- aprovação é transacional e granular, mas publicar para corretores e indexar
  para a IA continuam desativados;
- lote não aprovado expira em 30 dias e nunca modifica tabelas operacionais.

Limites iniciais: 50 MB por arquivo, 20 arquivos e 250 MB por lote, 300 páginas
por documento e três tentativas com espera progressiva. O processamento usa
checkpoints, lease e fila separada das rotinas de WhatsApp.

## 9. Biblioteca de mídias

### 9.1 Tipos

- image;
- video;
- document;
- floor_plan;
- presentation.

### 9.2 Categorias iniciais

- facade;
- common_areas;
- interiors;
- floor_plans;
- location;
- presentation;
- documents;
- videos;
- custom.

### 9.3 Upload

- pasta completa;
- múltiplos arquivos;
- arquivo compactado como alternativa;
- pré-visualização antes da publicação;
- progresso individual e geral;
- retomada para arquivos grandes;
- repetição apenas das falhas;
- identificação de duplicidade por hash;
- categorias sugeridas por nome de subpasta;
- edição em lote;
- capa e ordem;
- vínculo opcional com opção comercial.

### 9.4 Armazenamento

- Bucket privado.
- Objeto em caminho único por conta, empreendimento, mídia e versão.
- Metadados relacionais no banco.
- Sem sobrescrever o mesmo caminho.
- Substituição cria nova versão lógica.
- Arquivamento recuperável antes da remoção física.
- URLs temporárias para corretores e integrações.
- A IA recebe apenas mídias publicadas e autorizadas.

### 9.5 Acesso

- Dono: criar, editar, publicar, arquivar e excluir após retenção.
- Corretor: ler mídias publicadas de empreendimentos ativos.
- IA: consultar metadados e gerar acesso temporário por ferramenta.

## 10. Matching

### 10.1 Elegibilidade

Somente entra no matching:

- empreendimento publicado e ativo;
- opção comercial ativa;
- condição dentro da validade;
- dados mínimos completos.

### 10.2 Pontuação padrão

| Critério | Peso |
|---|---:|
| localização | 30 |
| entrada e parcela | 30 |
| faixa de preço total | 10 |
| na planta ou pronto | 20 |
| urgência e entrega | 10 |

Pontuação mínima inicial: 60 de 100.

### 10.3 Regras

- Campo ausente não elimina automaticamente.
- Divergência explícita reduz pontuação.
- Localização exata vale mais que região próxima.
- Entrada, parcela e preço são avaliados separadamente.
- Matching só é apresentado ao lead após qualificação mínima.
- Lead recebe apenas a quantidade de oportunidades.
- Corretor recebe lista, pontuação, critérios e resumo.
- Cada execução registra versão do algoritmo e condições usadas.

## 11. Agendamento

### 11.1 Padrões

- duração: 10 minutos;
- intervalo de segurança: 5 minutos;
- antecedência mínima: 2 horas;
- horizonte: 7 dias;
- fuso: America/Sao_Paulo;
- capacidade: definida por janela garantida.

Todos são configuráveis pelo dono dentro de limites válidos.

### 11.2 Horário garantido

- Representa compromisso da empresa.
- Precisa ter capacidade e cobertura válidas.
- A IA oferece somente slots retornados pela ferramenta.
- Quando o lead aceita, a reserva consome capacidade atomicamente.
- Após sucesso, a IA confirma imediatamente ao lead.
- A escolha do corretor acontece internamente.

### 11.3 Horário provisório

- Permitido somente se o dono ativar horários fora da grade garantida.
- A mensagem deve afirmar que a reserva é provisória.
- Exige confirmação antes de se tornar reunião agendada.
- Nunca substitui a modalidade garantida quando existe capacidade.

### 11.4 Fluxo

~~~mermaid
sequenceDiagram
  participant L as Lead
  participant IA as IA-SDR
  participant S as Sistema
  participant C as Corretor
  participant D as Dono
  L->>IA: Prefiro terça à tarde
  IA->>S: list_available_slots
  S-->>IA: 14h30 e 15h
  IA->>L: Qual horário funciona melhor?
  L->>IA: 15h
  IA->>S: reserve_guaranteed_slot
  S-->>IA: Reserva confirmada
  IA->>L: Reunião confirmada para terça às 15h
  S->>C: Oferta pelo WhatsApp e dashboard
  alt Corretor aceita
    C->>S: Aceitar
    S-->>C: Atribuição confirmada
  else Sem resposta ou rejeição
    S->>C: Próximo corretor elegível
    S->>D: Escalonar se a fila esgotar
  end
~~~

## 12. Corretores e WhatsApp operacional

### 12.1 Cadastro

- usuário;
- nome;
- WhatsApp em formato E.164;
- verificação do número;
- status ativo;
- disponibilidade semanal;
- exceções;
- capacidade;
- prioridade de roteamento;
- indisponibilidade temporária;
- preferências de notificação.

### 12.2 Oferta de reunião

Mensagem contém:

- código curto da reserva;
- data e horário;
- duração;
- prazo de resposta;
- ações possíveis;
- sem dados sensíveis do lead antes do aceite.

### 12.3 Ações permitidas

- aceitar;
- rejeitar com motivo;
- sugerir outro horário;
- solicitar transferência;
- informar indisponibilidade;
- abrir link autenticado do resumo.

### 12.4 SLA padrão

- Corretor 1: 15 minutos.
- Corretor 2: mais 15 minutos.
- Depois: alerta ao dono.
- Quantidade e prazos são configuráveis.
- Fora do período operacional, o SLA segue a política definida para a cobertura garantida.

### 12.5 Segurança

- Número precisa estar verificado e em lista interna.
- Conversa de corretor usa prompt e ferramentas diferentes do SDR.
- Texto natural é convertido em intenção estruturada.
- Mudanças críticas recebem confirmação de retorno.
- Venda, valores, configurações e dados de outros leads exigem dashboard.
- Um código de reserva desfaz ambiguidade quando houver várias ofertas.

### 12.6 Sugestão de outro horário

- Não altera o combinado com o lead.
- O sistema tenta outro corretor para preservar o horário.
- Apenas sem cobertura vira contraproposta.
- A IA solicita aceite do lead antes de reagendar.

## 13. Navegação da V1

### 13.1 Dono

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

### 13.2 Corretor

- Meu dia
- Caixa de entrada
- Meus leads
- Agenda
- Empreendimentos
- Perfil e disponibilidade

### 13.3 Elemento global

Central de atenção:

- follow-up vencido;
- corretor sem aceite;
- integração com erro;
- reunião próxima sem responsável;
- condição comercial vencida;
- transcrição com falha;
- lead aguardando humano;
- ação comercial atrasada.

Notificações deixam de ser um item principal separado.

## 14. Especificação das telas

### 14.1 Visão geral do dono

Blocos:

- Central de atenção no topo.
- Leads recebidos, qualificados, agendados, reuniões realizadas e vendas.
- Conversão entre etapas.
- Tempo de primeira resposta.
- Reuniões de hoje.
- Follow-ups vencidos.
- Desempenho da IA.
- Distribuição por corretor.
- Origem dos leads.
- Funil por período.

Filtros:

- hoje;
- 7 dias;
- 30 dias;
- intervalo personalizado;
- origem;
- corretor;
- empreendimento.

### 14.2 Meu dia do corretor

- próxima reunião;
- reuniões de hoje;
- ofertas aguardando aceite;
- leads que exigem ação;
- propostas e negociações pendentes;
- alertas de transferência;
- botão para indisponibilidade temporária.

### 14.3 Caixa de entrada

Desktop:

- lista de conversas;
- histórico e compositor;
- contexto operacional do lead.

Painel de contexto:

- etapa;
- atenção;
- progresso da qualificação;
- respostas estruturadas;
- resumo;
- reunião;
- corretor;
- matching;
- ações humanas.

Mobile:

- lista, conversa e detalhe em telas sequenciais;
- retorno preserva posição;
- ação principal fixa;
- áreas de toque de ao menos 44px.

### 14.4 Leads

Lista com:

- nome e telefone;
- origem;
- etapa;
- atenção;
- qualificação;
- responsável;
- próxima ação;
- prazo;
- reunião;
- última mensagem.

Filtros salvos:

- aguardando resposta;
- follow-up vencido;
- qualificados sem reunião;
- reuniões de hoje;
- sem corretor;
- proposta pendente;
- negociação;
- perdidos;
- vendidos.

### 14.5 Detalhe do lead

Cabeçalho:

- identidade;
- etapa;
- responsável;
- próxima ação;
- ações humanas.

Abas:

- Visão geral;
- Conversa;
- Qualificação;
- Reunião;
- Empreendimentos;
- Comercial;
- Histórico.

### 14.6 Pipeline

- Colunas fixas nas etapas canônicas.
- Cards mostram nome, responsável, atenção, prazo e reunião.
- Sem arraste livre na V1.
- Clique abre detalhe e ações válidas.
- Dono pode aplicar exceção com justificativa.
- Follow-up é badge e filtro, não coluna.

### 14.7 Agenda

- calendário e lista;
- grade de cobertura;
- capacidade por intervalo;
- reuniões confirmadas;
- reuniões sem corretor;
- cancelamentos e reagendamentos;
- filtros por corretor e status;
- editor de horários garantidos para o dono.

### 14.8 Follow-ups

- programados;
- vencidos;
- recuperados;
- pausados;
- inativos sem resposta;
- cadência aplicada;
- próxima tentativa;
- opção de pausar, retomar ou encaminhar.

### 14.9 Empreendimentos

Lista:

- capa;
- nome;
- incorporadora;
- bairro;
- situação;
- opções ativas;
- validade;
- status;
- mídia;
- matching recente.

Editor em etapas:

1. Identificação.
2. Localização.
3. Opções comerciais.
4. Descrição e conhecimento.
5. Mídias.
6. Revisão e publicação.

### 14.10 Biblioteca de mídias

- área de arrastar pasta;
- fila de upload;
- filtros por categoria;
- grade e lista;
- seleção múltipla;
- edição em lote;
- capa;
- ordem;
- visibilidade;
- erros e repetição;
- revisão antes de publicar.

### 14.11 Equipe

- corretores ativos;
- WhatsApp verificado;
- disponibilidade;
- cobertura;
- carga;
- ofertas pendentes;
- rejeições e transferências;
- motivos;
- desempenho operacional.

### 14.12 Inteligência

Comportamento:

- identidade;
- tom;
- contexto;
- frases proibidas;
- transbordo;
- fechamento da qualificação.

Perguntas:

- construtor;
- tipo;
- opções;
- ordem;
- obrigatoriedade;
- condições;
- vínculo canônico.

Publicação:

- rascunho;
- validação;
- comparação de versão;
- simulador;
- publicar;
- restaurar.

### 14.13 Relatórios

- aquisição;
- qualificação;
- reuniões;
- corretores;
- comercial;
- IA;
- exportação CSV;
- definições de cada métrica visíveis.

### 14.14 Configurações

- empresa;
- usuários e permissões;
- WhatsApp do lead;
- WhatsApp dos corretores;
- agenda e horários garantidos;
- follow-up;
- motivos e categorias;
- integrações;
- segurança;
- auditoria.

## 15. Métricas

### 15.1 Aquisição

- leads recebidos;
- leads por origem;
- leads por campanha quando disponível;
- duplicidade;
- importações.

### 15.2 Atendimento

- tempo até primeira resposta;
- conversas respondidas;
- mensagens da IA;
- transbordos;
- erros;
- opt-outs.

### 15.3 Qualificação

- iniciadas;
- concluídas;
- taxa de conclusão;
- tempo de qualificação;
- abandono por pergunta;
- campos provisórios;
- baixa confiança.

### 15.4 Reunião

- preferência coletada;
- agendada;
- tempo até agendamento;
- confirmada;
- realizada;
- ausência;
- cancelamento;
- reagendamento;
- reunião por corretor.

### 15.5 Comercial

- proposta enviada;
- negociação;
- contrato;
- venda;
- perda por motivo;
- tempo por etapa;
- conversão por corretor.

Na V1, valor de venda pode ser registrado manualmente como valor bruto do imóvel. Não será apresentado como faturamento ou comissão.

## 16. Modelo de dados alvo

### 16.1 Identidade e operação

- accounts, mantida como fronteira de segurança;
- profiles;
- contacts;
- conversations;
- messages;
- opportunities;
- opportunity_events;
- attention_items;
- audit_events.

### 16.2 Qualificação e IA

- qualification_questions;
- qualification_question_options;
- qualification_answers;
- ai_config_versions;
- ai_runs;
- ai_tool_calls;
- audio_transcriptions;
- followup_policies;
- followup_executions.

### 16.3 Empreendimentos

- developers;
- neighborhoods;
- neighborhood_aliases;
- developments;
- development_offers;
- development_media;
- development_media_versions;
- property_match_runs;
- property_match_results.

### 16.4 Agenda

- broker_profiles;
- scheduling_policies;
- guaranteed_windows;
- availability_exceptions;
- appointments;
- appointment_events;
- assignment_offers;
- broker_operational_conversations.

### 16.5 Restrições importantes

- account_id obrigatório em toda entidade de negócio.
- Uma oportunidade ativa por contato na V1.
- Um evento possui chave idempotente de origem.
- Provider message id único por conexão.
- Uma reserva respeita capacidade por transação atômica.
- Uma capa ativa por empreendimento.
- Uma resposta atual por pergunta e oportunidade, com histórico.
- Registro de auditoria append-only.
- Exclusão preferencialmente lógica para entidades operacionais.

## 17. Segurança

- RLS em tabelas expostas.
- Políticas combinam autenticação e conta.
- Dono administra configurações e catálogo.
- Corretor lê catálogo ativo e opera apenas leads atribuídos ou filas permitidas.
- IA e webhooks escrevem por rotas servidoras controladas.
- Chave service role nunca chega ao cliente.
- WhatsApp do corretor não autoriza ações financeiras.
- URLs de Storage são privadas e temporárias.
- Dados sensíveis não são enviados antes do aceite do corretor.
- Funções privilegiadas ficam fora do schema exposto quando necessário.
- Toda exceção do dono é auditada.

## 18. Processamento assíncrono

Filas lógicas:

- mensagens recebidas;
- geração de resposta;
- transcrição;
- follow-up;
- sincronização de conhecimento;
- matching;
- criação de reserva;
- oferta ao corretor;
- mídia e derivados;
- métricas.

Requisitos:

- idempotência;
- tentativas com atraso;
- limite de tentativas;
- fila de falhas;
- alerta humano;
- correlação ponta a ponta;
- observabilidade;
- nenhum reenvio duplicado ao lead.

## 19. Migração do sistema atual

### 19.1 Manter

- autenticação;
- fronteira por conta;
- inbox e histórico;
- UAZAPI;
- base visual;
- componentes UI;
- temas;
- contatos;
- pipelines como fonte de dados temporária;
- configuração de IA e uso;
- conhecimento;
- auditoria existente útil.

### 19.2 Transformar

- Contacts vira Leads na interface.
- Deals migra para opportunities.
- Pipeline livre migra para estados canônicos e eventos.
- Products migra para developments e development_offers.
- Product media migra para biblioteca privada.
- conversation_sdr_state migra para respostas e estado consolidado.
- recommended_product_ids migra para match runs e results.
- Notifications converge para Central de atenção.
- Agents é desmembrado entre Inteligência e Empreendimentos.

### 19.3 Ocultar da navegação da V1

- Broadcasts;
- Flows;
- Automations genéricas.

O código não será removido até concluir migração e confirmar ausência de dependências.

### 19.4 Compatibilidade

- Migrações são incrementais.
- Leitura antiga permanece enquanto a nova leitura é validada.
- Escrita dupla só será usada quando indispensável e por período curto.
- Cada etapa possui rollback lógico.
- Dados existentes são preservados.

## 20. Critérios de aceite

### Cenário 1 — Cadastro de empreendimento

- Dono cria incorporadora, bairro, empreendimento e duas opções comerciais.
- Faz upload de uma pasta.
- Categoriza, escolhe capa e publica.
- Corretor visualiza.
- Rascunho não aparece no matching.

### Cenário 2 — Lead por WhatsApp

- Mensagem UAZAPI cria ou localiza contato.
- Não duplica por telefone normalizado.
- Cria oportunidade ativa e conversa.
- Origem é registrada.
- IA responde imediatamente.

### Cenário 3 — Áudio

- Áudio aparece na conversa.
- Transcrição é salva e exibida.
- Respostas são extraídas.
- Baixa confiança gera esclarecimento.

### Cenário 4 — Qualificação

- IA coleta os cinco objetivos mínimos.
- Respostas são normalizadas e auditáveis.
- Perguntas podem ocorrer fora da ordem.
- Digressão não perde o progresso.
- Qualificação concluída move a etapa.

### Cenário 5 — Matching

- Somente empreendimentos publicados e válidos entram.
- Lead recebe quantidade, sem recomendação específica.
- Corretor recebe lista, resumo e critérios.

### Cenário 6 — Agendamento garantido

- IA oferece slots reais.
- Dois leads não ocupam a mesma capacidade.
- Aceite cria reserva.
- Lead recebe confirmação imediata.

### Cenário 7 — Corretor pelo WhatsApp

- Corretor verificado recebe oferta.
- Resposta natural é interpretada.
- Aceite atribui a reunião.
- Rejeição exige motivo.
- Ausência de resposta redistribui.
- Fila esgotada alerta o dono.

### Cenário 8 — Fatos comerciais

- Corretor não registra reunião antes do horário.
- Registra reunião realizada depois.
- Registra proposta, negociação, contrato, venda ou perda.
- Sistema move etapa.
- Histórico identifica ator.

### Cenário 9 — Permissões

- Corretor não edita configurações nem catálogo.
- Dono possui acesso total.
- Dados de outra conta não são acessíveis.
- Mídias privadas exigem autorização.

### Cenário 10 — Falha

- Falha da IA não perde mensagem.
- Falha de envio não duplica resposta.
- Falha de transcrição permite repetição.
- Falha da UAZAPI cria alerta.
- Tarefa esgotada chega à Central de atenção.

### Cenário 11 — Português

- Toda string visível está em português do Brasil.
- Mensagens de erro, vazios, tooltips e acessibilidade estão traduzidos.
- Nenhum termo herdado em inglês aparece no fluxo principal.

### Cenário 12 — Responsividade

- Fluxos do corretor funcionam integralmente no celular.
- Controles possuem área de toque adequada.
- Nenhuma ação depende apenas de hover.
- Tabelas importantes possuem alternativa móvel.

## 21. Ordem de implementação

### Bloco 0 — Design e contrato

- reproduzir telas atuais no Superdesign;
- criar variações mantendo identidade;
- aprovar shell, Visão geral, Lead, Inbox e Empreendimentos;
- congelar contratos de estados e eventos.

### Bloco 1 — Fundação de dados

- oportunidades;
- eventos;
- atenção;
- perguntas e respostas;
- catálogo novo;
- agenda;
- auditoria;
- políticas de acesso.

### Bloco 2 — Shell e navegação

- navegação por perfil;
- Central de atenção;
- novas rotas;
- português integral.

### Bloco 3 — Empreendimentos e mídias

- incorporadoras;
- bairros;
- empreendimentos;
- opções;
- upload em lote;
- Storage privado;
- publicação.

### Bloco 4 — Lead e funil

- lista;
- detalhe;
- eventos humanos;
- pipeline;
- histórico;
- migração dos dados atuais.

### Bloco 5 — IA e qualificação

- configuração versionada;
- perguntas;
- normalização;
- áudio;
- follow-up;
- matching;
- simulador.

### Bloco 6 — Agenda e corretores

- grade garantida;
- reserva;
- roteamento;
- WhatsApp operacional;
- redistribuição;
- contingência.

### Bloco 7 — Dashboard e relatórios

- métricas;
- filtros;
- visão do dono;
- visão do corretor;
- exportações.

### Bloco 8 — Endurecimento e lançamento

- testes ponta a ponta;
- segurança;
- acessibilidade;
- desempenho;
- observabilidade;
- migração;
- deploy progressivo;
- checklist de produção.

## 22. Regra de decisão

Podem ser alterados pelo dono:

- horários;
- capacidade;
- prazos;
- mensagens;
- cadência;
- perguntas adicionais;
- tom;
- categorias;
- motivos;
- visibilidade operacional;
- publicação de empreendimentos.

Não podem ser desativados:

- autorização;
- auditoria;
- idempotência;
- prevenção de conflito;
- verificação do WhatsApp interno;
- separação entre prompts confiáveis e editáveis;
- confirmação de fatos humanos;
- proteção de dados;
- rastreabilidade de versões.

## 23. Definição de pronto da V1

A V1 está pronta quando os doze cenários de aceite funcionarem de ponta a ponta em produção, com dados reais controlados, sem intervenção técnica no fluxo normal e com contingência visível para toda falha relevante.
