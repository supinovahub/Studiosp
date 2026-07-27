# Relatório — intervalo aleatório na reativação

Data: 27/07/2026

## Objetivo

Evitar disparos consecutivos da reativação em intervalos fixos ou imediatos,
aplicando uma espera aleatória entre 30 e 50 segundos antes de cada novo envio
do mesmo lote.

## Implementação

- O worker passou a processar até três mensagens por execução.
- A primeira mensagem elegível é enviada sem espera adicional.
- Entre duas tentativas externas consecutivas, o sistema aguarda um valor
  aleatório inclusivo entre 30.000 e 50.000 milissegundos.
- A fila reivindica apenas uma mensagem por vez. Assim, mensagens seguintes
  não ficam presas em `processing` enquanto o worker aguarda o timer.
- O endpoint manual de processamento recebeu duração máxima de 180 segundos,
  suficiente para até três tentativas com os intervalos configurados.
- A alteração é exclusiva da reativação de base e não muda mensagens normais,
  respostas da IA, notificações de corretores ou follow-ups gerais.

## Validação

- Testes unitários cobrem os limites mínimo e máximo e mil amostras aleatórias.
- Testes existentes de cadência e logs continuam aprovados.
- TypeScript e ESLint aprovados.

## Ambiente

- Branch: `codex/v1-platform`.
- Destino inicial: staging.
- Nenhuma migração de banco é necessária.
