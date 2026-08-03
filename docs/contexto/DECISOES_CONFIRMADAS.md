# Decisões confirmadas

## Produto e operação

- A V1 atende dois perfis principais: dono e corretor.
- O termo visível para a role operacional deve ser “Corretor”, mesmo que contratos internos ainda utilizem `agent`.
- O dono configura regras operacionais, IA, equipe, agenda e publicação de empreendimentos.
- O corretor acessa somente os leads, agenda, pendências e empreendimentos permitidos.
- Áreas administrativas devem ser protegidas no servidor, não apenas escondidas no cliente.

## IA SDR

- A IA coleta a qualificação de forma conversacional e não deve repetir campos já confirmados.
- Mensagens consecutivas do lead formam um único turno antes da escolha da próxima pergunta.
- A reunião só deve ser ofertada depois da qualificação necessária; consulta de disponibilidade e reserva são operações distintas.
- A conversa comercial apresentada ao lead dura de 10 a 15 minutos, com intervalos operacionais de 10 minutos.
- Ao falar de estoque, a IA informa que encontrou “algumas oportunidades”, sem prometer quantidade exata ao lead.
- Dúvida não respondida, pedido de humano, lead quente ou agendamento podem produzir transferência para atendimento humano conforme a política configurada.
- Tentativas reais de manipulação podem pausar a IA e abrir caso na Central de Atenção; perguntas casuais isoladas não devem causar falso positivo.

## Agenda e distribuição

- Uma reunião confirmada entra na fila de corretores.
- O prazo operacional configurado para resposta do corretor é de 30 minutos; testes podem usar prazo reduzido.
- Sem resposta, a oferta segue para o próximo corretor conforme distribuição e contingência.
- Data e horário informados ao lead, reservados no banco e ofertados ao corretor precisam ser idênticos.
- Se o lead rejeitar o primeiro horário, a IA pergunta o melhor dia e horário e busca a alternativa compatível.
- Exceções de horário desejado sem vaga devem gerar aviso ao dono, sem inventar disponibilidade.

## Reativação

- Campanhas nascem de CSV/XLSX revisado pelo dono.
- A primeira abordagem usa o contexto histórico conhecido, com variações de texto para reduzir repetição mecânica.
- O disparo de reativação não depende do interruptor geral de resposta automática da IA.
- O intervalo entre envios da campanha é randômico entre 30 e 50 segundos.
- A campanha deve permitir criar, consultar, editar, excluir quando seguro, arquivar e analisar resultados.

## Empreendimentos

- Empreendimentos em rascunho não são visíveis para corretores até publicação.
- O cadastro deve suportar incorporadora e bairro digitáveis, endereço, situação, entrega, tipologia, metragem, vagas, preços, preço por m² e margem.
- Unidades/condições e mídias pertencem ao contexto comercial do empreendimento.
- Cadastro realizado por corretor deve depender de aprovação ou reprovação do dono antes da publicação.
- Análise documental gera preview e exige aprovação antes de gravar/publicar informações.

## Engenharia

- Staging é o padrão para desenvolvimento; produção exige autorização explícita.
- Novas frentes usam branches/worktrees separadas.
- Não desativar proteções de auditoria para limpar testes.
- Homologação de interface é feita pelo usuário; agentes validam por código, testes, APIs, banco e logs.

