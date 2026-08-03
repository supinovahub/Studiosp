# Estado atual

Fotografia gerada em 03/08/2026. Confirme novamente Git, Vercel e Supabase antes de agir.

## Código

- Branch observada: `main`.
- Commit de referência: `b04b65f` — `fix(ai): persist natural purchase horizons`.
- Commit anterior relevante: `d05a8c9` — consolidação de mensagens rápidas na qualificação.
- Produção observada no encerramento da última fase: `https://studiosp.vercel.app`.
- Última validação automatizada registrada: 111 arquivos e 915 testes aprovados, typecheck e build aprovados.
- Há diretórios locais não rastreados e fora do escopo funcional: `.agents/skills/orchestrate-project/` e `.superdesign/tmp/`. Não incluir, remover ou alterar sem revisão específica.

## Situação funcional resumida

- A V1 reúne operação, inbox, leads, pipeline, agenda, follow-ups, empreendimentos, equipe, inteligência, relatórios e auditoria.
- Reativação de base possui importação, campanhas, cadência, variação de abordagem, arquivamento e visão de logs.
- A IA SDR possui qualificação estruturada, proteção de domínio, persistência das respostas, matching e integração com agendamento.
- O fluxo de corretores possui convite, disponibilidade, oferta de reunião, confirmação e registro de fatos humanos.
- O catálogo aceita dados comerciais, unidades/condições e mídias; o fluxo de submissão por corretor precisa ser conferido na branch e no ambiente antes de ser declarado homologado.
- A UI publicada usa a repaginação em tons terrosos; existe uma branch histórica de redesign radical que não deve ser presumida como incorporada.

## Últimas correções da IA SDR

- Mensagens rápidas passaram a ser consideradas como uma única fala.
- Evidências são vinculadas à mensagem de origem correta.
- Valores informais e múltiplos campos por turno receberam cobertura determinística.
- Prazos naturais como “dois anos” são normalizados para a opção canônica.
- Bloqueio de resposta duplicada não deve mais pausar automaticamente a conversa.
- Resumos de leads que querem morar não devem transformar prazo de compra em previsão de venda.

Evidências: [qualificação multimensagem](../RELATORIO_CORRECAO_QUALIFICACAO_MULTIMENSAGEM_2026-07-31.md) e [prazo e recuperação](../RELATORIO_CORRECAO_PRAZO_E_RECUPERACAO_IA_2026-07-31.md).

## Estado de homologação

- Testes automatizados da última correção: aprovados.
- Build: aprovado.
- Homologação visual e conversa real após a última correção: deve ser confirmada pelo usuário.
- Não assumir que branches históricas locais ou remotas foram incorporadas à `main`; verificar ancestralidade antes de qualquer merge.

## Próxima retomada

1. Atualizar o clone do Orca até `origin/main`.
2. Confirmar que existe apenas um repositório Studiosp sendo usado como fonte de trabalho no Orca.
3. Criar uma worktree por tarefa, partindo de `origin/main`.
4. Escolher um item do [backlog priorizado](BACKLOG_PRIORIZADO.md).

