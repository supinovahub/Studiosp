# Relatório — segurança e continuidade de contexto da IA

Data: 29/07/2026

## Alterações

- Tentativas explícitas de prompt injection agora são bloqueadas pelo servidor e redirecionadas ao fluxo comercial pendente.
- Pedidos claramente fora do contexto, quando sucedem uma tentativa de desvio, não alimentam qualificação, resumo, briefing ou agendamento.
- O estado inicial da reativação deixa de prevalecer depois que a qualificação começa.
- A pergunta pendente registrada no contexto semântico passa a orientar esclarecimentos e retomadas.
- Dúvidas como “não sei, o que você recomenda?” sobre imóvel pronto ou na planta recebem uma explicação neutra e mantêm o mesmo campo pendente.
- Perguntas e conteúdo fora do domínio não podem mais ser gravados como bairro ou região.
- Resumos e briefings contaminados por conteúdo explicitamente fora do domínio são descartados.
- Eventos de segurança registram que houve bloqueio e redirecionamento do fluxo.

## Validação

- TypeScript: aprovado.
- Testes direcionados de IA: 53 aprovados.
- Suíte completa: 877 testes aprovados.
- Lint: sem erros; permaneceram 38 avisos preexistentes em arquivos não relacionados.
- Build de produção do Next.js: aprovado.

## Banco de dados

Nenhuma alteração de schema ou migração foi necessária.

## Validação funcional

Conforme o guardrail do projeto, a validação manual do WhatsApp e da interface deve ser realizada pelo responsável do produto, sem automação do Chrome pelo Codex.
