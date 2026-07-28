# Incidente — retry após reserva de reunião

Data: 27/07/2026

## Evidência

- Conversa: Arthur Rocha.
- A mensagem de aceite entrou às 00:33:04 UTC.
- A reunião das 08:00 foi persistida às 00:33:28 UTC.
- O envio da confirmação falhou duas vezes com `WhatsApp disconnected`.
- O job ficou em `retrying` e concluiu na terceira tentativa às 00:40:33 UTC.
- No retry, o sistema recalculou a agenda, viu a vaga já consumida pela própria
  reserva e ofereceu horários alternativos ao lead.

## Causa

Faltava continuidade idempotente entre dois efeitos:

1. reserva atômica no banco;
2. envio da confirmação pelo WhatsApp.

O retry repetia toda a orquestração em vez de retomar a confirmação da reserva
já vinculada à mensagem de aceite.

## Correção

- O orquestrador procura um evento `appointment_reserved` cuja chave de
  idempotência pertença à mesma mensagem recebida.
- Quando encontra uma reunião ainda ativa, não executa extração, matching ou
  consulta de novos slots.
- A resposta passa a ser deterministicamente a confirmação da reunião
  existente.
- A notificação pendente do corretor também é retomada.

## Estado do incidente

O job real se recuperou na terceira tentativa. A reunião permaneceu registrada
para 28/07/2026 às 08:00 e a oportunidade ficou em `meeting_scheduled`.
