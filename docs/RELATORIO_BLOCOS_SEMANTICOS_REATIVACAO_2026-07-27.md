# Relatório — blocos semânticos na reativação

Data: 27/07/2026

## Regra confirmada

A primeira abordagem da reativação deve parecer uma conversa humana. O D0 é
dividido em quatro mensagens:

1. saudação;
2. contexto do atendimento anterior;
3. dado conhecido, como valor de entrada;
4. pergunta de confirmação.

## Implementação

- As 12 variantes continuam determinísticas por lead.
- Cada variante agora produz partes estruturadas, além do texto consolidado
  usado em previews e compatibilidade.
- O worker envia as partes em ordem, com uma pausa curta entre elas.
- O evento registra todos os IDs retornados pelo provedor e a quantidade de
  partes.
- Se o provedor falhar depois de uma parte enviada, o toque é marcado como
  falha sem retry automático, evitando repetir as primeiras bolhas.

## Escopo

O intervalo aleatório de 30 a 50 segundos continua sendo aplicado entre leads.
O intervalo curto entre bolhas é independente dessa proteção.
