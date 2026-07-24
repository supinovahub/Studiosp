# Correção do agente documental — produção — 24/07/2026

## Problema observado

- Respostas extensas do modelo eram limitadas a 1.024 tokens e chegavam como
  JSON incompleto.
- Um único documento longo era enviado em uma chamada, reduzindo a cobertura de
  empreendimentos.
- A etapa de aprovação ainda estava bloqueada pela interface de homologação e,
  por isso, o preview nunca cadastrava dados no catálogo.
- Documentos mistos com dados pessoais eram bloqueados integralmente, mesmo
  quando continham trechos comerciais que podiam ser isolados com segurança.

## Correções implementadas

- Resposta estruturada em JSON no provedor compatível, limite específico de
  4.096 tokens e reparo defensivo de JSON incompleto.
- Divisão de documentos longos em partes, preservando a relação entre
  empreendimentos e condições comerciais.
- Remoção local de dados e contextos pessoais antes da chamada externa; somente
  os trechos comerciais higienizados seguem para análise.
- Aprovação exclusiva do dono no servidor.
- Botão `Aprovar e cadastrar`, com criação ou atualização de incorporadora,
  bairro, empreendimento e condição comercial.
- Novos empreendimentos entram como `rascunho`, invisíveis para corretores até
  uma publicação posterior.
- Aprovação idempotente por item e registro do evento
  `preview_approved` na auditoria.
- Aumento do tempo máximo das rotas de processamento documental para suportar
  documentos extensos.
- Timeout próprio de 120 segundos por chamada do agente documental, sem alterar
  o limite curto usado no atendimento de WhatsApp.
- Retomada explícita de lotes em estado `falhou`, reiniciando somente as fontes
  com falha e preservando fontes já concluídas.
- Consolidação idempotente do preview: novas tentativas reutilizam itens
  existentes e atualizam campos repetidos sem duplicação.

## Segurança preservada

- Arquivos permanecem na quarentena privada.
- Dados pessoais removidos não são enviados ao provedor nem exibidos no
  preview.
- Documento sem trecho comercial seguramente isolável continua bloqueado.
- Corretor continua sem acesso às APIs de análise e aprovação.
- Aprovar não publica o empreendimento nem o indexa automaticamente para a
  IA-SDR.

## Verificações locais

- TypeScript: aprovado.
- Testes do agente documental: 11 aprovados.
- Suíte completa: 79 arquivos e 707 testes aprovados.
- Build de produção Next.js: aprovado.

## Homologação real em produção

- Deploy final de código: `37739b9`.
- Lote anterior com falha retomado sem reenviar os arquivos.
- `Revista ONE PARCERIAS.pdf`: preview pronto.
- `TABELÃO MATRIZ JUNHO.pdf`: preview pronto.
- `EnvelopePDF.aspx.pdf`: processamento concluído com bloqueio de PII; nenhum
  conteúdo pessoal foi enviado ao provedor externo.
- Preview exibiu 34 propostas documentais, além do empreendimento já existente
  na página, com exemplos como `ATMOS MOEMA`, `Nattur`, `EDGE CAMBUI -
  CAMPINAS` e diversos empreendimentos `NEX ONE`.
- A ação `Aprovar e cadastrar` ficou habilitada.
- A aprovação não foi acionada durante a homologação; nenhum novo
  empreendimento foi gravado no catálogo operacional.
