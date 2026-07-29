# Relatório — resiliência do provedor de IA

Data: 29/07/2026  
Branch: `fix/ai-provider-resilience`

## Incidente analisado

A conversa de Arthur Rocha parou após a mensagem sobre Vila Madalena. O job
durável realizou três tentativas, mas a classificação e a extração excederam o
tempo limite e a geração final retornou sem conteúdo. A proteção existente
transformou uma falha transitória do provedor em pausa permanente da conversa.

## Alterações implementadas

- fallback automático do modelo OpenAI configurado para `gpt-4.1-nano` quando
  o modelo principal apresentar timeout, resposta vazia, limite de requisições
  ou falha de rede;
- fallback textual determinístico para manter o atendimento ativo quando
  modelo principal e secundário falharem antes de qualquer envio;
- classificação SDR e extração de qualificação também passam a usar o modelo
  secundário;
- falhas transitórias esgotadas deixam a conversa apta a receber mensagens
  futuras, em vez de pausá-la indefinidamente;
- recuperação automática, limitada a uma geração adicional, para conversas
  antigas que ficaram em `paused_failure` por timeout ou resposta vazia;
- tentativas passam a registrar provedor e modelo utilizados;
- indisponibilidades transitórias continuam abrindo incidente operacional,
  porém sem bloquear a conversa;
- erros não transitórios e entregas ambíguas permanecem bloqueantes para
  evitar mensagens duplicadas.

### Rejeição de horário

- a rejeição de um slot oferecido passou a ser um evento determinístico;
- o slot rejeitado não é oferecido novamente no turno seguinte;
- o agente pergunta: “Qual seria o melhor dia e horário para você?”;
- a resposta seguinte do lead é tratada como preferência de agenda;
- existindo disponibilidade exata, o fluxo usa a reserva normal;
- sem disponibilidade exata, o sistema apresenta o horário mais próximo
  daquele dia e aguarda confirmação;
- sem qualquer slot no dia pedido, solicita outra preferência sem inventar ou
  confirmar um horário.

## Garantias preservadas

- o fallback acontece antes da criação e do envio do outbox;
- a idempotência por job, mensagem de gatilho e fingerprint foi preservada;
- não há repetição automática em casos de entrega ambígua;
- falhas de autenticação, políticas e regras de negócio não são tratadas como
  indisponibilidade transitória.

## Validação

- 856 testes aprovados;
- TypeScript aprovado sem erros;
- build de produção do Next.js concluído;
- nenhuma validação foi feita por controle do Chrome, conforme o guardrail do
  projeto.

## Estado de publicação

As mudanças estão implementadas localmente na branch de correção. A conversa
de produção não deve ser reativada antes da publicação desse código, para não
repetir o comportamento anterior.
