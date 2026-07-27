# Relatório de publicação em produção — 27/07/2026

## Resultado

A branch `codex/v1-platform` foi integrada por fast-forward à `main` e publicada no ambiente de produção.

- Commit funcional publicado: `705c46865b2b45f0780e8b194713e8e6e630cef3`
- Projeto Vercel: `studiosp`
- Deploy de produção: `dpl_AwDT5wYLCCRC73CUJouZNEvxwv7x`
- URL: https://studiosp.vercel.app
- Supabase de produção: `ixttqwjfaeybaisglxee`

## Alterações incluídas

- Compatibilidade da reativação de base com o CSV real de 100 leads.
- Normalização de nomes, telefones, objetivos e valores de entrada.
- Cadência configurável e processamento contínuo das campanhas de reativação.
- Variação da abordagem inicial de reativação.
- Whitelist visível de números autorizados para resposta da IA.
- Fluxo de conclusão de call pelo corretor.
- Correções no convite e cadastro de corretores.
- Roteamento, rejeição, transferência e expiração de ofertas para múltiplos corretores.
- Importação e análise de documentos em blocos persistentes.
- Canonização e filtragem de empreendimentos do tipo studio.
- Melhorias de interface e documentação operacional relacionadas às features acima.

## Banco de dados

Foram aplicadas e validadas em produção as alterações finais necessárias:

- endurecimento de relatórios, auditoria e concorrência de agenda;
- reparo de textos padrão com codificação incorreta;
- conclusão de call com auditoria;
- whitelist de resposta automática;
- resgate idempotente de convites;
- roteamento pelo dashboard sem exigir WhatsApp verificado;
- persistência de respostas tardias como expiradas;
- processamento persistente de documentos em blocos.

Verificações realizadas:

- coluna `ai_configs.auto_reply_allowed_numbers` presente;
- tabela `document_analysis_chunks` presente, com RLS e política de owner;
- RPC de conclusão de call presente;
- RPC de aceite de convite presente;
- fila de corretores sem bloqueio obrigatório por WhatsApp;
- fallback de notificação pelo dashboard presente;
- resposta tardia não desfaz mais a marcação de oferta expirada.

## Validação

Antes da publicação:

- 14 testes automatizados aprovados;
- TypeScript aprovado;
- lint aprovado;
- build local aprovado;
- parser executado contra `Leads - 100.csv`: 100 linhas e 100 telefones válidos.

Depois da publicação:

- build Vercel concluído com estado `READY`;
- domínio de produção abriu autenticado em `/visao-geral`;
- dashboard carregou métricas, leads e navegação;
- `/reativacao` carregou formulário, cadência e campanhas existentes;
- nenhum erro de console foi observado durante o smoke test;
- nenhum erro de runtime foi encontrado pela Vercel nos 15 minutos posteriores ao deploy.

## Pontos de atenção preexistentes

Os advisors do Supabase continuam indicando itens para uma revisão separada:

- extensão `pg_net` no schema público;
- funções `SECURITY DEFINER` expostas a papéis autenticados e, em um caso, anônimo;
- proteção contra senhas vazadas desativada;
- chaves estrangeiras sem índices;
- políticas RLS permissivas duplicadas.

Referências:

- https://supabase.com/docs/guides/database/database-linter
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Esses avisos não impediram a publicação e não foram alterados neste deploy para evitar ampliar o risco e o escopo sem uma auditoria específica.

## Rollback

O deploy `dpl_AwDT5wYLCCRC73CUJouZNEvxwv7x` foi marcado pela Vercel como candidato a rollback. As mudanças de banco são aditivas ou substituições controladas de funções; qualquer reversão de banco deve usar uma migração compensatória, nunca exclusão manual de histórico.
