# Relatório — cadastro de imóvel por corretor

Data: 29/07/2026  
Branch: `feature/broker-development-submissions`  
Produção: inalterada

## Entregue no código

- liberação da tela de Empreendimentos para o perfil Corretor;
- criação e edição apenas dos próprios rascunhos;
- criação conjunta do empreendimento e da primeira unidade/condição;
- upload múltiplo de imagens e arquivos por empreendimento;
- bloqueio de edição e upload depois do envio para revisão;
- estado visual de rascunho, aguardando aprovação, reprovado e publicado;
- motivo de reprovação visível ao corretor;
- pendência automática na Central de atenção do dono;
- ações do dono para reprovar ou aprovar e publicar;
- publicação conjunta das mídias aprovadas;
- validação de autorização na API e no Supabase RLS;
- funções transacionais para impedir imóvel pendente sem pendência de revisão,
  ou publicação parcialmente concluída.

## Banco

A migration
`supabase/migrations/20260729103000_broker_development_submissions.sql`
adiciona os estados de submissão, metadados de revisão, índices, políticas RLS
e as funções transacionais de envio e decisão.

O Supabase Staging anterior foi excluído durante o desenvolvimento. Um novo
projeto gratuito e isolado foi criado em São Paulo:
`ffeyrxsdlgcfwgnsnwlj`. As 90 migrations existentes e as migrations desta
entrega foram aplicadas nele. Produção não recebeu mudanças.

Durante o bootstrap foram corrigidos dois problemas de reprodutibilidade:

- migrations históricas que falhavam quando a função alvo já possuía o estado
  final passaram a ser idempotentes;
- o valor padrão do intervalo de agenda passou de 5 para 10 minutos, alinhado
  à restrição atual e permitindo que novas contas sejam criadas.

## Validações locais

- ESLint dos arquivos alterados: aprovado;
- TypeScript (`tsc --noEmit`): aprovado;
- build de produção do Next.js 16: aprovado;
- suíte automatizada: 100 arquivos e 796 testes aprovados;
- `main`: sem alterações;
- arquivos temporários preexistentes em `.superdesign/tmp/`: preservados e
  fora do escopo.

## Homologação no novo staging

Preview:
`https://studiosp-git-feature-broker-development-submissions-brio5.vercel.app`

Fluxo validado em 29/07/2026:

1. login e ativação do perfil Corretor;
2. cadastro do `Residencial QA Corretor` com incorporadora, bairro, endereço e
   primeira condição comercial;
3. upload múltiplo real de duas imagens JPG;
4. envio do rascunho para aprovação do Dono;
5. criação automática da pendência na Central de atenção;
6. reprovação com motivo e retorno do cadastro ao estado editável;
7. reenvio do imóvel para análise;
8. aprovação e publicação;
9. conferência direta no banco.

Resultado final conferido:

- empreendimento com `status = published`;
- submissão com `submission_status = approved`;
- uma condição comercial ativa;
- duas mídias publicadas;
- nenhuma pendência de revisão aberta.

Durante a homologação foram encontradas e corrigidas duas falhas:

- a política do Storage interpretava o nome da coluna do caminho dentro de uma
  subconsulta como o nome do empreendimento, bloqueando imagens do corretor;
- as funções de envio e revisão dependiam de privilégios diretos sobre
  `attention_items`, o que permitia cadastro, mas bloqueava a criação da
  pendência. As transações agora executam com privilégio controlado e mantêm as
  verificações explícitas de autor e papel.

Também foi adicionada leitura dos dados comerciais e das mídias pelo corretor
durante os estados `draft`, `pending` e `rejected`, sem liberar edição enquanto
o cadastro aguarda o Dono.

## Observações da infraestrutura

- O projeto `Dash-Studio` foi pausado, de forma recuperável, para liberar uma
  vaga do plano gratuito.
- O Supabase novo permanece isolado da produção.
- Os advisors ainda apontam avisos preexistentes de segurança e desempenho,
  como funções `SECURITY DEFINER`, políticas permissivas sobrepostas e objetos
  sem índices. Eles devem ser tratados em uma revisão específica antes de
  promover esta branch.
- O preview possui URL e chave anônima específicas do staging. Rotinas
  independentes que exigem `SUPABASE_SERVICE_ROLE_KEY` ainda precisam receber a
  chave da nova staging na Vercel; isso não impediu o fluxo autenticado de
  cadastro, revisão, Storage e publicação testado neste relatório.

## Pendência residual

- Repetir o cenário com um segundo corretor para comprovar, via interface, que
  ele não lê nem altera rascunhos pertencentes ao primeiro. As políticas RLS
  foram implementadas para esse isolamento, mas a staging atual possui apenas
  um perfil de corretor de teste.
