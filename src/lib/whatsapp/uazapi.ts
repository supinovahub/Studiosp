import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';

export type UazapiConnectionState =
  'connected' | 'connecting' | 'disconnected' | 'hibernated';

export interface UazapiInstance {
  id?: string;
  name?: string;
  status?: UazapiConnectionState;
  qrcode?: string;
  paircode?: string;
  profileName?: string;
  profilePicUrl?: string;
  owner?: string;
  isBusiness?: boolean;
}

export interface UazapiStatus {
  connected: boolean;
  loggedIn: boolean;
  phone?: string;
  instance: UazapiInstance;
}

export interface UazapiCredentials {
  baseUrl: string;
  token: string;
}

export interface UazapiSendResult {
  messageId: string;
}

interface UazapiMessageResponse {
  id?: string;
  messageid?: string;
  messageId?: string;
  key?: { id?: string };
  response?: { id?: string; messageid?: string; messageId?: string };
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('A URL da UAZAPI precisa usar HTTPS.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
      response?: { message?: string };
    };
    if (typeof body.error === 'string') return body.error;
    if (body.error?.message) return body.error.message;
    if (body.message) return body.message;
    if (body.response?.message) return body.response.message;
  } catch {
    // A resposta não era JSON; o status HTTP ainda será informado.
  }
  return `A UAZAPI respondeu com HTTP ${response.status}.`;
}

async function uazapiRequest<T>(
  credentials: UazapiCredentials,
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: 'error',
    signal: init?.signal ?? AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/json',
      token: credentials.token,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function messageIdFromResponse(data: UazapiMessageResponse): string {
  const messageId =
    data.messageid ??
    data.messageId ??
    data.key?.id ??
    data.response?.messageid ??
    data.response?.messageId ??
    data.response?.id ??
    data.id;

  if (!messageId) {
    throw new Error(
      'A UAZAPI enviou a mensagem, mas não retornou o identificador.'
    );
  }
  return messageId;
}

function phoneFromJid(jid: unknown): string | undefined {
  if (!jid) return undefined;
  if (typeof jid === 'string') return jid.split('@')[0];
  if (typeof jid === 'object' && 'user' in jid) {
    const user = (jid as { user?: unknown }).user;
    return typeof user === 'string' ? user : undefined;
  }
  return undefined;
}

export async function getUazapiStatus(
  credentials: UazapiCredentials
): Promise<UazapiStatus> {
  const data = await uazapiRequest<{
    connected?: boolean;
    loggedIn?: boolean;
    jid?: unknown;
    instance?: UazapiInstance;
    status?: { connected?: boolean; loggedIn?: boolean; jid?: unknown };
  }>(credentials, '/instance/status');

  const instance = data.instance ?? {};
  const connected = Boolean(data.connected ?? data.status?.connected);
  const loggedIn = Boolean(data.loggedIn ?? data.status?.loggedIn);
  return {
    connected,
    loggedIn,
    phone: phoneFromJid(data.jid ?? data.status?.jid) ?? instance.owner,
    instance: {
      ...instance,
      status: instance.status ?? (connected ? 'connected' : 'disconnected'),
    },
  };
}

export async function connectUazapi(
  credentials: UazapiCredentials,
  phone?: string
): Promise<UazapiStatus> {
  const data = await uazapiRequest<{
    connected?: boolean;
    loggedIn?: boolean;
    jid?: unknown;
    instance?: UazapiInstance;
  }>(credentials, '/instance/connect', {
    method: 'POST',
    body: JSON.stringify(phone ? { phone } : {}),
  });

  return {
    connected: Boolean(data.connected),
    loggedIn: Boolean(data.loggedIn),
    phone: phoneFromJid(data.jid),
    instance: data.instance ?? {},
  };
}

export async function configureUazapiWebhook(
  credentials: UazapiCredentials,
  url: string
): Promise<void> {
  await uazapiRequest(credentials, '/webhook', {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      url,
      events: ['messages', 'messages_update', 'connection'],
      excludeMessages: ['wasSentByApi', 'isGroupYes'],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    }),
  });
}

