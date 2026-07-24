# Relatório de promoção da V1 para produção

Data: 24/07/2026

## Resultado

A V1 homologada na branch `codex/v1-platform` foi integrada à `main` e publicada no projeto de produção. As alterações de banco foram aplicadas primeiro no Supabase de staging e, após validação, no projeto Studiosp de produção.

## Entregas promovidas

- autorização administrativa também nas APIs, além do redirecionamento no cliente;
- estados de erro, timeout e nova tentativa nas áreas operacionais;
- nomenclatura “Corretor” e traduções/tempos relativos em português;
- correções de acentuação e carregamento das métricas;
- relatórios com filtros e CSV coerente com os filtros selecionados;
- métricas agregadas no banco e auditoria operacional;
- reforço dos testes de permissões, agenda, transferência e contingência;
- aviso explícito de invisibilidade de empreendimentos em rascunho;
- upload múltiplo com resultado individual;
- agente de análise documental em Empreendimentos, com preview e aprovação do dono;
- proteção da conexão UAZAPI ativa durante a consulta do QR Code;
- normalização do WhatsApp do corretor em E.164;
- separação do inbox pela conexão atual do WhatsApp, preservando o histórico antigo no banco;
- processamento agendado de ofertas, follow-ups, cancelamentos e documentos.

## Validações executadas

- testes automatizados: 78 arquivos e 703 testes aprovados;
- build de produção com Next.js 16.2.11: aprovado;
- TypeScript: aprovado;
- lint: zero erros e 37 avisos preexistentes;
- teste da credencial de IA no staging: aprovado;
- qualificação por texto e transbordo para humano: aprovado;
- scheduler Supabase → Vercel: HTTP 200, incluindo processamento documental;
- oferta controlada pelo WhatsApp: uma notificação enviada ao número autorizado, com `notified_at` e tentativa registradas;
- expiração de oferta sem resposta: processada;
- dados sintéticos removidos e SLA/configuração do corretor restaurados após o teste;
- cinco migrações finais aplicadas com sucesso em produção;
- isolamento do inbox validado por trigger, backfill seguro e filtros de tempo real.

## Banco de produção

Foram aplicadas:

1. agente de análise documental;
2. índices da análise documental;
3. retentativa com backoff;
4. correção da restrição E.164;
5. escopo de mensagens e conversas por conexão de WhatsApp.

As mudanças são aditivas. O rollback recomendado é reverter o código para o deploy anterior e manter as colunas/tabelas aditivas até uma janela própria de limpeza, evitando perda de dados.

## Operação

- Staging permanece em `codex/v1-platform`, ligado ao projeto Supabase de staging.
- Produção está em `main`, ligada ao projeto Supabase Studiosp.
- O relógio de produção recebeu URL e segredo próprios no Vault/Vercel.
- O número permitido no teste de saída do staging foi restrito ao número controlado informado.

## Pendências não bloqueantes

- os avisos preexistentes dos advisors do Supabase devem ser tratados em uma frente separada de segurança e desempenho;
- o lint mantém 37 avisos preexistentes, sem erros;
- a auditoria de dependências aponta vulnerabilidades que exigem avaliação de compatibilidade antes de atualização forçada;
- testes reais de áudio e redistribuição para um segundo corretor exigem uma segunda identidade controlada.

