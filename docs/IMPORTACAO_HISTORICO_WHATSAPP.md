# Importação de histórico do WhatsApp

Status: implementado em staging na branch `feature/whatsapp-history-import`

Documento de produto: [Plano Mestre](./PLANO_MESTRE_STUDIOSP.md)

Contrato de dados: [Modelo de Dados da V1](./MODELO_DADOS_V1_STUDIOSP.md)

## Objetivo

Permitir que o dono importe pelo painel o arquivo JSONL exportado do WhatsApp
da imobiliária. As mensagens ficam disponíveis como histórico no inbox, mas os
contatos importados não entram automaticamente no atendimento da IA.

Esta entrega não executa reativação. Uma futura ferramenta de reativação poderá
liberar contatos escolhidos por um fluxo próprio, com prompt, auditoria e
critérios independentes.

## Fluxo do dono

1. Acessar **Configurações > Importação de histórico**.
2. Selecionar um arquivo `.jsonl` de até 50 MB.
3. Aguardar o envio para o bucket privado e a análise.
4. Conferir a prévia: linhas, contatos, mensagens, entradas, saídas, mídias,
   duplicidades, inválidos, ignorados e intervalo de datas.
5. Marcar a confirmação explícita.
6. Iniciar a importação e acompanhar o progresso.
7. Retomar pela mesma tela se uma etapa for interrompida.

O arquivo bruto é apagado do Storage depois da conclusão. Permanecem no banco o
relatório da execução, a origem da importação e as mensagens normalizadas.

## Regras invariáveis

- Somente o perfil **Dono** pode criar, visualizar e executar importações.
- O arquivo é enviado diretamente do navegador ao bucket privado por URL
  assinada; ele não atravessa o corpo de uma Function da Vercel.
- A análise é obrigatória e não grava mensagens operacionais.
- A confirmação do dono é obrigatória antes da persistência.
- O processamento usa lotes idempotentes e um cursor persistido.
- Repetir o mesmo lote não duplica mensagens.
- Eventos técnicos, grupos e identificadores inválidos não viram mensagens.
- Mídias sem arquivo binário aparecem como referências históricas
  indisponíveis; o ZIP permanece somente como backup externo.
- A importação não cria oportunidades, não envia mensagens e não agenda
  follow-ups.
- Todos os contatos identificados no arquivo, inclusive os que possuem apenas
  eventos técnicos, recebem `automation_status = 'suppressed'`.
- Webhooks novos desses contatos continuam sendo armazenados e aparecem no
  inbox, mas não acionam IA, fluxos, automações, transcrição, follow-up ou
  criação automática de oportunidade.
- O contexto da IA começa em `conversations.ai_context_started_at`; mensagens
  anteriores a esse limite não são usadas como instruções nem em rascunhos
  manuais gerados por IA.
- Dados históricos nunca validam preço, condição ou disponibilidade atual.
- O isolamento normal por `account_id`, contato e conversa continua
  obrigatório; nenhuma conversa pode fornecer contexto para outro contato.

## Estruturas

### `whatsapp_history_imports`

Registra o lote, seu arquivo, checksum SHA-256, status, contadores da prévia,
cursor, relatório, falha e timestamps. O checksum torna o mesmo arquivo único
por conta e conexão.

Estados:

```text
uploading, analyzing, ready, importing, completed, failed, cancelled
```

### Campos operacionais

- `contacts.automation_status`: `enabled` ou `suppressed`;
- `contacts.automation_block_reason`, `automation_blocked_at` e
  `automation_blocked_by_import_id`: explicam a trava;
- `conversations.history_import_id`: liga a conversa ao lote;
- `conversations.ai_context_started_at`: fronteira do contexto da IA;
- `messages.history_import_id`, `is_historical` e `history_source_line`:
  identificam a proveniência da mensagem.

### Storage

Bucket privado `whatsapp-history-imports`, limite de 50 MB e políticas
owner-only. O caminho começa pelo `account_id`, usado também pela política de
acesso.

### Operações privilegiadas

As funções `import_whatsapp_history_chunk` e
`suppress_whatsapp_history_contacts` aceitam apenas `service_role`. O navegador
não recebe permissão para chamar essas operações diretamente.

## Formato reconhecido

A fonte preferencial é o JSONL estruturado. Cada linha é validada de forma
independente. O parser preserva texto, direção, autor, data, tipo de conteúdo e
identificadores disponíveis, normalizando apenas os campos necessários para a
estrutura do Studiosp.

O Markdown não é necessário no fluxo implementado e não deve ser misturado ao
JSONL. O ZIP não é importado.

## Validação realizada em staging

- migrations aplicadas apenas ao projeto Studiosp Staging;
- teste transacional com contatos e mensagem sintéticos;
- contatos ficaram suprimidos;
- mensagem ficou marcada como histórica;
- nenhuma oportunidade foi criada;
- transação de teste revertida, sem deixar dados sintéticos;
- parser, limite de contexto da IA e trava de automação cobertos por testes
  automatizados.

O backup real foi somente analisado localmente. Ele não foi enviado ao
Supabase e deverá ser importado pelo dono na nova tela.

## Homologação manual

1. Entrar como Dono no preview de staging.
2. Abrir **Configurações > Importação de histórico**.
3. Importar primeiro uma amostra pequena do JSONL.
4. Conferir os contadores da prévia antes de confirmar.
5. Verificar mensagens históricas no inbox e o rótulo visual.
6. Enviar uma mensagem nova de um número importado.
7. Confirmar que ela aparece no inbox e não recebe resposta automática.
8. Atualizar a tela no meio de uma importação e confirmar que **Retomar**
   preserva o progresso.
9. Repetir o arquivo e confirmar que a duplicidade é recusada.

## Rollback

Enquanto a feature estiver somente em staging, o código pode ser abandonado
sem merge em `main`. As migrations são aditivas. Uma reversão de dados
importados deve ser uma operação administrativa específica por
`history_import_id`; o painel não oferece exclusão em massa nesta entrega.
