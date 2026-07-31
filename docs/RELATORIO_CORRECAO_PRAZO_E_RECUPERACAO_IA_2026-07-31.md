# Correção de prazo e recuperação da IA — 31/07/2026

## Falha confirmada

A conversa real persistiu objetivo, região e valores corretamente, mas rejeitou “em até dois anos” e “dois anos” como prazo de compra. A tentativa de repetir a pergunta foi barrada pela proteção de duplicidade e a conversa terminou em `paused_failure`.

## Correções

- Prazos com números por extenso de um a dez, em meses ou anos, agora são convertidos para as opções canônicas da qualificação.
- “dois anos”, “em até dois anos” e “daqui a dois anos” são persistidos como `over_twelve_months` / “Mais de 12 meses”.
- Uma resposta duplicada que não puder ser reparada continua gerando registro operacional, mas não transforma a conversa em falha nem pausa automaticamente a IA.
- Resumos de leads com objetivo de morar não podem transformar prazo de compra em previsão de venda.

## Validação

- 111 arquivos de teste aprovados.
- 915 testes aprovados.
- Typecheck aprovado.
- Build de produção aprovado.
- Regressões adicionadas para as três formas naturais de informar dois anos e para o resumo de moradia.

## Homologação pendente

A validação ponta a ponta pelo WhatsApp permanece pendente de execução manual pelo usuário.
