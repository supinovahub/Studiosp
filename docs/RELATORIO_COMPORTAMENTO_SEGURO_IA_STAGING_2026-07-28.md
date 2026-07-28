# Relatório — comportamento seguro da IA no staging

Data: 28/07/2026

Ambiente alterado: Supabase staging

Branch: `feature/ai-conversation-behavior`

## Resultado implementado

- Identidade operacional fixa como Pedro e resposta neutra para perguntas sobre
  identidade.
- Corretores tratados como equipe do Pedro.
- Controle canônico da conversa entre IA ativa, humano ativo, aguardando
  orientação, pausada e encerrada.
- Falta de conhecimento abre orientação do dono sem inventar resposta.
- Central de atenção mostra contexto recente, recebe orientação e retoma o lead.
- Justificativa de retomada varia conforme minutos, horas ou dias de espera.
- Falhas operacionais geram alerta, nova tentativa e opção de assumir o chat.
- Perguntas configuráveis continuam orientando a conversa, mas o sistema
  registra a pergunta esperada em metadado confiável.
- Respostas de qualificação são normalizadas para valores canônicos e mantêm o
  texto original apenas como evidência secundária.
- Faixa `R$ 0 a R$ X` passa a ser tratada como `Até R$ X`.
- Follow-ups respeitam a janela operacional configurada.

## Proteção contra prompt injection

- Conteúdo do lead, histórico, áudio, documento, catálogo e preferências de
  comunicação é tratado como dado não confiável.
- Sinais de tentativa de injeção são auditados sem bloquear automaticamente uma
  conversa legítima.
- Saídas com alegação falsa de identidade, vazamento interno ou mais de uma
  pergunta são reparadas uma vez e, se continuarem inválidas, seguem para o
  dono.
- Descadastro, reserva, atribuição humana e escrita de qualificação têm
  validações determinísticas fora do modelo.
- Reserva só aceita slot previamente oferecido e aceite explícito.
- Extração de IA no banco exige execução e mensagem de origem da mesma
  conta/oportunidade.

## Banco

Migrações aplicadas somente no projeto Studiosp Staging:

- `ai_sdr_guidance_security`;
- `ai_sdr_guidance_fk_indexes`;
- `require_ai_answer_source`;
- `normalize_existing_location_labels`.

As tabelas novas têm RLS e acesso de gestão. Os avisos relacionados encontrados
pelo advisor são apenas índices recém-criados ainda sem uso, o que é esperado
antes da homologação.

## Homologação

Os testes automatizados cobrem identidade, repetição de nome, prompt injection,
descadastro explícito, validação de saída, retomada após orientação,
normalização financeira e proteção da reserva. Os testes com WhatsApp real,
passagem de horas/dias, falha real do provedor e contas com papéis diferentes
permanecem no roteiro manual de homologação.
