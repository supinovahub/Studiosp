# Plano Mestre do Studiosp

> Documento vivo de produto e arquitetura. As seções marcadas como **Confirmado** representam decisões já tomadas. As seções marcadas como **Proposta** ainda precisam de validação antes da implementação.

Especificação executável da primeira entrega: [Especificação da Versão 1](./ESPECIFICACAO_V1_STUDIOSP.md).

Contrato técnico do banco: [Modelo de Dados Executável da V1](./MODELO_DADOS_V1_STUDIOSP.md).

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
- o dono precisa visualizar todas essas ocorrências e justificativas.

### Proposta de roteamento

Aplicar filtros de elegibilidade antes da distribuição:

- corretor ativo e disponível;
- dentro da janela de trabalho;
- sem bloqueio ou pausa;
- compatibilidade com região, empreendimento ou especialidade, caso essas regras sejam usadas;
- carga de trabalho aceitável.

Entre os elegíveis, usar uma distribuição equilibrada considerando:

- quantidade de leads ativos;
- última atribuição recebida;
- reuniões futuras;
- conhecimento dos imóveis compatíveis;
- taxa de rejeição ou ausência operacional, apenas como alerta e nunca como punição automática sem política clara.

Toda rejeição ou transferência deve ter um código de motivo e permitir observação. O dono terá uma fila de auditoria com volume, recorrência e impacto dessas ações.

### Confirmação pelo WhatsApp do corretor

#### Decisão confirmada

Cada corretor poderá ter um número de WhatsApp verificado no seu cadastro. A IA de operação usará esse canal para solicitar aceite, rejeição, transferência ou alternativa de horário mesmo quando o corretor não estiver com o dashboard aberto.

O número do corretor fará parte de uma lista interna verificada. Mensagens vindas desses números serão encaminhadas ao fluxo operacional de corretores, separado do atendimento SDR dos leads.

#### Fluxo recomendado

1. o lead aceita um horário garantido e recebe a confirmação imediata;
2. o sistema cria a reserva, reduz a capacidade do intervalo e inicia a distribuição interna;
3. a IA de operação envia pelo WhatsApp do corretor uma solicitação com código identificador, data, horário e duração;
4. o corretor pode aceitar, recusar, transferir ou sugerir outro horário;
5. a resposta natural é interpretada, validada contra as regras e transformada em uma ação estruturada;
6. o sistema confirma ao corretor o resultado da ação e registra tudo na auditoria;
7. se ele não responder no prazo, a mesma reserva é oferecida ao próximo corretor elegível;
8. se nenhum corretor assumir, o dono recebe um alerta crítico e a conversa entra na central de atenção humana.

Antes do aceite, a mensagem deve expor apenas o mínimo necessário sobre o lead. O resumo completo e os dados dos empreendimentos ficam disponíveis ao corretor depois da atribuição, preferencialmente no painel autenticado.

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

- pedido explícito para falar com uma pessoa;
- reclamação ou conflito;
- pergunta jurídica, contratual ou financeira fora da base validada;
- pedido de promessa ou negociação;
- baixa confiança persistente na interpretação;
- falha repetida de integração;
- situação sensível não coberta pelas regras.

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
