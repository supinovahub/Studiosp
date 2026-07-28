# Relatório — redesign Fases 0 e 1

Data: 28 de julho de 2026  
Branch: `redesign/full-ui-refresh`  
Status: implementado, aguardando homologação visual no preview.

## Escopo

- congelamento dos contratos funcionais do shell e das primitives;
- criação da fundação visual compartilhada;
- refinamento do shell, cabeçalho e sidebar;
- padronização dos estados de loading, vazio e erro;
- evolução de botões, cartões, cabeçalhos de página e métricas;
- acessibilidade de teclado e redução de movimento.

## Alterações

- tokens semânticos de sucesso, atenção e informação em claro e escuro;
- superfícies elevadas e rebaixadas com contraste controlado;
- canvas operacional com identidade discreta;
- viewport baseado em `dvh`, prevenção de overflow e largura máxima segura;
- link visível ao foco para pular diretamente ao conteúdo;
- navegação com hierarquia e alvo de toque melhores;
- cabeçalhos com títulos e descrições mais legíveis;
- métricas com números tabulares;
- loading com `role=status`, erro com `role=alert` e retry preservado;
- foco global consistente e suporte a `prefers-reduced-motion`.

## Contratos preservados

Nenhuma rota, role, redirect, hook, callback, endpoint, payload, API, regra de
agenda, pipeline, IA, WhatsApp ou Supabase foi alterado. O detalhamento está em
`docs/CONTRATOS_REDESIGN_FASE_0_2026-07-28.md`.

## Verificações

- TypeScript: aprovado;
- Vitest: 99 arquivos e 791 testes aprovados;
- ESLint: sem erros; 37 avisos preexistentes fora do escopo;
- build Next.js 16.2: aprovado, com aviso preexistente de migração de
  `middleware` para `proxy`;
- revisão React: sem novo waterfall, efeito, assinatura pública ou dependência
  de bundle.

## Limitação de homologação local

O comando `npm run env:staging` não conseguiu recuperar as configurações porque
o vínculo local `.vercel` está desatualizado. Nenhum segredo foi copiado ou
gravado. A rota autenticada local, portanto, não pôde ser usada como evidência
visual final. A homologação visual será feita em preview da branch, que utiliza
as variáveis remotas configuradas.

## Banco e ambientes

O redesign não alterou banco, staging ou produção. Separadamente, por
autorização explícita do owner, os contatos controlados Arthur Rocha
(`5527981168321`) e Matheus (`5527998303052`) foram preparados em produção
para novos testes:

- contatos preservados;
- mensagens, qualificação, jobs de IA, sessões e leads de reativação removidos;
- follow-ups e contexto de matching removidos;
- reunião e oferta ativas canceladas;
- oportunidades devolvidas a `received`, sem corretor, resumo ou qualificação;
- automação reabilitada;
- eventos históricos imutáveis preservados.

## Próxima fase

Após a homologação visual do preview, seguir com Visão geral, Central de
atenção, Meu dia e pendências do corretor. O Inbox permanece fora desta fase
por exigir uma rodada exclusiva de validação funcional e realtime.

## Rollback

- UI: reverter o commit da Fase 1;
- banco: os contextos de teste removidos não são recuperáveis pela aplicação;
  os contatos e eventos históricos foram preservados para rastreabilidade.
