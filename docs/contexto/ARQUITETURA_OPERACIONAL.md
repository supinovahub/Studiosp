# Arquitetura operacional

## Visão geral

```text
WhatsApp/UAZAPI
      |
      v
Webhook e persistência de mensagens
      |
      v
Fila durável de resposta da IA
      |
      +--> segurança e domínio
      +--> agrupamento do turno
      +--> extração/persistência da qualificação
      +--> matching de empreendimentos
      +--> disponibilidade e reserva
      +--> resposta/outbox idempotente
      |
      v
Inbox, lead, pipeline, agenda e Central de Atenção
```

## Componentes relevantes

- Next.js App Router serve dashboard e rotas de API.
- Supabase concentra Auth, Postgres, RLS, storage e contratos operacionais.
- UAZAPI conecta a instância WhatsApp e entrega eventos ao webhook.
- Provedor de IA executa extração estruturada e redação, cercado por validações determinísticas.
- Vercel publica aplicação, rotas e tarefas agendadas.

## Princípios

- Mensagem recebida é registrada antes do processamento.
- Jobs de IA possuem identidade, versão de contexto, lease, retries e resultado terminal.
- A mesma entrada não deve gerar duas respostas externas.
- Qualificação é persistida por pergunta canônica e evidência de mensagem.
- O modelo sugere; regras críticas de segurança, disponibilidade e reserva são validadas no servidor.
- Eventos e auditoria relevantes são imutáveis.
- Falha técnica deve ser observável e recuperável sem deixar a conversa indefinidamente em “processando”.

## Fluxo comercial alvo

```text
entrada/reativação
  -> qualificar
  -> informar algumas oportunidades
  -> consultar disponibilidade
  -> lead escolhe horário
  -> reservar
  -> ofertar aos corretores
  -> corretor aceita/rejeita/transfere
  -> realizar call
  -> corretor finaliza e registra status
  -> restringir novas interações do corretor quando aplicável
  -> movimentar pipeline e auditoria
```

## Leituras técnicas

- [Modelo de dados](../MODELO_DADOS_V1_STUDIOSP.md)
- [Especificação V1](../ESPECIFICACAO_V1_STUDIOSP.md)
- [Robustez da IA](../RELATORIO_ROBUSTEZ_IA_2026-07-27.md)
- [Orquestração de agendamento](../RELATORIO_ORQUESTRACAO_AGENDAMENTO_2026-07-27.md)
- [Segurança híbrida](../RELATORIO_BLOQUEIO_HIBRIDO_SEGURANCA_IA_2026-07-30.md)

