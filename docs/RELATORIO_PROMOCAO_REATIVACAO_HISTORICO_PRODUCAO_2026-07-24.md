# Promoção para produção — reativação e histórico do WhatsApp

## Escopo

- reativação de base por CSV/XLSX;
- campanhas em rascunho, ativação, pausa, retomada e cancelamento;
- cadência D0, D2, D5 e D9;
- importação segura e idempotente do histórico do WhatsApp;
- supressão de automações para contatos reconhecidos no histórico;
- fronteira temporal do contexto usado pela IA;
- correções de importação CSV e mensagens de validação da UAZAPI.

## Origem

- branch integrada: `feature/reactivacao-leads`;
- commit integrado validado: `0bdef6c`;
- Supabase Staging: `vgmmfzdifjhpqaopxfbj`;
- Supabase Produção: `ixttqwjfaeybaisglxee`.

## Banco de produção

Migrations aplicadas em ordem:

1. `reactivation_campaigns`;
2. `whatsapp_history_import`;
3. `reactivation_execution_queue`;
4. `whatsapp_history_contact_suppression`;
5. `whatsapp_history_import_fk_indexes`.

Verificações:

- tabelas de campanhas, fila e importação presentes;
- `contacts.automation_status` presente;
- função de claim da reativação sem execução para `anon` e `authenticated`;
- execução da função concedida somente a `service_role`;
- migrations expansivas, sem exclusão de dados existentes.

## Validação da aplicação

- 82 arquivos de teste aprovados;
- 718 testes aprovados;
- TypeScript aprovado;
- build Next.js aprovado;
- preview integrado publicado e pronto;
- aviso não bloqueante preexistente sobre `<img>` no inbox.

## Advisors

Não foi identificado alerta novo específico das features promovidas. Permanecem
avisos preexistentes sobre `pg_net` no schema público, funções
`SECURITY DEFINER`, proteção contra senhas vazadas, chaves estrangeiras sem
índice e políticas permissivas duplicadas.

## Rollback

- aplicação: restaurar o deployment de produção anterior;
- banco: manter as estruturas expansivas sem uso; não remover tabelas enquanto
  houver campanhas, importações ou eventos de auditoria;
- operação: pausar campanhas de reativação interrompe novos claims.
