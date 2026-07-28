# Relatório — link global de corretores no staging

Data: 28 de julho de 2026

Branch: `feature/global-broker-invite-link`

Banco: Supabase Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)

## Resultado

Foi adicionada à gestão da equipe uma opção exclusiva do Dono para gerar um
link global e reutilizável. Vários corretores podem usar a mesma URL para criar
acessos individuais, sempre com confirmação do WhatsApp operacional.

## Segurança e dados

- texto puro do token retornado somente na criação/rotação;
- banco armazena apenas SHA-256;
- RLS ativo nas duas novas tabelas;
- leitura de links e resgates exclusiva do Dono;
- gestão e resgate protegidos por identidade e papel dentro dos RPCs;
- um link ativo por conta, garantido por índice único parcial;
- retries do mesmo corretor são idempotentes;
- todas as chaves estrangeiras novas possuem índice;
- criação, rotação, desativação e resgate geram auditoria.

## Validações automatizadas

- TypeScript: aprovado;
- ESLint nos arquivos alterados: aprovado;
- Vitest: 100 arquivos e 796 testes aprovados;
- objetos, RLS, políticas, índices e permissões verificados no staging.

## Pendente de homologação humana

O fluxo completo com dois novos usuários, cópia do link, rotação, desativação e
validação visual em desktop/celular deve ser executado no preview da Vercel
antes de qualquer promoção para produção.
