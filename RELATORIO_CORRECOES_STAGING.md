# Relatório de correções — StudioSP V1

Data: 23/07/2026  
Ambiente: staging  
Branch: `codex/v1-platform`

## Objetivo

Corrigir os problemas encontrados durante os testes das roles `owner` e
`agent`, exceto os itens relacionados à conexão da UAZAPI e à comunicação real
pelo WhatsApp.

## Correções realizadas

- Corrigida a métrica **Reuniões realizadas**.
  - Antes, oportunidades em etapas posteriores, como `proposal_sent`, eram
    contabilizadas como reuniões realizadas.
  - Agora, a métrica considera somente oportunidades que possuem o evento
    comercial `meeting_completed`.

- Corrigida a exportação CSV dos relatórios.
  - O link de download agora é inserido temporariamente no documento.
  - A URL temporária do arquivo só é revogada depois do início do download.

- Corrigidos erros de formulário relacionados a `reset`.
  - A referência do formulário é preservada antes das operações assíncronas.
  - Isso evita o erro `Cannot read properties of null (reading 'reset')`.

- Corrigido o atalho de configuração do modelo de IA.
  - O link que apontava para a aba inexistente `/settings?tab=ai` agora abre
    `/agents`.

- Corrigidos textos e traduções.
  - `roles.owner` agora aparece como `Proprietário`.
  - `Inbox.messageThread.statusAberta` agora aparece como `Em aberto`.
  - `sotaque Violeta` foi alterado para `tema Violeta`.
  - Foi adicionada a tradução do título `Transcrição`.

- Melhorada a validação de arquivos de empreendimentos.
  - A validação ocorre no cliente e no servidor.
  - Formatos aceitos: JPG, JPEG, PNG, WebP, GIF, MP4, MOV, PDF, PPT e PPTX.
  - Arquivos incompatíveis agora produzem uma mensagem que informa os formatos
    permitidos.

- Corrigida a apresentação das transcrições de áudio.
  - A Inbox consulta a transcrição concluída associada à mensagem.
  - A transcrição é exibida mesmo quando o arquivo original de áudio estiver
    indisponível.

- Corrigida a política RLS de `audio_transcriptions`.
  - A política anterior permitia a leitura somente para administradores ou
    para o corretor atribuído diretamente à oportunidade.
  - A nova política acompanha a permissão de leitura da mensagem e da conversa.
  - Um membro autenticado da conta que pode visualizar a mensagem também pode
    visualizar sua transcrição.

- Corrigido o carregamento inicial das permissões.
  - O shell aguarda o carregamento do perfil antes de renderizar a navegação.
  - Isso evita mostrar temporariamente o menu da role anterior ou uma navegação
    incorreta.

- Adicionada proteção de navegação para corretores.
  - As rotas exclusivas de gestão redirecionam usuários sem role de owner/admin
    para `/meu-dia`.
  - Rotas protegidas:
    - `/visao-geral`
    - `/pipeline`
    - `/follow-ups`
    - `/relatorios`

## Alteração no Supabase

Migration criada:

```text
supabase/migrations/20260723115324_align_audio_transcription_visibility.sql
```

A migration foi aplicada no projeto de staging:

```text
vgmmfzdifjhpqaopxfbj
```

A nova política foi validada simulando uma consulta autenticada com a conta de
corretor. A transcrição esperada foi retornada corretamente.

## Validações executadas

- TypeScript: aprovado.
- Testes automatizados: **662 testes aprovados em 72 arquivos**.
- ESLint: nenhum erro; permaneceram somente avisos preexistentes.
- Build remoto da Vercel: aprovado.
- Estado final do deployment: `READY`.
- Logs de runtime do novo deployment: nenhum erro ou evento fatal encontrado.

Também foram validados pela interface:

- Menu correto da role `agent`.
- Redirecionamento das rotas exclusivas de gestão.
- Status da conversa exibido como `Em aberto`.
- Ausência da chave crua de tradução.
- Exibição da transcrição para o corretor.

## Deploy

URL permanente da branch de staging:

<https://studiosp-git-codex-v1-platform-brio5.vercel.app>

Deployment validado:

<https://studiosp-jiwv26tzw-brio5.vercel.app>

## Commits

```text
5118c77 fix: corrigir fluxos operacionais da V1
bb577db fix: alinhar acesso às transcrições de áudio
```

## Itens não alterados

Conforme solicitado, não foram implementadas alterações relacionadas a:

- Conexão real da UAZAPI.
- Pareamento por QR Code.
- Sessão real de um número do WhatsApp.
- Webhooks reais da UAZAPI.
- Envio, entrega ou leitura real de mensagens.
- Confirmação real do corretor pelo WhatsApp.

O requisito de conexão da UAZAPI por QR Code diretamente dentro do CRM continua
registrado para uma etapa posterior.

