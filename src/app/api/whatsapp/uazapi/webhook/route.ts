import { after, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { downloadUazapiMedia } from '@/lib/whatsapp/uazapi';
import { dispatchInboundToFlows } from '@/lib/flows/engine';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';
import {
  ensureStudiospOpportunity,
  transcribeStudiospAudio,
} from '@/lib/ai/studiosp-orchestrator';
import { handleBrokerOperationalReply } from '@/lib/studiosp/broker-whatsapp';
import { isContactAutomationSuppressed } from '@/lib/contacts/automation';

export const maxDuration = 60;

let _adminClient: SupabaseClient | null = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

interface UazapiMessage {
  id?: string;
  messageid?: string;
  chatid?: string;
  sender?: string;
  sender_pn?: string;
  senderName?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
  text?: string;
  quoted?: string;
  reaction?: string | { message_id?: string; id?: string; emoji?: string };
  buttonOrListid?: string;
  content?: Record<string, unknown> | string;
  fileURL?: string;
}

interface UazapiPayload {
  EventType?: string;
  event?: string;
  type?: string;
  token?: string;
  instance?: string | Record<string, unknown>;
  message?: UazapiMessage | UazapiMessage[];
  messages?: UazapiMessage[];
  data?: UazapiMessage | UazapiMessage[] | { message?: UazapiMessage };
  chat?: Record<string, unknown>;
  status?: string;
}

interface UazapiStoredConfig {
  id: string;
  account_id: string;
  user_id: string;
  access_token: string;
  verify_token: string | null;
  uazapi_base_url: string;
}

function safeSecretMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function configForSecret(
  secret: string
): Promise<UazapiStoredConfig | null> {
  const { data: configs, error } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('provider', 'uazapi');
  if (error || !configs) return null;

  for (const config of configs) {
    if (!config.verify_token) continue;
    try {
      if (safeSecretMatch(secret, decrypt(config.verify_token))) {
        return config as UazapiStoredConfig;
      }
    } catch {
      // Ignora linhas criptografadas com uma chave antiga.
    }
  }
  return null;
}

function eventName(body: UazapiPayload): string {
  return String(body.EventType ?? body.event ?? body.type ?? '').toLowerCase();
}

function messagesFromPayload(body: UazapiPayload): UazapiMessage[] {
  if (Array.isArray(body.messages)) return body.messages;
  if (Array.isArray(body.message)) return body.message;
  if (body.message) return [body.message];
  if (Array.isArray(body.data)) return body.data;
  if (body.data && 'message' in body.data && body.data.message) {
    return [body.data.message];
  }
  if (body.data && typeof body.data === 'object') {
    return [body.data as UazapiMessage];
  }
  return [];
}

function normalizeStatus(value: unknown): string | null {
  const status = String(value ?? '').toLowerCase();
  const map: Record<string, string> = {
    queued: 'pending',
    pending: 'pending',
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    played: 'read',
    failed: 'failed',
    canceled: 'failed',
    cancelled: 'failed',
  };
  return map[status] ?? null;
}

function messageId(message: UazapiMessage): string | null {
  return message.messageid ?? message.id ?? null;
}

function phoneFromMessage(
  message: UazapiMessage,
  chat?: Record<string, unknown>
): string {
  const raw =
    message.sender_pn ??
    message.sender ??
    (typeof chat?.phone === 'string' ? chat.phone : undefined) ??
    message.chatid ??
    '';
  return normalizePhone(raw.split('@')[0]);
}

function contactName(
  message: UazapiMessage,
  chat?: Record<string, unknown>
): string {
  for (const value of [
    message.senderName,
    chat?.lead_fullName,
    chat?.lead_name,
    chat?.name,
    chat?.wa_name,
    chat?.wa_contactName,
  ]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return phoneFromMessage(message, chat);
}

function contentObject(message: UazapiMessage): Record<string, unknown> {
  return message.content && typeof message.content === 'object'
    ? message.content
    : {};
}

function contentText(message: UazapiMessage): string | null {
  if (message.text?.trim()) return message.text.trim();
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }
  const content = contentObject(message);
  for (const value of [
    content.text,
    content.conversation,
    (content.extendedTextMessage as { text?: unknown } | undefined)?.text,
    (content.imageMessage as { caption?: unknown } | undefined)?.caption,
    (content.videoMessage as { caption?: unknown } | undefined)?.caption,
    (content.documentMessage as { fileName?: unknown } | undefined)?.fileName,
  ]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizedType(message: UazapiMessage): string {
  const raw = String(message.messageType ?? '').toLowerCase();
  if (raw.includes('reaction')) return 'reaction';
  if (raw.includes('image') || raw.includes('sticker')) return 'image';
  if (raw.includes('video')) return 'video';
  if (raw.includes('audio') || raw.includes('ptt')) return 'audio';
  if (raw.includes('document')) return 'document';
  if (raw.includes('location')) return 'location';
  if (
    raw.includes('button') ||
    raw.includes('list') ||
    message.buttonOrListid
  ) {
    return 'interactive';
  }
  return 'text';
}

function timestampIso(value?: number): string {
  if (!value) return new Date().toISOString();
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret');
  if (!secret) {
    return NextResponse.json({ error: 'Segredo ausente.' }, { status: 401 });
  }

  const config = await configForSecret(secret);
  if (!config) {
    return NextResponse.json({ error: 'Segredo inválido.' }, { status: 401 });
  }

  let body: UazapiPayload;
  try {
    body = (await request.json()) as UazapiPayload;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  after(async () => {
    try {
      await processEvent(config, body);
    } catch (error) {
      console.error(
        '[uazapi/webhook] processing failed:',
        error instanceof Error ? error.message : error
      );
    }
  });

  return NextResponse.json({ status: 'recebido' });
}

async function processEvent(config: UazapiStoredConfig, body: UazapiPayload) {
  const event = eventName(body);
  if (event === 'connection') {
    const data =
      body.data && !Array.isArray(body.data)
        ? body.data
        : (body.instance ?? {});
    const rawStatus =
      (typeof data === 'object' && data
        ? (data as Record<string, unknown>).status
        : undefined) ?? body.status;
    const status = [
      'connected',
      'connecting',
      'disconnected',
      'hibernated',
    ].includes(String(rawStatus))
      ? String(rawStatus)
      : 'disconnected';
    await supabaseAdmin()
      .from('whatsapp_config')
      .update({
        status,
        connected_at: status === 'connected' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id);
    return;
  }

  const messages = messagesFromPayload(body);
  if (event === 'messages_update') {
    for (const message of messages)
      await handleStatus(config.account_id, message);
    return;
  }

  for (const message of messages) {
    if (message.fromMe || message.isGroup) continue;
    await handleInbound(config, body.chat, message);
  }
}

async function handleStatus(accountId: string, message: UazapiMessage) {
  const id = messageId(message);
  const status = normalizeStatus(message.status);
  if (!id || !status) return;

  await supabaseAdmin()
    .from('messages')
    .update({ status })
    .eq('message_id', id);
  const update: Record<string, unknown> = { status };
  const now = timestampIso(message.messageTimestamp);
  if (status === 'sent') update.sent_at = now;
  if (status === 'delivered') update.delivered_at = now;
  if (status === 'read') update.read_at = now;
  await supabaseAdmin()
    .from('broadcast_recipients')
    .update(update)
    .eq('whatsapp_message_id', id);

  const { data: stored } = await supabaseAdmin()
    .from('messages')
    .select('conversation_id')
    .eq('message_id', id)
    .limit(1)
    .maybeSingle();
  if (stored) {
    await dispatchWebhookEvent(
      supabaseAdmin(),
      accountId,
      'message.status_updated',
      {
        whatsapp_message_id: id,
        conversation_id: stored.conversation_id,
        status,
      }
    );
  }
}

async function handleInbound(
  config: UazapiStoredConfig,
  chat: Record<string, unknown> | undefined,
  message: UazapiMessage
) {
  const externalId = messageId(message);
  const phone = phoneFromMessage(message, chat);
  if (!externalId || !phone) return;

  const brokerHandled = await handleBrokerOperationalReply({
    db: supabaseAdmin(),
    accountId: config.account_id,
    whatsappConfigId: config.id,
    remoteChatId: message.chatid ?? phone,
    phone,
    text: contentText(message),
    providerConfig: {
      provider: 'uazapi',
      uazapi_base_url: config.uazapi_base_url,
      accessToken: decrypt(config.access_token),
    },
  });
  if (brokerHandled) return;

  const contactOutcome = await findOrCreateContact(
    config.account_id,
    config.user_id,
    phone,
    contactName(message, chat)
  );
  if (!contactOutcome) return;
  const conversationOutcome = await findOrCreateConversation(
    config.account_id,
    config.user_id,
    contactOutcome.contact.id
  );
  if (!conversationOutcome) return;
  const conversation = conversationOutcome.conversation;

  if (conversationOutcome.created) {
    await dispatchWebhookEvent(
      supabaseAdmin(),
      config.account_id,
      'conversation.created',
      {
        conversation_id: conversation.id,
        contact_id: contactOutcome.contact.id,
      }
    );
  }

  const type = normalizedType(message);
  if (type === 'reaction') {
    await handleReaction(message, conversation.id, contactOutcome.contact.id);
    return;
  }

  const { data: duplicate } = await supabaseAdmin()
    .from('messages')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('message_id', externalId)
    .limit(1)
    .maybeSingle();
  if (duplicate) return;

  let text = contentText(message);
  const interactiveReplyId =
    type === 'interactive' ? (message.buttonOrListid ?? null) : null;
  if (interactiveReplyId && !text) text = interactiveReplyId;

  let mediaUrl = message.fileURL ?? null;
  if (!mediaUrl && ['image', 'video', 'audio', 'document'].includes(type)) {
    try {
      const media = await downloadUazapiMedia({
        credentials: {
          baseUrl: config.uazapi_base_url,
          token: decrypt(config.access_token),
        },
        messageId: externalId,
      });
      mediaUrl = media.url;
    } catch (error) {
      console.warn(
        '[uazapi/webhook] media download failed:',
        error instanceof Error ? error.message : error
      );
    }
  }

  let replyToInternalId: string | null = null;
  if (message.quoted) {
    const { data: parent } = await supabaseAdmin()
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('message_id', message.quoted)
      .maybeSingle();
    replyToInternalId = parent?.id ?? null;
  }

  const { count: priorCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer');
  const firstInbound = (priorCount ?? 0) === 0;

  const { data: storedMessage, error: insertError } = await supabaseAdmin()
    .from('messages')
    .insert({
      account_id: config.account_id,
      conversation_id: conversation.id,
      sender_type: 'customer',
      content_type: type,
      content_text: text,
      media_url: mediaUrl,
      message_id: externalId,
      status: 'delivered',
      created_at: timestampIso(message.messageTimestamp),
      reply_to_message_id: replyToInternalId,
      interactive_reply_id: interactiveReplyId,
      provider_received_at: timestampIso(message.messageTimestamp),
      author_type: 'lead',
      provider_metadata: { provider: 'uazapi' },
    })
    .select('id')
    .single();
  if (insertError) {
    console.error('[uazapi/webhook] message insert failed:', insertError);
    return;
  }

  const automationSuppressed = isContactAutomationSuppressed(
    contactOutcome.contact
  );

  if (
    !automationSuppressed &&
    type === 'audio' &&
    mediaUrl &&
    storedMessage?.id
  ) {
    try {
      const audioResponse = await fetch(mediaUrl);
      if (audioResponse.ok) {
        const transcript = await transcribeStudiospAudio({
          db: supabaseAdmin(),
          accountId: config.account_id,
          messageId: storedMessage.id,
          bytes: new Uint8Array(await audioResponse.arrayBuffer()),
          mimeType: audioResponse.headers.get('content-type') || 'audio/mpeg',
          filename: 'audio.mp3',
        });
        if (transcript) text = transcript;
      }
    } catch (error) {
      console.error('[uazapi/webhook] transcrição de áudio falhou:', error);
    }
  }

  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: text || `[${type}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);

  await flagBroadcastReply(config.account_id, contactOutcome.contact.id);

  if (automationSuppressed) {
    await dispatchWebhookEvent(
      supabaseAdmin(),
      config.account_id,
      'message.received',
      {
        conversation_id: conversation.id,
        contact_id: contactOutcome.contact.id,
        whatsapp_message_id: externalId,
        content_type: type,
        text,
        automation_suppressed: true,
      }
    );
    return;
  }

  const chatMetadata = chat ?? {};
  const likelyMetaAd = Boolean(
    chatMetadata.ad ||
    chatMetadata.ad_id ||
    chatMetadata.ctwa_clid ||
    chatMetadata.source_url
  );
  await ensureStudiospOpportunity({
    db: supabaseAdmin(),
    accountId: config.account_id,
    contactId: contactOutcome.contact.id,
    conversationId: conversation.id,
    sourceType: likelyMetaAd ? 'meta_ads' : 'other',
    sourceMetadata: likelyMetaAd
      ? { provider: 'uazapi', chat: chatMetadata }
      : {},
    idempotencyKey: `uazapi:${externalId}`,
  });

  const flow = await dispatchInboundToFlows({
    accountId: config.account_id,
    userId: config.user_id,
    contactId: contactOutcome.contact.id,
    conversationId: conversation.id,
    message: interactiveReplyId
      ? {
          kind: 'interactive_reply',
          reply_id: interactiveReplyId,
          reply_title: text ?? '',
          meta_message_id: externalId,
        }
      : { kind: 'text', text: text ?? '', meta_message_id: externalId },
    isFirstInboundMessage: firstInbound,
  });

  const triggers: Array<
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
    | 'interactive_reply'
  > = [];
  if (!flow.consumed) {
    triggers.push('new_message_received', 'keyword_match');
    if (interactiveReplyId) triggers.push('interactive_reply');
  }
  if (contactOutcome.wasCreated) triggers.unshift('new_contact_created');
  if (firstInbound) triggers.unshift('first_inbound_message');
  for (const triggerType of triggers) {
    await runAutomationsForTrigger({
      accountId: config.account_id,
      triggerType,
      contactId: contactOutcome.contact.id,
      context: {
        message_text: text ?? '',
        conversation_id: conversation.id,
        interactive_reply_id: interactiveReplyId ?? undefined,
      },
    });
  }

  if (!flow.consumed && !interactiveReplyId && text?.trim()) {
    await dispatchInboundToAiReply({
      accountId: config.account_id,
      conversationId: conversation.id,
      contactId: contactOutcome.contact.id,
      configOwnerUserId: config.user_id,
    });
  }

  await dispatchWebhookEvent(
    supabaseAdmin(),
    config.account_id,
    'message.received',
    {
      conversation_id: conversation.id,
      contact_id: contactOutcome.contact.id,
      whatsapp_message_id: externalId,
      content_type: type,
      text,
    }
  );
}

async function handleReaction(
  message: UazapiMessage,
  conversationId: string,
  contactId: string
) {
  const content = contentObject(message);
  const reactionContent = content.reactionMessage as
    { key?: { id?: string }; text?: string } | undefined;
  const reaction = message.reaction;
  const targetId =
    typeof reaction === 'string'
      ? reaction
      : (reaction?.message_id ?? reaction?.id ?? reactionContent?.key?.id);
  const emoji =
    typeof reaction === 'object' ? reaction.emoji : reactionContent?.text;
  if (!targetId) return;

  const { data: target } = await supabaseAdmin()
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('message_id', targetId)
    .maybeSingle();
  if (!target) return;

  if (!emoji) {
    await supabaseAdmin()
      .from('message_reactions')
      .delete()
      .eq('message_id', target.id)
      .eq('actor_type', 'customer')
      .eq('actor_id', contactId);
    return;
  }
  await supabaseAdmin().from('message_reactions').upsert(
    {
      message_id: target.id,
      conversation_id: conversationId,
      actor_type: 'customer',
      actor_id: contactId,
      emoji,
    },
    { onConflict: 'message_id,actor_type,actor_id' }
  );
}

async function findOrCreateContact(
  accountId: string,
  userId: string,
  phone: string,
  name: string
) {
  const existing = await findExistingContact(supabaseAdmin(), accountId, phone);
  if (existing) {
    if (name && name !== existing.name) {
      await supabaseAdmin()
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return { contact: existing, wasCreated: false };
  }

  const { data, error } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone,
      name: name || phone,
    })
    .select()
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await findExistingContact(
        supabaseAdmin(),
        accountId,
        phone
      );
      if (raced) return { contact: raced, wasCreated: false };
    }
    console.error('[uazapi/webhook] contact insert failed:', error);
    return null;
  }
  return { contact: data, wasCreated: true };
}

async function findOrCreateConversation(
  accountId: string,
  userId: string,
  contactId: string
) {
  const { data: existing } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existing?.length) return { conversation: existing[0], created: false };

  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .insert({ account_id: accountId, user_id: userId, contact_id: contactId })
    .select()
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const { data: raced } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .limit(1);
      if (raced?.length) return { conversation: raced[0], created: false };
    }
    console.error('[uazapi/webhook] conversation insert failed:', error);
    return null;
  }
  return { conversation: data, created: true };
}

async function flagBroadcastReply(accountId: string, contactId: string) {
  const { data } = await supabaseAdmin()
    .from('broadcast_recipients')
    .select('id, broadcasts!inner(account_id)')
    .eq('contact_id', contactId)
    .eq('broadcasts.account_id', accountId)
    .in('status', ['sent', 'delivered', 'read'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data?.length) return;
  await supabaseAdmin()
    .from('broadcast_recipients')
    .update({ status: 'replied', replied_at: new Date().toISOString() })
    .eq('id', data[0].id);
}
