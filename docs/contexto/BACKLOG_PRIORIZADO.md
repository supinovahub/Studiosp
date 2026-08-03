# Backlog priorizado

Este backlog é uma fotografia de retomada, não substitui decisões posteriores do dono.

## P0 — confiabilidade operacional

- Homologar ponta a ponta a última correção da IA SDR em conversa limpa.
- Medir e reduzir latência de respostas que chegam a dezenas de segundos.
- Garantir recuperação automática de jobs temporariamente falhos sem duplicar envio.
- Testar agendamento, aceite do corretor, recusa, transferência, redistribuição e expiração com múltiplos corretores.
- Confirmar que data/hora são idênticas no WhatsApp, banco, agenda e oferta ao corretor.

## P1 — segurança e permissões

- Ampliar testes de integração de owner/corretor nas APIs administrativas.
- Revisar advisors do Supabase: funções expostas, proteção de senha, extensões, índices, RLS duplicada.
- Auditar mudanças de disponibilidade com autor, estado anterior, novo estado e horário.
- Homologar pausa/liberação de IA por tentativa maliciosa e falsos positivos.

## P1 — produto

- Homologar submissão de empreendimento pelo corretor e aprovação pelo dono.
- Validar CRUD completo de empreendimento, primeira unidade/condição e imagens.
- Robustecer importação documental com layouts diversos e classificação de foto principal/interior.
- Consolidar áreas de configuração de IA para reduzir fragmentação da UX.
- Revisar filtros e exportação CSV dos relatórios.

## P2 — escala e observabilidade

- Mover métricas pesadas do navegador para agregações/views seguras no Postgres.
- Adicionar monitoramento estruturado de erros frontend e APIs.
- Documentar fluxo reproduzível de variáveis de staging para build local.
- Criar testes de carga para campanhas, inbox e filas de IA.

