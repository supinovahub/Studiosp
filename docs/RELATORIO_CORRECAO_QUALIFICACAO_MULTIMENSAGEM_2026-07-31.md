# Correção da qualificação em mensagens rápidas — 31/07/2026

## Problema confirmado

No caso real do Arthur, o sistema recebeu em sequência “faz sim”, “eu tenho 5 milhoespra gastar” e “e queria morar em um bairro tipo Higienópolis”. O lote chegou completo, mas apenas o objetivo “morar” foi persistido. O orçamento e a localização foram ignorados, e a próxima resposta repetiu a pergunta de preço total.

## Causa

- O prompt de extração mandava considerar somente a última mensagem do lead.
- A validação de evidência comparava candidatos da IA somente com essa última mensagem.
- A regra determinística não tolerava “milhoespra” sem espaço.
- Uma localização explícita não era extraída quando a mesma mensagem também continha outro fato, como o objetivo de compra.

## Correções

- Todo o bloco de mensagens rápidas passou a ser apresentado ao extrator como uma única fala, em ordem cronológica.
- Cada resposta extraída é validada contra a mensagem específica que contém sua evidência.
- Valores informais como “5 milhoespra gastar” passam a ser reconhecidos como orçamento total de R$ 5 milhões.
- Uma mesma mensagem pode confirmar simultaneamente objetivo e localização.
- A seleção da próxima pergunta continua ocorrendo somente após a atualização das respostas persistidas.

## Validação automatizada

- 111 arquivos de teste aprovados.
- 911 testes aprovados.
- Typecheck aprovado.
- Build de produção aprovado.
- Caso de regressão incluído para orçamento, objetivo e localização enviados em mensagens rápidas.

## Homologação pendente

A validação visual e operacional pelo WhatsApp permanece a cargo do usuário, conforme o protocolo do projeto.
