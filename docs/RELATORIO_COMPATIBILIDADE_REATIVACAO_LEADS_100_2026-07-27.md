# Relatório — Compatibilidade da reativação com Leads - 100.csv

## Ambiente e escopo

- Branch: `codex/v1-platform`
- Aplicação alvo: preview/staging
- Supabase: Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)
- Produção: não alterada
- Disparos WhatsApp: não executados

## Arquivo homologado

O parser foi executado localmente contra `Leads - 100.csv`, sem modificar o
arquivo de origem:

- 100 linhas interpretadas;
- 100 telefones principais válidos;
- nenhum telefone principal duplicado;
- 58 leads classificados como moradia;
- 42 leads classificados como investimento;
- entrada normalizada para R$ 100.000 em todos os registros;
- dois nomes com caracteres corrompidos removidos da saudação;
- colunas originais preservadas em `raw_data`, incluindo ID externo, parcela,
  outros telefones e corretor.

## Alterações

### Importador

- aliases adicionados para `Telefone principal`, `E-mail principal`,
  `Principal objetivo` e perguntas prefixadas por `STUDIOS`;
- objetivos de utilização própria normalizados como moradia;
- aluguel, rentabilização, revenda e ganho de capital normalizados como
  investimento;
- valores abreviados com `k` ou `mil` convertidos corretamente;
- valores pt-BR com separador de milhar tratados corretamente;
- nomes visivelmente corrompidos não são usados na abordagem;
- todas as colunas do arquivo são preservadas para contexto e auditoria.

### Execução da fila

- ativações e retomadas passaram a reivindicar somente mensagens da conta e
  campanha solicitadas;
- foi criado um endpoint administrativo para processar a próxima mensagem
  vencida da própria conta;
- enquanto um owner/admin estiver com o CRM aberto e visível, a fila avança
  uma mensagem por minuto;
- a reivindicação usa atualização condicional para evitar processamento
  concorrente da mesma mensagem;
- campanhas pausadas e leads inelegíveis não são reivindicados;
- o cron diário permanece como contingência da infraestrutura Hobby.

## Verificações

- testes de parser e cadência: 14 aprovados;
- teste temporário com o arquivo real: aprovado;
- TypeScript: aprovado;
- ESLint do escopo: aprovado;
- build Next.js 16.2.11: aprovado;
- nenhuma campanha foi ativada e nenhuma mensagem foi enviada.

## Homologação pendente

O preview da branch foi publicado no commit `9cb768c`. A seleção automática do
arquivo pelo Chrome ficou bloqueada porque a extensão não possui acesso a URLs
de arquivo; por isso, nenhum arquivo foi importado pelo navegador.

1. habilitar acesso a URLs de arquivo na extensão ou selecionar o CSV
   manualmente;
2. analisar o arquivo pela interface e conferir o resumo 100/100;
3. criar a campanha somente como rascunho;
4. duplicar uma amostra com 1–3 números controlados;
5. validar D0, espaçamento, resposta e cancelamento das próximas mensagens;
6. somente depois decidir sobre a ativação da base completa.

## Rollback

Reverter os arquivos de parser, worker, heartbeat e endpoint desta entrega. Não
há migration nova nem alteração destrutiva no banco.
