# Relatório de evolução operacional — 27/07/2026

## Ambiente

- Branch: `codex/v1-platform`, sincronizada com a `main`.
- Banco alterado: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`).
- Produção: não alterada.

## Implementado

1. Whitelist `AI_AUTOREPLY_ALLOWED_NUMBERS` para respostas automáticas da IA.
2. Reativação com abordagem especializada apenas em D0.
3. Cadência configurável de um a quatro contatos, entre D0 e D90.
4. Cancelamento da cadência na resposta e continuidade pela IA-SDR normal.
5. Ação `Call finalizada` com resultado, resumo, pipeline e fechamento do chat.

## Banco

- Migration `20260727103000_complete_broker_call.sql`.
- Aplicada somente em staging.
- Função `SECURITY INVOKER`, `search_path` fixo e sem execução por `anon`.

## Verificações

- 20 testes direcionados aprovados.
- TypeScript sem erros.
- Função e permissões confirmadas no staging.
- Nenhum alerta novo nos advisors.

## Avisos preexistentes

- `pg_net` no schema público.
- Funções `SECURITY DEFINER` antigas expostas.
- Proteção de senhas vazadas desativada.

## Pendências remanescentes de homologação real

- Executar um disparo controlado para um número permitido e outro bloqueado,
  validando a whitelist de ponta a ponta.
- Convidar e ativar um segundo corretor na mesma conta para homologar rejeição,
  expiração, transferência e redistribuição reais entre dois usuários.

## Correções após homologação

- A whitelist passou de variável técnica para campo visível em
  **Configurações → IA**, persistido por conta.
- O staging foi inicializado com os dois números controlados já aprovados.
- Removida a auditoria duplicada que causava `permission denied for table
audit_events` e revertia a conclusão da call.
- Criada uma oferta de reunião somente no dashboard para o corretor Arthur
  Alves Rocha aceitar manualmente, sem disparo de WhatsApp.

## Importação documental e centralização da IA

- Os PDFs Tabelão Matriz Junho, Revista ONE Parcerias e EnvelopePDF foram
  inspecionados como massa de homologação, sem aprovação ou gravação no
  catálogo.
- A extração de PDF agora preserva o marcador de página e busca todos os
  empreendimentos, em vez de resumir o portfólio.
- Imagens grandes são extraídas para a quarentena privada, limitadas a 60
  itens, 5 MB por imagem e 20 MB por fonte.
- O preview associa imagens ao empreendimento, propõe capa e categoria com
  confiança explícita e permite ao dono trocar a capa ou a categoria.
- Somente a aprovação copia as imagens para `development-media`; elas entram
  como rascunho, `owner_only`, sem publicação ou indexação automática.
- A tela Inteligência passou a concentrar também as credenciais do modelo. O
  atalho de Configurações aponta para essa rota única.
- Verificações locais: typecheck aprovado, 84 arquivos de teste e 725 testes
  aprovados, build Next.js aprovado.
- Preview Vercel `74170d7` ficou `READY` e a rota unificada de Inteligência foi
  confirmada com a conta do owner.
- Nova análise controlada da Revista ONE no staging terminou em `Preview
pronto` com 26 itens estruturados e 29 imagens editáveis.
- A troca de categoria de uma imagem foi persistida e recarregada no preview.
- O botão de aprovação ficou disponível, mas não foi acionado; o catálogo
  permaneceu com um empreendimento já existente e nenhum item da revista foi
  gravado.

### Robustez adicional da importação

- A extração de PDF passou a preservar coordenadas, reconstruir linhas e
  células e coletar links por página, além do texto linear.
- Foi criada uma camada canônica determinística depois da IA, com aliases em
  português e inglês, normalização de acentos, moeda brasileira, metragem,
  datas, endereço, listas e situação do imóvel.
- Faixas invertidas e valores comercialmente implausíveis agora geram
  inconsistências explícitas para revisão.
- A consolidação entre partes do mesmo documento mantém os índices de pai e
  inclui a identidade do empreendimento na chave das ofertas, impedindo que
  opções semelhantes de imóveis diferentes sejam unificadas.
- O prompt passou a compreender linhas posicionais e os limites `de/até` de
  preço, entrada e parcela.
- Foram adicionados testes unitários específicos para localização numérica,
  datas, acentos, aliases, proveniência, vínculo entre oferta e empreendimento
  e validações comerciais.
- Nenhum PDF de homologação foi aprovado e nenhuma escrita no catálogo foi
  autorizada durante esta evolução.
- Corrigida uma regressão em que o leitor de texto desanexava o `ArrayBuffer`
  antes da extração posicional. Texto/imagens e layout agora recebem cópias
  físicas independentes do PDF.
- O isolamento foi ampliado para três leitores independentes: texto, imagens e
  layout. Isso evita que operações sequenciais da mesma instância do `pdf.js`
  reutilizem memória transferida em runtimes serverless.
- A extração local foi executada com os três arquivos reais de homologação:
  EnvelopePDF, Revista ONE Parcerias (aproximadamente 14 MB) e Tabelão Matriz
  Junho. Os três concluíram texto, quantidade de páginas e layout sem erro de
  buffer; nenhuma aprovação ou escrita no catálogo foi realizada.
- Após o deploy `f719abf`, o lote que falhava no staging foi retomado. Tabelão
  Matriz Junho e EnvelopePDF chegaram a `Preview pronto`; Revista ONE avançou
  da extração para a análise pelo provedor. Isso comprovou no runtime da Vercel
  que o erro de `detached ArrayBuffer` foi removido nos três arquivos.
- A Revista ONE encontrou depois um timeout transitório do provedor de IA,
  posterior e independente da extração de PDF. O lote permaneceu sem aprovação
  e nenhuma escrita foi feita no catálogo.

### Processamento incremental de documentos extensos

- Criada no Supabase staging a tabela `document_analysis_chunks`, com RLS
  owner-only, índices de fila e vínculos com conta, lote e fonte.
- O conteúdo higienizado passa a ser dividido em partes de até 12 mil
  caracteres, persistidas antes das chamadas ao provedor.
- Cada ciclo do worker processa até duas partes em paralelo e salva
  imediatamente o JSON estruturado e o uso retornado.
- Timeout ou falha afeta somente a parte corrente, com até três tentativas e
  espera progressiva; partes concluídas não são reenviadas.
- A consolidação remapeia relações entre empreendimento e oferta, normaliza o
  conjunto completo e só então monta o preview e associa as mídias.
- A interface passou a mostrar `X de Y partes`, percentual e barra de
  progresso por arquivo.
- Enquanto a tela está aberta, os ciclos são solicitados sem sobreposição; com
  a tela fechada, o cron continua usando os checkpoints persistidos.
- A retomada manual passou a respeitar o lote selecionado, sem ser desviada por
  lotes antigos ainda presentes na fila da conta.
- Migration aplicada somente no projeto Studiosp Staging
  `vgmmfzdifjhpqaopxfbj`; produção permaneceu inalterada.
- Verificação local: typecheck aprovado, 85 arquivos de teste e 740 testes
  aprovados.

#### Homologação real no staging

- Deploy `5c6b18d` validado na branch `codex/v1-platform`.
- Novo lote criado com os três PDFs reais, sem aprovação e sem cadastro no
  catálogo.
- A retomada processou o lote selecionado mesmo com lotes antigos pendentes.
- `EnvelopePDF.aspx.pdf` foi dividido em 2 partes, concluiu as 2 sem falhas e
  chegou a `Preview pronto`; as chamadas de IA dos blocos terminaram em cerca
  de 6 segundos no banco.
- `Revista ONE PARCERIAS.pdf` foi dividido em 10 partes. Durante a homologação,
  a tela mostrou avanço persistente de `0 de 10` para `2 de 10` (`20%`) e o
  banco já continha 3 partes prontas enquanto a próxima seguia em análise,
  comprovando checkpoint e processamento incremental.
- Nenhuma parte falhou nesse recorte da homologação e nenhuma alteração foi
  feita no Supabase de produção.

### Abordagem dinâmica e seleção do catálogo

- A reativação passou a possuir 12 estruturas completas para D0 e quatro
  variantes por etapa posterior.
- A escolha é determinística por lead e etapa, evitando mudanças em retries e
  mantendo rastreabilidade.
- Nome, objetivo e entrada continuam personalizados, com diferentes ordens,
  saudações e perguntas finais.
- O evento de envio registra `message_variant`.
- A ativação escalona os leads em intervalos de um minuto e o worker envia
  somente uma mensagem por ciclo, evitando rajadas após atrasos.
- O preview documental ganhou decisão por item e filtro para manter somente
  studios com metragem máxima confiável de até 40 m².
- Nenhuma campanha real foi disparada durante esta alteração.

### Fechamento da seleção documental no staging

- O lote completo dos três PDFs resultou em 162 candidatos estruturados.
- Foram aprovados 14 empreendimentos com identidade e localização confiáveis,
  todos com metragem máxima de até 40 m²; 148 itens ambíguos, duplicados,
  genéricos ou fora do recorte foram rejeitados.
- Os 14 empreendimentos aprovados entraram no catálogo como `draft`. Nenhum
  deles foi publicado para corretores ou indexado automaticamente na base da
  IA.
- O filtro da interface passou a exigir identidade confiável também para itens
  do tipo empreendimento e exclui rótulos genéricos conhecidos, evitando que
  títulos de seção sejam tratados como produtos.

### Fechamento do fluxo operacional do corretor no staging

- O perfil controlado do corretor Arthur foi mantido ativo e disponível para
  receber ofertas.
- Há evidência persistida de oferta aceita, confirmação do corretor, reunião
  concluída, movimentação comercial para `proposal_sent` e fechamento da
  conversa associada.
- A ação `Call finalizada` atualizou reunião e oportunidade sem o erro anterior
  de permissão em `audit_events`.
- O teste de redistribuição real entre dois corretores continua dependendo do
  convite e aceite de um segundo usuário distinto na mesma conta. Não foi
  reutilizado nem transferido um usuário pertencente a outra conta.

### Verificações finais desta rodada

- Typecheck aprovado.
- Testes da cadência dinâmica aprovados.
- Suite completa anterior desta mesma implementação: 85 arquivos e 741 testes
  aprovados; build Next.js aprovado.
- Nenhuma campanha de reativação foi ativada e nenhuma mensagem de WhatsApp foi
  enviada nesta rodada.

### Correção do ingresso de um segundo corretor

- O cadastro direto do segundo usuário criou corretamente uma conta pessoal
  vazia e um `broker_profile` inicial.
- O primeiro resgate do convite falhou porque a chave estrangeira composta do
  perfil operacional ainda apontava para a conta pessoal durante a mudança do
  perfil.
- A função `redeem_invitation` passou a tratar esse perfil dentro da mesma
  transação: preserva a configuração básica, confirma que não existem dados
  operacionais, remove o vínculo temporário, move o usuário e recria o corretor
  na conta convidante.
- A proteção contra abandono de contas com dados ou equipes foi mantida.
- Migration aplicada somente no Supabase staging:
  `20260727141041_fix_broker_invitation_redeem.sql`.
- A função continua restrita a usuários autenticados, valida `auth.uid()`, usa
  `search_path` fixo e não concede execução ao papel `anon`.
- A jornada completa revelou ainda que o onboarding cria automaticamente uma
  política padrão de agenda na conta pessoal. Essa política gerada pelo sistema
  deixou de ser classificada como dado operacional no resgate; políticas
  alteradas por usuários e todos os dados comerciais continuam protegidos.
- Migration aplicada no staging:
  `20260727143500_ignore_generated_policy_on_invitation_redeem.sql`.
- O teste seguinte revelou que o trigger de mudança para `agent` já cria o
  `broker_profile` no destino. A função deixou de inserir uma segunda linha
  quando esse perfil já existe.
- Migration aplicada no staging:
  `20260727144500_make_broker_invitation_redeem_idempotent.sql`.
- A mesma função foi executada com o contexto autenticado do novo usuário e o
  convite real: resgate concluído, conta pessoal removida, role `agent`,
  corretor ativo/disponível e vínculo com a conta convidante confirmados.
