# Problemas conhecidos e riscos

## Confirmados ou recorrentes

- Conversas da IA já apresentaram repetição de perguntas, perda de contexto, falhas de normalização e pausas indevidas. As últimas correções têm testes automatizados, mas a homologação real posterior precisa ser registrada.
- Latência de respostas da IA pode ser elevada mesmo quando o job conclui sem erro.
- Disponibilidade e agendamento são sensíveis à diferença entre texto sugerido, slot garantido e reserva efetiva.
- Integração WhatsApp depende de credenciais, instância e webhooks externos; conexão visual não prova entrega bidirecional.
- Histórico de outro número/instância pode contaminar o inbox se a identidade da conexão não for aplicada em todas as consultas.

## Riscos de processo

- Existem muitas branches locais e remotas históricas. Não fazer merge por nome; comparar commits e ancestralidade.
- Existem dois clones registrados no Orca, com estados diferentes.
- Relatórios antigos podem descrever código posteriormente revertido ou substituído.
- Alterações diretas no banco sem migration podem criar divergência entre ambientes.

## Dívidas já identificadas

- Métricas parcialmente calculadas no navegador.
- Estados de carregamento ainda precisam de cobertura consistente de timeout, erro e retry.
- Datas relativas e textos em português devem continuar sendo auditados.
- Upload múltiplo precisa apresentar resultado individual ou comportamento transacional claro.
- Advisors de segurança e desempenho do Supabase requerem revisão separada.

## Como tratar

- Reproduzir com IDs técnicos e timestamps.
- Consultar jobs, runs, mensagens, respostas persistidas e estado da conversa.
- Criar teste de regressão antes da correção.
- Evitar sucessivos patches locais sem identificar a camada causal.
- Registrar no relatório se a correção foi apenas automatizada ou também homologada manualmente.

