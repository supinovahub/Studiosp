# Correção da evidência por mensagem na qualificação SDR

Data: 30 de julho de 2026

## Problema

Mensagens consecutivas do lead eram agrupadas em um único turno para
interpretação, mas toda resposta extraída era vinculada à última mensagem do
bloco. O banco rejeitava corretamente fatos cujo texto original pertencia a
uma mensagem anterior. Como a resposta não era persistida, o SDR repetia a
pergunta já respondida.

O comportamento foi confirmado nas conversas controladas de Arthur Rocha e
Matheus. Os logs de produção registraram o erro `23514` com a mensagem
“A resposta original não pertence à mensagem do lead”.

## Correção

- Cada fato passa a ser associado à mensagem exata do turno que contém sua
  evidência.
- A validação de integridade no banco foi preservada; nenhuma proteção foi
  relaxada.
- A extração determinística processa separadamente cada mensagem consecutiva.
- Quando o lead corrige uma resposta dentro do mesmo turno, a mensagem mais
  recente prevalece.
- Candidatos sem evidência localizável no turno atual continuam rejeitados.

## Verificações

- Testes focados: 25 aprovados.
- Suíte completa: 899 testes aprovados.
- Typecheck: aprovado.
- Build de produção Next.js: aprovado.

## Homologação pendente

Validar manualmente:

1. resposta dividida em duas mensagens, como “seria para morar” e “mas nada
   muito caro”;
2. correção rápida de valor, como “uns 50” seguida de “na real 40”;
3. confirmação no painel de que o campo foi persistido e não voltou a ser
   perguntado.

## Rollback

Reverter o commit desta correção restaura o comportamento anterior. Não houve
alteração de schema nem migration.
