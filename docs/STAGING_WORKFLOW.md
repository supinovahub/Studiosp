# Fluxo seguro de staging

Este repositório usa ambientes separados para evitar que desenvolvimento local
ou branches de correção acessem o banco de produção.

## Preparação

1. Trabalhe em uma branch diferente de `main`.
2. Confirme que o diretório está vinculado ao projeto `studiosp` da Vercel.
3. Execute `npm run env:staging`.
4. Confira localmente, sem publicar valores, que
   `NEXT_PUBLIC_SUPABASE_URL` contém o project ref
   `vgmmfzdifjhpqaopxfbj` (**Studiosp Staging**).
5. Execute `npm run typecheck`, `npm test` e `npm run build`.

O arquivo `.env.local` é ignorado pelo Git e nunca deve ser commitado.

## Banco de dados

- Novas migrations devem ser criadas em `supabase/migrations`.
- A migration deve ser aplicada e validada primeiro no projeto
  **Studiosp Staging** (`vgmmfzdifjhpqaopxfbj`).
- Não aplicar migrations no projeto **Studiosp** de produção durante o
  desenvolvimento.
- Antes de promover, executar os advisors de segurança e desempenho e registrar
  no relatório o que foi corrigido, aceito ou adiado.

## Deploy

Branches de correção usam Preview/Staging. A promoção para produção ocorre
somente após homologação explícita e merge na `main`.

