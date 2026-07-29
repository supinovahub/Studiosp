# Relatório de robustez determinística da qualificação SDR

Data: 29 de julho de 2026

## Incidente analisado

Na conversa real com Arthur Rocha, a IA formulou perguntas e entendeu
corretamente objetivo, região, preço total, parcela, entrada, situação do imóvel
e prazo. Apesar disso, apenas a localização apareceu no painel.

Os registros de `ai_runs` provaram que o modelo retornou várias respostas usando
chaves como `purchase_objective` e `entry_budget`, enquanto o servidor procurava
somente UUIDs. Em um turno, seis respostas semanticamente corretas foram
rejeitadas e nenhuma foi persistida. Como o objetivo continuava ausente, o
servidor voltou a perguntá-lo.

## Solução

- resolução canônica de pergunta por UUID ou `key`;
- parser determinístico para os sete campos centrais;
- identificação de campo explícito mesmo quando ele difere do campo pendente;
- uso do campo pendente apenas para respostas sem rótulo, como `40 mil`;
- normalização de aliases conforme a coluna real `aliases` do banco;
- validação semântica e de tipo antes de qualquer gravação;
- candidatos do modelo limitados à evidência da última mensagem;
- máquina de estado escolhendo a próxima pergunta a partir das respostas
  confirmadas no banco;
- IA mantida como complemento para ambiguidades, resumo e linguagem.

## Replay coberto

O teste automatizado reproduz:

1. `seria pra morar`;
2. `vila madalena`;
3. `150 mil de preço total`;
4. `e até 5 mil de parcela`;
5. `40 mil`;
6. `prefiro imóveis prontos mesmo`;
7. `seria em até 3 anos mesmo`.

O aceite esperado contém exatamente:

- objetivo;
- localização;
- entrada;
- parcela mensal;
- preço total;
- na planta ou pronto;
- prazo de compra.

## Segurança operacional

- uma resposta não pode preencher outro campo sem evidência explícita;
- valores isolados só usam o campo financeiro atualmente pendente;
- um valor monetário não pode virar localização;
- histórico anterior não é reapresentado como resposta nova;
- a reunião continua bloqueada enquanto houver informação obrigatória pendente;
- fila, idempotência, retry e controles do WhatsApp não foram alterados.

## Homologação pendente

A validação automática cobre extração, normalização, contrato de banco e
seleção da próxima pergunta. O fluxo real pelo WhatsApp deve ser homologado
manualmente pelo dono depois do deploy e da limpeza do contato controlado.

## Rollback

Não há migration nem alteração de schema. A reversão do commit restaura o
orquestrador anterior, mas também reintroduz a dependência exclusiva dos
identificadores retornados pelo modelo.
