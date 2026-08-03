# Relatório — Simulador isolado do agente SDR

Data: 03/08/2026

Branch: `feature/owner-ai-simulator`

Banco-alvo: Studiosp Staging (`ffeyrxsdlgcfwgnsnwlj`)

## Objetivo

Permitir que o dono teste o comportamento real do Pedro sem criar campanha e sem enviar mensagens, notificações ou ofertas externas. O lead de teste usa as projeções reais de qualificação e pipeline do CRM.

## Implementado

- Nova rota owner-only `/simulador`, protegida no cliente e no servidor.
- Item “Simulador” visível somente para a role `owner`.
- Um lead persistente `Lead teste · Simulador` por dono e conta.
- Conversa simulada usando a configuração de IA atualmente publicada.
- Persistência das mensagens de entrada e saída no banco, marcadas como simulação.
- Uso do orquestrador real de qualificação, matching e pipeline.
- Persistência do contexto semântico entre turnos, igual ao fluxo do WhatsApp.
- Link direto para abrir o lead de teste na tela de Leads.
- Painel lateral com etapa do pipeline, estado da qualificação, reunião e campos capturados.
- Botão “Apagar contexto e recomeçar”.
- Reset transacional de mensagens, respostas de qualificação, matches, follow-ups e estado operacional do lead.
- Migration com tabela `ai_simulation_sessions`, RLS owner-only e funções `SECURITY INVOKER`.

## Isolamento e segurança

- Nenhuma chamada à UAZAPI ou a outro transporte de WhatsApp.
- Nenhuma campanha é criada ou ativada.
- Nenhuma notificação é enviada a corretores.
- Nenhum horário real é reservado.
- O lead é identificado por `source_metadata.simulator = true`.
- Corretores não veem o lead, pois ele não recebe corretor responsável.
- Cada dono só acessa sua sessão dentro da própria conta.
- A criação e o reset são atômicos no Postgres para evitar contexto parcialmente limpo.

## Validações executadas

- `npm run typecheck`: aprovado.
- `npm test`: 111 arquivos e 915 testes aprovados.
- `npm run build`: aprovado; `/simulador` e `/api/studiosp/simulator` incluídos no build.
- ESLint do projeto: sem erros novos; permanecem avisos preexistentes fora do escopo.

## Operação

1. Entrar como dono.
2. Abrir **Gestão → Simulador**.
3. Enviar mensagens como se fosse o lead.
4. Conferir os campos capturados e a etapa do pipeline.
5. Abrir o lead pelo botão **Abrir lead** para validar as telas operacionais reais.
6. Usar **Apagar contexto e recomeçar** antes de um novo cenário.

## Limite intencional desta versão

O simulador testa o comportamento do SDR e os estados internos. Ele não ocupa uma vaga real da agenda nem dispara a fila de corretores, porque isso deixaria de ser um ambiente sem efeitos externos.
