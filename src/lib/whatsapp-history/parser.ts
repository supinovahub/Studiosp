import { createHash } from 'node:crypto';
import type {
  HistoryImportPreview,
  NormalizedHistoryContact,
  NormalizedHistoryMessage,
  ParsedHistoryJsonl,
} from './types';

const MAX_LINES = 100_000;
const MAX_LINE_LENGTH = 1_000_000;
const MAX_TEXT_LENGTH = 100_000;
const MAX_ISSUES = 20;
const INDIVIDUAL_CHAT_ID = /^([1-9]\d{6,14})@s\.whatsapp\.net$/;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function messageTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  const year = date.getUTCFullYear();
  return Number.isNaN(date.getTime()) || year < 2000 || year > 2100
    ? null
    : date.toISOString();
}

function contentTypeFor(
  messageType: number | null,
  isMedia: boolean,
  isSticker: boolean
): NormalizedHistoryMessage['contentType'] {
  if (isSticker || messageType === 20) return 'image';
  if (messageType === 1) return 'image';
  if (messageType === 2) return 'audio';
  if (messageType === 3 || messageType === 15) return 'video';
  if (messageType === 9) return 'document';
  return isMedia ? 'document' : 'text';
}

function unavailableLabel(
  contentType: NormalizedHistoryMessage['contentType']
) {
  const labels: Record<NormalizedHistoryMessage['contentType'], string> = {
    image: 'Imagem histórica — arquivo não incluído no backup',
    audio: 'Áudio histórico — arquivo não incluído no backup',
    video: 'Vídeo histórico — arquivo não incluído no backup',
    document: 'Documento histórico — arquivo não incluído no backup',
    location: 'Localização histórica',
    template: 'Modelo histórico',
    interactive: 'Interação histórica',
    text: 'Evento histórico sem conteúdo disponível',
  };
  return `[${labels[contentType]}]`;
}

function messageHash(parts: Array<string | number | null>) {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u001f'))
    .digest('hex');
}

function addIssue(
  preview: HistoryImportPreview,
  line: number,
  code: string,
  message: string
) {
  if (preview.issues.length >= MAX_ISSUES) return;
  preview.issues.push({ line, code, message });
}

export function parseWhatsAppHistoryJsonl(input: string): ParsedHistoryJsonl {
  const preview: HistoryImportPreview = {
    totalLineCount: 0,
    validEventCount: 0,
    invalidLineCount: 0,
    skippedEventCount: 0,
    messageCount: 0,
    chatCount: 0,
    inboundCount: 0,
    outboundCount: 0,
    mediaCount: 0,
    duplicateEventIdCount: 0,
    truncatedTextCount: 0,
    firstMessageAt: null,
    lastMessageAt: null,
    issues: [],
  };
  const messages: NormalizedHistoryMessage[] = [];
  const contacts = new Map<string, NormalizedHistoryContact>();
  const seenEventIds = new Set<string>();
  const lines = input.split(/\r?\n/);

  if (lines.length > MAX_LINES + 1) {
    throw new Error(
      `O arquivo excede o limite de ${MAX_LINES.toLocaleString('pt-BR')} linhas.`
    );
  }

  for (let index = 0; index < lines.length; index++) {
    const sourceLine = index + 1;
    const rawLine = lines[index];
    if (!rawLine && index === lines.length - 1) continue;
    preview.totalLineCount++;

    if (!rawLine.trim()) {
      preview.invalidLineCount++;
      addIssue(preview, sourceLine, 'empty_line', 'Linha vazia ignorada.');
      continue;
    }
    if (rawLine.length > MAX_LINE_LENGTH) {
      preview.invalidLineCount++;
      addIssue(
        preview,
        sourceLine,
        'line_too_long',
        'Linha maior que o limite de segurança.'
      );
      continue;
    }

    let root: UnknownRecord | null = null;
    try {
      root = asRecord(JSON.parse(rawLine));
    } catch {
      preview.invalidLineCount++;
      addIssue(
        preview,
        sourceLine,
        'invalid_json',
        'JSON inválido nesta linha.'
      );
      continue;
    }
    const event = asRecord(root?.event);
    const chat = asRecord(root?.chat);
    const chatId = optionalString(root?.chat_id);
    const match = chatId?.match(INDIVIDUAL_CHAT_ID);
    const timestamp = messageTimestamp(event?.timestamp);
    const eventId = optionalString(root?.event_id);
    if (eventId) {
      if (seenEventIds.has(eventId)) preview.duplicateEventIdCount++;
      else seenEventIds.add(eventId);
    }
    if (chatId && match) {
      const previous = contacts.get(chatId);
      const nextName = optionalString(chat?.name)?.slice(0, 160) ?? null;
      contacts.set(chatId, {
        phone: match[1],
        name: previous?.name ?? nextName,
        chatId,
        originatedAt:
          previous?.originatedAt && timestamp
            ? previous.originatedAt < timestamp
              ? previous.originatedAt
              : timestamp
            : (previous?.originatedAt ?? timestamp),
      });
    }
    if (!root || !event || !chatId || !match || !timestamp) {
      preview.invalidLineCount++;
      addIssue(
        preview,
        sourceLine,
        'invalid_event',
        'Evento sem contato individual ou horário válido.'
      );
      continue;
    }
    preview.validEventCount++;

    const messageType =
      typeof event.message_type === 'number' &&
      Number.isInteger(event.message_type)
        ? event.message_type
        : null;
    const isMedia = event.media === true;
    const isMeta = event.meta === true;
    const isSticker = event.sticker === true;
    const rawData = optionalString(event.data);
    const caption = optionalString(event.caption);

    if (isMeta && !isMedia) {
      preview.skippedEventCount++;
      continue;
    }

    const contentType = contentTypeFor(messageType, isMedia, isSticker);
    let contentText =
      contentType === 'text'
        ? (rawData ?? unavailableLabel(contentType))
        : (caption ?? unavailableLabel(contentType));
    if (contentText.length > MAX_TEXT_LENGTH) {
      contentText = contentText.slice(0, MAX_TEXT_LENGTH);
      preview.truncatedTextCount++;
      addIssue(
        preview,
        sourceLine,
        'text_truncated',
        'Conteúdo muito longo; somente os primeiros 100 mil caracteres serão importados.'
      );
    }

    const keyId = optionalString(event.key_id);
    const senderType = event.from_me === true ? 'agent' : 'customer';
    const name = optionalString(chat?.name)?.slice(0, 160) ?? null;
    const providerMetadata: NormalizedHistoryMessage['providerMetadata'] = {
      chat_id: chatId,
      original_event_id: eventId,
      original_key_id: keyId,
      original_message_type: messageType,
    };
    if (isMedia && rawData) providerMetadata.media_reference = rawData;

    messages.push({
      phone: match[1],
      name,
      chatId,
      messageKey: messageHash([
        chatId,
        eventId,
        keyId,
        timestamp,
        messageType,
        rawData,
      ]),
      timestamp,
      senderType,
      contentType,
      contentText,
      sourceLine,
      providerMetadata,
    });
    if (senderType === 'customer') preview.inboundCount++;
    else preview.outboundCount++;
    if (isMedia) preview.mediaCount++;
    if (!preview.firstMessageAt || timestamp < preview.firstMessageAt) {
      preview.firstMessageAt = timestamp;
    }
    if (!preview.lastMessageAt || timestamp > preview.lastMessageAt) {
      preview.lastMessageAt = timestamp;
    }
  }

  preview.messageCount = messages.length;
  preview.chatCount = contacts.size;
  return { preview, contacts: [...contacts.values()], messages };
}
