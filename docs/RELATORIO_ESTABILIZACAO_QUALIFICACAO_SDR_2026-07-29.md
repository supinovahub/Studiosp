# Relatório — estabilização da qualificação SDR

Data: 29 de julho de 2026

## Escopo

Correção seletiva da regressão observada na conversa controlada do Arthur
Rocha, preservando fila, idempotência, outbox, retries e entrega pelo WhatsApp.

## Causa confirmada

- respostas de prazo como `em 3 anos` podiam retornar no campo estruturado
  `text`, enquanto o normalizador de escolhas lia somente `value` ou `label`;
- o resumo da IA registrava o prazo, mas `qualification_answers` rejeitava o
  valor, fazendo a pergunta reaparecer;
- textos com `oportunidades` e `bate-papo` escapavam do bloqueio de oferta
  prematura;
- uma oferta gerada livremente não possuía IDs de horários persistidos, então
  a resposta `não` não era reconhecida como rejeição de um horário;
- `Claro, pode sim` não encerrava deterministicamente a confirmação inicial da
  reativação.

## Alterações

- escolhas estruturadas agora aceitam `text` como entrada para normalização;
- prazo em anos é convertido para a opção canônica configurada;
- oportunidade, bate-papo e reunião são bloqueados enquanto houver campo
  obrigatório pendente;
- se o texto gerado não fizer a pergunta selecionada pelo servidor, ele é
  substituído pela pergunta determinística;
- `Claro, pode sim` é reconhecido como confirmação explícita da reativação;
- foram adicionados testes reproduzindo os trechos que causaram a regressão.

## Verificações

- testes direcionados: 60 aprovados;
- suíte completa: 108 arquivos e 865 testes aprovados;
- TypeScript: aprovado;
- ESLint: sem erros, com 38 avisos preexistentes;
- build de produção Next.js: aprovado.

## Critérios para homologação manual

1. A resposta `50k` confirma a entrada e não volta a ser perguntada.
2. `Pronto para morar` confirma a situação.
3. `Em 3 anos` confirma o prazo como mais de 12 meses.
4. Nenhuma oportunidade ou reunião é oferecida antes de concluir os campos
   obrigatórios.
5. Uma oferta de horário é criada somente pelo estado estruturado de agenda.
6. A rejeição do horário pergunta o melhor dia e horário ao lead.

## Rollback

Reverter o commit desta correção restaura o comportamento anterior sem
necessidade de rollback de schema. Nenhuma migration foi criada.

