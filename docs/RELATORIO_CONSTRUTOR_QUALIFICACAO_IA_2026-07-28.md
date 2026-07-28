# Relatório — Construtor seguro da qualificação

Data: 28 de julho de 2026

Branch: `feature/ai-conversation-behavior`

Ambiente de banco: Supabase Studiosp Staging (`vgmmfzdifjhpqaopxfbj`)

## Resultado

O cadastro simples de frases foi substituído por um construtor de informações
de qualificação. O Dono configura o que a IA precisa descobrir, como validar e
quando usar cada informação. A IA continua responsável por formular uma
pergunta curta e contextual, sem transformar a configuração em roteiro rígido.

## Alterações funcionais

- nome interno separado do objetivo conversacional;
- exemplo opcional de pergunta, usado apenas como referência e contingência;
- exemplos de resposta e orientação para esclarecer ambiguidades;
- tipos normalizados de texto, escolha, dinheiro, localização, período e
  booleano;
- opções com aliases e exigência de ao menos duas alternativas;
- resposta explícita “não sei” configurável;
- campos complementares ou obrigatórios;
- condições baseadas somente em informações anteriores;
- reordenação com validação de dependências;
- objetivos essenciais protegidos contra desativação, mudança de tipo,
  obrigatoriedade ou condição;
- limite de 25 informações personalizadas ativas;
- detecção de nomes duplicados.

## Integração da IA

- a extração recebe apenas campos aplicáveis ao estado confirmado do lead;
- `validation_schema` participa da normalização e dos limites financeiros;
- exemplos nunca são tratados como evidência;
- condições órfãs ou inválidas são consideradas não aplicáveis;
- o próximo objetivo, orientação e critérios entram no contexto operacional;
- a pergunta final é formulada conforme o turno, preservando no máximo uma
  pergunta por mensagem;
- a conclusão considera somente campos obrigatórios visíveis, além da
  referência financeira já exigida pela operação.

## Banco e segurança

Migrations aplicadas somente em staging:

- `20260728174608_qualification_information_builder.sql`;
- `20260728175853_qualification_visibility_dependency_guard.sql`.

As gravações e reordenações usam funções atômicas `security invoker`, RLS e
verificação de perfil administrativo. Funções de escrita não foram abertas para
`anon`. Produção não recebeu migrations.

## Verificações

- 816 testes automatizados aprovados;
- TypeScript aprovado;
- ESLint dos arquivos alterados aprovado;
- build de produção do Next.js aprovado, com 83 páginas geradas;
- migration aplicada com sucesso no staging;
- funções conferidas quanto a assinatura e modo de segurança;
- avaliador SQL conferido para condição permanente e condição órfã;
- Advisors executados após o DDL: nenhum alerta novo atribuído às funções desta
  entrega.

O lint global ainda possui 33 erros e 37 avisos preexistentes em arquivos não
alterados por esta entrega, principalmente regras de hooks introduzidas pelo
toolchain atual. Essa dívida não foi misturada ao escopo da qualificação.

## Homologação manual pendente

1. Editar orientação e exemplo de um objetivo essencial e salvar.
2. Confirmar que tipo, obrigatoriedade, atividade e condição essencial estão
   bloqueados.
3. Criar um campo de escolha personalizado com duas opções e aliases.
4. Criar um campo obrigatório condicionado a uma opção anterior.
5. Alterar a ordem e confirmar que o sistema impede mover a dependência para
   depois do campo condicionado.
6. Simular conversa em que a condição não se aplica e confirmar que a IA não
   pergunta o campo.
7. Simular conversa em que a condição se aplica e confirmar pergunta natural,
   normalização e bloqueio da conclusão até resposta válida.
8. Confirmar que uma resposta “não sei” só é aceita quando essa permissão
   estiver ligada.

## Rollback

Enquanto a branch não for promovida, o frontend volta ao estado anterior
removendo esta branch/preview. O staging não deve ser apagado porque é
compartilhado com outras frentes.

Se houver rollback do banco, ele deve ser feito por uma nova migration:

1. remover as duas funções públicas do construtor;
2. remover o avaliador privado de condição;
3. restaurar a versão anterior de
   `studiosp_finalize_qualification_if_ready`;
4. preservar perguntas, opções e respostas já existentes;
5. validar o histórico de migrations e os Advisors novamente.

Nenhum rollback deve reverter migrations de outras features ou recriar o banco
staging.