export async function sendUazapiText(args: {
  credentials: UazapiCredentials;
  to: string;
  text: string;
  replyTo?: string;
}): Promise<UazapiSendResult> {
  const data = await uazapiRequest<UazapiMessageResponse>(
    args.credentials,
    '/send/text',
    {
      method: 'POST',
      body: JSON.stringify({
        number: args.to,
        text: args.text,
        replyid: args.replyTo,
        readchat: true,
      }),
    }
  );
  return { messageId: messageIdFromResponse(data) };
}

export async function sendUazapiMedia(args: {
  credentials: UazapiCredentials;
  to: string;
  kind: 'image' | 'video' | 'document' | 'audio';
  url: string;
  caption?: string;
  filename?: string;
  replyTo?: string;
}): Promise<UazapiSendResult> {
  const data = await uazapiRequest<UazapiMessageResponse>(
    args.credentials,
    '/send/media',
    {
      method: 'POST',
      body: JSON.stringify({
        number: args.to,
        type: args.kind === 'audio' ? 'ptt' : args.kind,
        file: args.url,
        text: args.kind === 'audio' ? undefined : args.caption,
        docName: args.kind === 'document' ? args.filename : undefined,
        replyid: args.replyTo,
        readchat: true,
      }),
    }
  );
  return { messageId: messageIdFromResponse(data) };
}

function choicesFromInteractive(payload: InteractiveMessagePayload): string[] {
  if (payload.kind === 'buttons') {
    return payload.buttons.map((button) => `${button.title}|${button.id}`);
  }

  const choices: string[] = [];
  for (const section of payload.sections) {
    if (section.title) choices.push(`[${section.title}]`);
    for (const row of section.rows) {
      choices.push(
        [row.title, row.id, row.description].filter(Boolean).join('|')
      );
    }
  }
  return choices;
}

export async function sendUazapiInteractive(args: {
  credentials: UazapiCredentials;
  to: string;
  payload: InteractiveMessagePayload;
  replyTo?: string;
}): Promise<UazapiSendResult> {
  const payload = args.payload;
  const data = await uazapiRequest<UazapiMessageResponse>(
    args.credentials,
    '/send/menu',
    {
      method: 'POST',
      body: JSON.stringify({
        number: args.to,
        type: payload.kind === 'buttons' ? 'button' : 'list',
        text: [payload.header, payload.body].filter(Boolean).join('\n\n'),
        footerText: payload.footer,
        listButton: payload.kind === 'list' ? payload.button_label : undefined,
        choices: choicesFromInteractive(payload),
        replyid: args.replyTo,
        readchat: true,
      }),
    }
  );
  return { messageId: messageIdFromResponse(data) };
}

export async function sendUazapiReaction(args: {
  credentials: UazapiCredentials;
  to: string;
  targetMessageId: string;
  emoji: string;
}): Promise<UazapiSendResult> {
  const data = await uazapiRequest<UazapiMessageResponse>(
    args.credentials,
    '/message/react',
    {
      method: 'POST',
      body: JSON.stringify({
        number: args.to,
        id: args.targetMessageId,
        text: args.emoji,
      }),
    }
  );
  return { messageId: messageIdFromResponse(data) };
}

export async function downloadUazapiMedia(args: {
  credentials: UazapiCredentials;
  messageId: string;
}): Promise<{ url: string | null; mimetype: string | null }> {
  const data = await uazapiRequest<{
    fileURL?: string;
    mimetype?: string;
  }>(args.credentials, '/message/download', {
    method: 'POST',
    body: JSON.stringify({
      id: args.messageId,
      return_link: true,
      return_base64: false,
      generate_mp3: true,
    }),
  });
  return {
    url: data.fileURL ?? null,
    mimetype: data.mimetype ?? null,
  };
}
