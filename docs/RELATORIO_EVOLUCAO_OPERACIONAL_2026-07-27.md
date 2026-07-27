# Relatório de evolução operacional — 27/07/2026

## Ambiente

- Branch: `codex/v1-platform`, sincronizada com a `main`.
- Banco alterado: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`).
- Produção: não alterada.

## Implementado

1. Whitelist `AI_AUTOREPLY_ALLOWED_NUMBERS` para respostas automáticas da IA.
2. Reativação com abordagem especializada apenas em D0.
3. Cadência configurável de um a quatro contatos, entre D0 e D90.
4. Cancelamento da cadência na resposta e continuidade pela IA-SDR normal.
5. Ação `Call finalizada` com resultado, resumo, pipeline e fechamento do chat.

## Banco

- Migration `20260727103000_complete_broker_call.sql`.
- Aplicada somente em staging.
- Função `SECURITY INVOKER`, `search_path` fixo e sem execução por `anon`.

## Verificações

- 20 testes direcionados aprovados.
- TypeScript sem erros.
- Função e permissões confirmadas no staging.
- Nenhum alerta novo nos advisors.

## Avisos preexistentes

- `pg_net` no schema público.
- Funções `SECURITY DEFINER` antigas expostas.
- Proteção de senhas vazadas desativada.

## Pendente

- Configurar a whitelist no Preview.
- Homologar permitido versus bloqueado, cadência curta e resposta.
- Homologar com corretor: aceite, chat, call finalizada, pipeline e chat fechado.
- Receber exemplo real para melhorar a importação de empreendimentos.

## Correções após homologação

- A whitelist passou de variável técnica para campo visível em
  **Configurações → IA**, persistido por conta.
- O staging foi inicializado com os dois números controlados já aprovados.
- Removida a auditoria duplicada que causava `permission denied for table
audit_events` e revertia a conclusão da call.
- Criada uma oferta de reunião somente no dashboard para o corretor Arthur
  Alves Rocha aceitar manualmente, sem disparo de WhatsApp.

## Importação documental e centralização da IA

- Os PDFs Tabelão Matriz Junho, Revista ONE Parcerias e EnvelopePDF foram
  inspecionados como massa de homologação, sem aprovação ou gravação no
  catálogo.
- A extração de PDF agora preserva o marcador de página e busca todos os
  empreendimentos, em vez de resumir o portfólio.
- Imagens grandes são extraídas para a quarentena privada, limitadas a 60
  itens, 5 MB por imagem e 20 MB por fonte.
- O preview associa imagens ao empreendimento, propõe capa e categoria com
  confiança explícita e permite ao dono trocar a capa ou a categoria.
- Somente a aprovação copia as imagens para `development-media`; elas entram
  como rascunho, `owner_only`, sem publicação ou indexação automática.
- A tela Inteligência passou a concentrar também as credenciais do modelo. O
  atalho de Configurações aponta para essa rota única.
- Verificações locais: typecheck aprovado, 84 arquivos de teste e 725 testes
  aprovados, build Next.js aprovado.
- Preview Vercel `74170d7` ficou `READY` e a rota unificada de Inteligência foi
  confirmada com a conta do owner.
- Nova análise controlada da Revista ONE no staging terminou em `Preview
pronto` com 26 itens estruturados e 29 imagens editáveis.
- A troca de categoria de uma imagem foi persistida e recarregada no preview.
- O botão de aprovação ficou disponível, mas não foi acionado; o catálogo
  permaneceu com um empreendimento já existente e nenhum item da revista foi
  gravado.
