# Relatório — robustez das respostas automáticas da IA

Data: 27/07/2026  
Ambiente: staging  
Branch de implementação: `feature/ai-reply-robustness`

## Diagnóstico

A interrupção observada na conversa do Matheus não foi causada pelo modelo de IA. A conversa havia atingido o limite configurado de três respostas automáticas (`ai_reply_count = 3` e `auto_reply_max_per_conversation = 3`). As mensagens seguintes foram recebidas, mas o fluxo anterior encerrava o processamento silenciosamente.

A preferência por imóvel na planta foi persistida corretamente:

- pergunta: `property_timing`;
- valor normalizado: `off_plan`;
- rótulo: `Na planta`;
- resposta original: `Planta`;
- estado: confirmado;
- confiança: `1.0`.

## Alterações realizadas

- Criada uma fila durável e idempotente para respostas automáticas.
- Cada mensagem recebida passa a possuir um trabalho rastreável e tentativas registradas.
- Adicionado processamento concorrente seguro com `FOR UPDATE SKIP LOCKED`.
- Adicionadas três tentativas com intervalos progressivos e jitter.
- Implementada recuperação automática de trabalhos cujo processamento perdeu o lease.
- Estados `na fila`, `processando`, `tentando novamente`, `pausado`, `transferido` e `falhou` passaram a ser persistidos na conversa.
- Falhas definitivas geram alerta para atendimento humano.
- O Inbox passou a exibir o estado do processamento e oferecer “Tentar novamente” após falha.
- O limite deixou de silenciar a IA: ao atingir o teto, a conversa é transferida para atendimento humano.
- O limite padrão foi elevado para 30 respostas por janela, configurável entre 10 e 50.
- Conversas antigas sem início de contexto passam a iniciar uma janela de 24 horas no primeiro novo processamento.
- Criado painel de saúde das respostas automáticas com totais das últimas 24 horas, atrasos, falhas, transferências e latência P95.
- Adicionados logs estruturados com trabalho, correlação, conversa, tentativa, resultado e latência.
- O cron operacional passou a drenar a fila em lotes.

## Banco de dados

Foram adicionados no staging:

- `ai_reply_jobs`;
- `ai_reply_attempts`;
- campos de estado de processamento em `conversations`;
- RPC idempotente de enfileiramento;
- RPC de claim concorrente;
- snapshot agregado de confiabilidade;
- índices para as novas chaves estrangeiras;
- RLS e permissões explícitas.

As mudanças são aditivas. Nenhuma tabela ou dado preexistente foi removido.

## Validação

- TypeScript: aprovado.
- Testes específicos de resposta e política da fila: 19/19 aprovados.
- Suíte completa anterior à correção final: 762 testes executados; a correção final foi novamente coberta pelos testes específicos.
- ESLint: zero erros; permanecem avisos preexistentes.
- Build de produção: aprovado.
- Migrações aplicadas no Supabase staging.
- Painel de confiabilidade carregado no preview de staging.
- Configuração efetiva da conta validada como IA ativa e resposta automática habilitada.
- O registro temporário usado para simular falha no Inbox deve permanecer fora de qualquer envio real.

## Segurança contra duplicidade

O enfileiramento é idempotente por mensagem recebida. Quando o provedor pode ter aceitado uma resposta, mas a gravação local falha, o sistema não repete automaticamente o envio: sinaliza revisão humana para evitar mensagem duplicada.

## Operação e rollback

Produção não foi alterada nesta etapa. Para interromper o novo processamento em staging, basta desativar o consumo da fila e restaurar os webhooks/cron para a versão anterior. As tabelas podem ser preservadas para auditoria; não é necessário apagar dados para reverter o código.

## Próximos critérios de homologação

- responder por mais de três turnos sem interrupção silenciosa;
- simular indisponibilidade temporária do provedor e observar nova tentativa;
- simular falha definitiva e confirmar alerta e botão de repetição;
- confirmar transferência humana ao atingir o limite configurado;
- acompanhar o painel por 24 horas antes da promoção para produção.
