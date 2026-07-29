# Relatório de restauração da qualificação SDR

Data: 29 de julho de 2026

## Objetivo

Restaurar o comportamento de qualificação observado na produção em 28/07/2026
às 13:18, sem reverter as proteções operacionais adicionadas posteriormente.

## Referência funcional

- commit: `f10cb76`
- deployment Vercel: `dpl_29MtEqxjaiUjmtsxSw2JWgA4nvvJ`
- estado observado: qualificação seguia os campos em sequência e não repetia
  perguntas já respondidas.

## Causa encontrada

Uma alteração posterior passou a usar o campo esperado pelo turno como motivo
para reatribuir uma resposta extraída pelo modelo. Na conversa analisada, a
mensagem visível perguntava localização, mas o metadado ainda indicava
`purchase_objective`. O sistema então persistiu `vila madalena` como objetivo
de compra e perdeu a resposta de localização.

Esse estado inconsistente fazia as próximas perguntas serem calculadas a partir
de dados incorretos, provocando repetição, avanço indevido e interrupção do
fluxo.

## Correções

- removido o realinhamento automático entre campos de qualificação;
- restaurada a orientação de extração baseada em respostas explícitas e
  correções presentes na conversa;
- removida a substituição automática da pergunta produzida pela próxima
  pergunta registrada;
- adicionada validação semântica independente do modelo antes da persistência;
- preservados normalização, fila persistida, idempotência, retry, controle de
  concorrência e observabilidade atuais.

## Invariantes adicionadas

- bairro ou região não pode ser objetivo de compra;
- objetivo exige evidência de moradia, investimento, uso próprio ou ambos;
- prazo exige evidência temporal;
- valores financeiros exigem evidência numérica;
- respostas genéricas como “sim” não podem ser gravadas como localização.

## Verificações

- testes direcionados da conversa, normalização, resposta automática e agenda;
- cenário de regressão: `vila madalena` é recusado como objetivo e aceito como
  localização;
- cenário de controle: `para morar` continua válido como objetivo;
- cenário de controle: `em 3 anos` continua válido como prazo.

A validação visual e ponta a ponta pelo WhatsApp permanece pendente de
homologação manual do dono após a publicação e a limpeza do contexto de teste.

## Rollback

Reverter o commit desta correção restaura o comportamento imediatamente
anterior. Não há migration nem mudança de schema associada.
