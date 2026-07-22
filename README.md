# Studiosp

CRM em português do Brasil para a operação comercial de studios, com contatos, caixa de entrada compartilhada, funis, negócios, campanhas, automações e fluxos de atendimento pelo WhatsApp.

O Studiosp foi criado a partir do projeto de código aberto [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm), distribuído sob a licença MIT. Esta versão acrescenta identidade própria, localização pt-BR, moeda padrão em real e integração com a UAZAPI.

## Recursos

- Caixa de entrada compartilhada e histórico de mensagens.
- Cadastro de contatos, etiquetas e campos personalizados.
- Funis de venda e acompanhamento de negócios.
- Campanhas, modelos, respostas rápidas, automações e fluxos.
- Agente de IA opcional com chave própria da OpenAI ou Anthropic.
- Equipes, convites, funções de acesso, chaves de API e webhooks.
- WhatsApp pela UAZAPI ou pela API oficial da Meta.
- Banco, autenticação, armazenamento e tempo real com Supabase.

## Integração com a UAZAPI

Em **Configurações → WhatsApp**, selecione UAZAPI, informe a URL HTTPS da instância e o token, salve e conecte o número por QR Code ou código de pareamento. Depois do deploy, o Studiosp registra o webhook automaticamente.

> A UAZAPI usa um método não oficial de conexão com o WhatsApp. Isso pode contrariar os termos da plataforma e causar restrições ou bloqueio do número. Use um número empresarial dedicado, respeite o consentimento dos contatos e evite disparos agressivos.

## Desenvolvimento local

Requisitos: Node.js 20 ou superior e um projeto Supabase.

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Variáveis essenciais:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_LOCALE=pt-BR
```

Gere `ENCRYPTION_KEY` com 32 bytes aleatórios representados em hexadecimal (64 caracteres). Nunca publique chaves reais no repositório.

## Banco de dados

As migrações estão em `supabase/migrations`. Em um projeto vinculado ao Supabase:

```bash
npx supabase db push
```

Todas as tabelas de negócio usam RLS e escopo por conta. A migração mais recente adiciona o provedor UAZAPI e define BRL como moeda padrão.

## Verificação

```bash
npm run typecheck
npm test
npm run build
```

## Deploy

O projeto é compatível com Vercel. Configure as mesmas variáveis de ambiente no projeto de produção e defina `NEXT_PUBLIC_SITE_URL` com a URL pública do deploy.

## Licença e atribuição

MIT. Consulte [LICENSE](./LICENSE). O trabalho original pertence a Arnas Donauskas e aos colaboradores do [wacrm](https://github.com/ArnasDon/wacrm).
