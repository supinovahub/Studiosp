# Homologação da V1 do Studiosp

Este roteiro cobre somente validações que dependem de navegador, contas reais, WhatsApp, credenciais de IA, usuários diferentes ou passagem de tempo. A compilação, a tipagem e a suíte automatizada são verificadas antes da publicação.

## Regras do ambiente

- Use apenas a URL de homologação ligada à branch `codex/v1-platform`.
- Não use dados de produção.
- Os envios externos começam bloqueados.
- O processamento recorrente roda a cada cinco minutos pelo Supabase; ele não depende do plano da Vercel.
- O preview permanece protegido pela Vercel; o relógio usa um segredo de automação guardado no Vault do Supabase.
- Para testar WhatsApp, cadastre primeiro números controlados em `OUTBOUND_TEST_NUMBERS`; não ative envios gerais.
- Não promova a branch nem exclua o banco de homologação antes da aprovação expressa do dono.

## 1. Acesso e perfis

### Dono

1. Entre com o usuário do dono.
2. Confirme a navegação: Visão geral, Central de atenção, Leads, Pipeline, Agenda, Follow-ups, Empreendimentos, Equipe, Inteligência, Relatórios e Configurações.
3. Confirme que os textos, erros, vazios, botões e descrições aparecem em português do Brasil.

Resultado esperado: acesso completo às áreas administrativas e operacionais.

### Corretor

1. Convide um segundo usuário como corretor.
2. Entre com esse usuário, preferencialmente em uma janela anônima.
3. Tente abrir diretamente as rotas administrativas.

Resultado esperado: o corretor vê Meu dia, suas pendências, conversas, leads, agenda, catálogo em leitura e disponibilidade; não consegue alterar configurações, catálogo nem dados de outro corretor.

## 2. Catálogo e mídias

1. Cadastre uma incorporadora e um bairro.
2. Cadastre um empreendimento com descrição, situação, destaques e observações internas.
3. Cadastre duas opções comerciais com metragens, preço, entrada e parcela.
4. Envie vários arquivos de uma vez, incluindo imagem e PDF.
5. Abra os arquivos pela biblioteca e publique o empreendimento.
6. Entre como corretor e confirme o acesso em leitura.

Resultado esperado: dados persistidos, arquivos privados acessíveis somente por usuário autorizado e empreendimento disponível para compatibilidade apenas depois de publicado.

## 3. Qualificação por IA

1. Configure uma credencial de IA válida e o estilo de comunicação.
2. Revise as perguntas ativas; adicione uma pergunta personalizada e desative outra.
3. Envie mensagens de um número de teste respondendo fora de ordem, com linguagem informal e uma digressão.
4. Envie também um áudio curto.

Resultado esperado: a conversa permanece natural; a IA faz no máximo uma pergunta por vez; respostas são normalizadas no lead; o áudio aparece transcrito; pergunta desativada não é cobrada; a IA não vende, não negocia e não cita empreendimento, preço, unidade, foto ou link específico.

## 4. Compatibilidade de imóveis

1. Use respostas que combinem com mais de um empreendimento publicado.
2. Confira a mensagem ao lead e o detalhe interno do lead.

Resultado esperado: o lead recebe apenas a quantidade de oportunidades compatíveis; dono e corretor recebem a lista interna, os critérios, os alertas e o resumo comercial.

## 5. Agendamento e concorrência

1. Configure horários garantidos para pelo menos dois corretores.
2. Faça o lead informar apenas um período, como “terça à tarde”.
3. Confirme que a IA oferece horários reais e só reserva depois do aceite exato.
4. Tente aceitar o mesmo horário simultaneamente com dois leads.

Resultado esperado: o lead não fica esperando o corretor; a reserva é imediata dentro da capacidade; duas reservas não ultrapassam a capacidade configurada.

## 6. Confirmação do corretor pelo WhatsApp

1. Cadastre e marque como verificado o WhatsApp de um corretor.
2. Gere uma reserva para esse corretor.
3. Responda “sim” pelo WhatsApp.
4. Repita com rejeição e transferência, informando motivo.
5. Deixe uma oferta sem resposta até vencer o prazo.

Resultado esperado: aceite atribui a reunião; rejeição e transferência exigem e registram motivo; prazo vencido redistribui; fila esgotada cria uma pendência para o dono.

## 7. Contingência de três horas

1. Crie uma reserva fora da cobertura confirmada com horário próximo o suficiente para atingir o limite configurado.
2. Execute ou aguarde o processamento agendado.

Resultado esperado: a reunião é cancelada antes do limite, o lead recebe a mensagem de imprevisto, a conversa vira atenção humana e o histórico preserva o motivo. Este cenário deve usar data e números controlados.

## 8. Fatos comerciais

1. Antes do horário, tente marcar a reunião como realizada.
2. Depois do horário, registre reunião realizada, proposta enviada, negociação, contrato, venda e perda em oportunidades separadas.
3. Para perda, rejeição, transferência e exceção, informe o motivo.

Resultado esperado: não é possível confirmar reunião antecipadamente; o pipeline muda apenas a partir dos fatos; ator, horário, motivo, estado anterior e estado resultante aparecem no histórico.

## 9. Follow-ups e retomada humana

1. Configure a cadência e a janela de envio.
2. Deixe um lead sem responder.
3. Responda antes de uma etapa posterior da cadência.
4. Force uma transferência da IA para humano.

Resultado esperado: mensagens vencidas são enviadas uma única vez; a resposta cancela pendências futuras; a transferência pausa a IA e cria atenção visível.

## 10. Métricas, relatórios e experiência

1. Confira Visão geral, Meu dia, Central de atenção e Relatórios depois dos cenários anteriores.
2. Exporte o CSV.
3. Repita os fluxos essenciais do corretor em celular.

Resultado esperado: totais refletem os fatos registrados, o CSV abre corretamente e nenhuma ação essencial do corretor depende de tela grande ou apenas de passar o mouse.

## Retorno esperado

Para cada falha, envie:

- número da seção e passo;
- usuário utilizado: dono ou corretor;
- resultado observado;
- resultado esperado;
- captura de tela, quando houver diferença visual;
- horário aproximado, quando envolver WhatsApp, IA ou tarefa agendada.
