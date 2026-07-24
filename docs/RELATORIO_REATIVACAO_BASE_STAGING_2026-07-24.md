# Relatório — Reativação de base no staging

## Ambiente

- Branch: `feature/reactivacao-leads`
- Supabase: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)
- Produção: não alterada

## Implementado

- importação CSV/XLSX com preview, normalização e segmentação;
- campanhas em rascunho, ativação, pausa, retomada e cancelamento;
- vínculo com contato existente ou criação de contato, conversa e oportunidade;
- origem operacional `reactivation` e contexto conhecido preservado em metadados;
- fila idempotente D0, D2, D5 e D9 com claim concorrente;
- envio pelo provedor já protegido por `OUTBOUND_TEST_NUMBERS`;
- cancelamento das próximas mensagens quando o lead responde;
- opt-out no contato, campanha e conversa;
- contexto específico de recuperação antes da qualificação normal da IA-SDR;
- eventos e métricas básicas de envios e respostas;
- acesso administrativo no cliente, API e RLS.

## Banco

- `20260724180000_reactivation_campaigns.sql`
- `20260724190000_reactivation_execution_queue.sql`
- tabelas: `reactivation_campaigns`, `reactivation_imports`,
  `reactivation_leads`, `reactivation_touches` e `reactivation_events`;
- função de claim disponível somente para `service_role`.

## Verificações executadas

- TypeScript: aprovado;
- ESLint do escopo alterado: aprovado;
- testes automatizados: 15 aprovados;
- build Next.js: aprovado;
- tabelas, função de claim e RLS verificadas no staging.

## Correção da importação CSV

- o leitor passou a detectar CSV separado por vírgula ou ponto e vírgula;
- telefones convertidos pelo Excel para notação científica são bloqueados, pois
  os últimos dígitos podem ter sido perdidos;
- a interface orienta formatar a coluna de telefone como **Texto** antes de
  exportar novamente;
- o nome da campanha tornou-se opcional e usa o nome do arquivo como padrão;
- sucesso, falha de rede e respostas inválidas do servidor agora aparecem em
  um aviso visível, com confirmação explícita quando o rascunho é criado;
- foram adicionados dois testes automatizados para o CSV real reportado.
- CSVs exportados pelo Excel em Windows-1252 também são reconhecidos;
- erros de estrutura da planilha retornam validação HTTP 400 com mensagem
  orientativa, em vez de erro interno HTTP 500.

## Diagnóstico de credenciais UAZAPI no preview

- o banco staging mantém uma configuração UAZAPI conectada e o token
  armazenado continua descriptografável;
- as novas tentativas foram recusadas na validação das credenciais com HTTP
  400, antes da escrita no banco;
- a interface deixou de ocultar a mensagem devolvida pela API e agora informa
  o motivo específico, como URL inválida, token rejeitado ou falha da UAZAPI.

## Integração com a importação de histórico do WhatsApp

- a branch `feature/whatsapp-history-import` foi integrada à
  `feature/reactivacao-leads`;
- os fluxos de reativação e importação histórica permanecem separados na
  interface e no modelo operacional;
- contatos reconhecidos no histórico mantêm automações suprimidas até uma
  decisão operacional explícita;
- cron, contexto da IA, webhooks e navegação administrativa foram combinados
  preservando os comportamentos das duas features;
- os nomes locais das migrations foram alinhados às versões já registradas no
  Supabase Staging, evitando reexecução de migrations previamente aplicadas.

## Pendência de homologação real

A execução com WhatsApp deve usar exclusivamente o número controlado autorizado.
Antes de produção, validar D0, resposta, cancelamento de D2/D5/D9, opt-out,
handoff, pausa e retomada. Nenhum envio amplo está autorizado.

## Rollback

Pausar ou cancelar campanhas interrompe novos claims. Para rollback de
aplicação, retornar o alias do preview ao commit anterior. As tabelas são
expansivas e podem permanecer sem uso; não devem ser removidas enquanto houver
campanhas ou eventos de auditoria.
