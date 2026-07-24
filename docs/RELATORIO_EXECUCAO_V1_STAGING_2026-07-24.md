# Relatório de execução — Studiosp V1 staging

Data: 24/07/2026  
Branch: `codex/v1-platform`  
Supabase: staging `vgmmfzdifjhpqaopxfbj`  
Produção/main: não alteradas

## Resumo executivo

Foi implementado e publicado no staging o agente isolado de análise de
documentos em Empreendimentos. Os três PDFs de homologação foram enviados para
quarentena, processados e encerrados sem aprovação ou importação. O contrato foi
bloqueado por dados pessoais; revista e tabelão passaram pela sanitização. O
catálogo operacional e a base de conhecimento permaneceram inalterados.

Também foram testadas as experiências de owner e corretor, a configuração do
número controlado do corretor e o aceite de uma oferta de reunião. O aceite
movimentou corretamente oferta, agendamento, atribuição e pipeline.

A execução encontrou e corrigiu falhas reais de runtime, retry, estado agregado,
validação E.164 e autorização da conexão UAZAPI. A expiração/redistribuição e a
notificação automática por WhatsApp permanecem bloqueadas pela ausência de um
scheduler de frequência curta.

## Implementado

- Agente de documentos dentro de Empreendimentos, exclusivo para owner/admin.
- Upload múltiplo de PDF, DOCX, XLSX, CSV, TXT e imagens.
- Entrada por links públicos de arquivos, Documentos e Planilhas Google.
- Limites de 20 fontes, 50 MB por fonte e 250 MB por lote.
- Bucket privado de quarentena e nove tabelas isoladas com RLS.
- Extração local antes da IA.
- Detecção e remoção local de CPF, RG, e-mail, telefone, endereço e assinatura.
- Bloqueio integral de documentos de alto risco antes de qualquer provedor
  externo.
- Preview versionado e aprovação desabilitada durante a homologação.
- Retry com lease e backoff de 1, 5 e 15 minutos.
- Ação visível “Retomar processamento”.
- Suporte de runtime do PDF.js na Vercel, incluindo canvas nativo e worker
  textual.
- Degradação controlada quando não existe credencial de IA: extração e
  privacidade concluem; o preview semântico fica explicitamente bloqueado.
- Remoção da aba legada “Imóveis” das credenciais do modelo de IA.
- Correção de textos corrompidos na configuração da UAZAPI.
- Correção da constraint E.164 dos corretores.
- Normalização no servidor de telefones com ou sem `+`.
- Correção da autorização owner/admin na rota de conexão UAZAPI.
- Proteção da conexão ativa: a rota consulta o status antes de chamar
  `/instance/connect` e não solicita novo QR enquanto o número estiver conectado.

## Migrations aplicadas somente no staging

- `20260724120712_document_analysis_agent.sql`
- `20260724122015_document_analysis_indexes.sql`
- `20260724123200_document_analysis_retry_backoff.sql`
- `20260724125800_fix_broker_whatsapp_e164_constraint.sql`

## Homologação dos documentos

Fontes:

1. `TABELÃO MATRIZ JUNHO.pdf`
2. `EnvelopePDF.aspx.pdf`
3. `Revista ONE PARCERIAS.pdf`

Resultado:

- lote final: `ready`, 3/3 fontes concluídas, versão 1;
- contrato: bloqueado por múltiplos dados pessoais;
- revista: três ocorrências sanitizadas;
- tabelão: uma ocorrência sanitizada;
- fontes com texto extraído/sanitizado retido após conclusão: zero;
- aprovação/importação: não executada;
- conteúdo enviado à IA: zero, pois não existe credencial ativa no staging.

Contagens operacionais antes e depois:

| Tabela | Antes | Depois |
| --- | ---: | ---: |
| `developers` | 1 | 1 |
| `neighborhoods` | 1 | 1 |
| `developments` | 1 | 1 |
| `development_offers` | 1 | 1 |
| `development_media` | 2 | 2 |
| `ai_knowledge_documents` | 0 | 0 |

## Teste de permissões e fila

- Owner visualizou áreas administrativas e o agente de documentos.
- Corretor foi redirecionado de `/visao-geral` para `/meu-dia`.
- Menu do corretor exibiu somente Meu dia, pendências, Inbox, leads, agenda,
  empreendimentos e disponibilidade.
