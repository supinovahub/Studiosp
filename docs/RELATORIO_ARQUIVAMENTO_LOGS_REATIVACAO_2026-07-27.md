# Relatório — arquivamento e logs da reativação

Data: 27/07/2026

## Escopo

- Adicionar arquivamento de campanhas sem apagar histórico.
- Adicionar diagnóstico de mensagens por campanha.
- Corrigir a permanência de um erro antigo depois de um reenvio bem-sucedido.

## Implementação

- Novo status `archived` em `reactivation_campaigns`.
- Novo campo `archived_at`.
- Campanhas arquivadas ficam fora da lista operacional por padrão.
- A opção **Exibir arquivadas** permite consultar o histórico.
- Campanhas ativas ou pausadas não podem ser arquivadas diretamente; devem ser
  canceladas primeiro.
- A ação registra o evento `campaign_archive`.
- O botão **Analisar logs** apresenta:
  - total de mensagens;
  - enviadas;
  - agendadas;
  - processando;
  - canceladas;
  - erros registrados;
  - reprocessamentos;
  - lead, telefone, etapa da cadência, horário, tentativas, ID do provedor e
    último erro.
- Reenvios concluídos passam a limpar `last_error`.

## Banco

- Ambiente: Supabase Studiosp Staging (`vgmmfzdifjhpqaopxfbj`).
- Migration: `20260727161844_archive_reactivation_campaigns.sql`.
- Campo e constraint verificados após aplicação.

## Validação

- 15 testes automatizados aprovados.
- TypeScript aprovado.
- ESLint aprovado.
- Build Next.js aprovado.

## Evidência adicional de produção

Após a liberação explícita de mensagens externas em Production, os quatro
contatos da campanha controlada receberam a primeira abordagem:

- Matheus: enviado;
- Arthur: enviado;
- João Brito: enviado após retry;
- Mariana: enviado após retry.

João e Mariana receberam IDs reais da UAZAPI, comprovando que a trava global
de saída deixou de restringir a campanha aos dois números de teste.

## Rollback

- Interface e API: reverter o commit da feature.
- Banco: migration compensatória para remover `archived_at` e recriar a
  constraint anterior somente depois de restaurar qualquer campanha arquivada
  para um status compatível.

## Publicação em produção

- Autorização de promoção recebida em 27/07/2026.
- Commit promovido para `main`: `6705520`.
- Migration aplicada no Supabase Studiosp de produção
  (`ixttqwjfaeybaisglxee`).
- Deploy Vercel: `dpl_DpBvroLY45jrHPzCaPLgh7vqMpUC`.
- Estado final do deploy: `READY`, com alias `studiosp.vercel.app`.
- Smoke test autenticado concluído:
  - filtro `Exibir arquivadas` visível;
  - ação `Arquivar` visível em campanhas elegíveis;
  - painel `Analisar logs` aberto sobre uma campanha real;
  - status, tentativas, horários e IDs da UAZAPI exibidos corretamente;
  - nenhuma falha de runtime encontrada nas rotas de reativação após o deploy.
