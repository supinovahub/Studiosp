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

## Homologação pendente

No novo staging:

1. testar cadastro e duas imagens como Corretor;
2. testar reprovação com motivo e reenvio;
3. testar aprovação e publicação como Dono;
4. tentar acessos indevidos com um segundo Corretor;
5. confirmar registros, mídias e pendências diretamente no banco;
6. executar os advisors do Supabase.