- Nomenclatura visível: “Corretor”.
- Número controlado do corretor salvo e verificado: `+5527998303052`.
- Role temporária usada no teste: `agent`.
- SLA temporário: 2 minutos; lembrete: 1 minuto.
- Lead controlado usado na reserva: `5527981168321`.
- A oferta apareceu na fila do corretor com ações Aceitar, Transferir e
  Rejeitar.
- Aceite pelo painel:
  - oferta: `accepted`;
  - agendamento: `broker_confirmed`;
  - oportunidade: `meeting_scheduled`;
  - reunião: `confirmed`;
  - estado de atenção: `no_action`;
  - corretor atribuído corretamente.
- Ao final, Arthur foi restaurado para `owner`, corretor inativo/indisponível e
  SLA definitivo restaurado para 30 minutos.

## UAZAPI e QR Code

- Configuração real encontrada como `connected`.
- Instância e credencial existentes não foram removidas nem substituídas.
- Nenhum comando de desconexão foi executado.
- Nenhuma mensagem de WhatsApp foi enviada nesta rodada.
- Gerar um QR real para a mesma instância ativa não é compatível com o
  guardrail de manter o número conectado.
- A rota agora retorna a conexão atual quando ela já está ativa, sem chamar a
  operação de conexão novamente.
- A proteção foi testada pela interface no deploy do commit `1a1fc01`: a ação
  consultou o status, informou que o número atual continuava conectado e não
  exibiu/solicitou um novo QR.
- Após o teste, status, `connected_at`, ID e nome da instância permaneceram
  iguais.

## Falhas encontradas e corrigidas durante a execução

1. PDF.js quebrava na Vercel por ausência do canvas nativo.
2. O worker textual do PDF.js não era incluído no trace da função.
3. Não havia ação de retomada após erro de processamento.
4. Lote podia ficar “pronto” com fonte ainda elegível para retry.
5. Ausência de chave de IA fazia o lote repetir até falhar, em vez de degradar
   com clareza.
6. Constraint de WhatsApp do corretor tinha escape duplicado e rejeitava todo
   E.164 válido.
7. Rota de QR verificava `profiles.role` em vez de `account_role`, negando owner
   legítimo.
8. Rota de conexão não protegia explicitamente uma instância já conectada.

## Bloqueios e pendências

### Alta prioridade

- Não existe agendador configurado para `/api/studiosp/cron`.
- A fila exige execução em minutos, mas o Vercel Hobby permite cron apenas uma
  vez por dia. Assim, notificação automática, lembrete, expiração,
  redistribuição e contingência não podem ser homologados de forma real e
  confiável com a infraestrutura atual.
- É necessário escolher um executor de frequência curta, por exemplo Supabase
  Cron + Vault/HTTP, uma fila durável ou upgrade do plano Vercel.

### Dependências de configuração

- O staging possui zero linhas em `ai_configs`; por isso o preview semântico e a
  qualificação real por IA não foram executados.
- O teste de texto/áudio, transcrição e handoff por dúvida/lead quente depende de
  uma credencial ativa do provedor.
- O QR real só pode ser homologado em uma instância desconectada ou em uma
  instância descartável separada; a instância atual foi preservada.

### Ainda não homologado ponta a ponta

- envio real da oferta ao corretor pelo WhatsApp;
- resposta `sim`, `não + motivo` e `transferir + motivo` pelo WhatsApp;
- expiração automática, segundo corretor e fila esgotada;
- contingência de três horas;
- concorrência com duas confirmações simultâneas;
- qualificação real por texto e áudio;
- isolamento do inbox por identidade da nova instância;
- responsividade completa em múltiplos tamanhos de celular.

## Qualidade e segurança

- TypeScript: aprovado.
- Testes: 78 arquivos e 703 testes aprovados.
- Testes do agente de documentos: 7 aprovados.
- Lint: zero erros; 37 avisos preexistentes.
- Build Vercel: aprovado.
- `git diff --check`: aprovado.
- `npm audit`: 7 vulnerabilidades transitivas restantes (5 moderadas e 2 altas);
  não foi usado `--force` por exigir mudanças incompatíveis.
- Advisors do Supabase ainda apontam avisos preexistentes de segurança e
  desempenho, fora do escopo desta rodada.

## Rollback

- Código: reverter os commits da branch `codex/v1-platform`; main não foi
  alterada.
- Banco: as tabelas do agente são isoladas e não têm gatilhos que escrevam no
  catálogo. Em rollback conservador, bloquear as rotas e manter tabelas/bucket
  até expirar a retenção; remover estrutura apenas após exportar a auditoria.
- Constraint E.164: não deve ser revertida, pois a versão anterior rejeita
  telefones válidos.
