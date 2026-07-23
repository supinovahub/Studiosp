import type { MessageTemplate } from '@/types';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import {
  sendInteractiveButtons,
  sendInteractiveList,
  sendMediaMessage,
  sendReactionMessage,
  sendTemplateMessage,
  sendTextMessage,
  type MediaKind,
} from '@/lib/whatsapp/meta-api';
import {
  sendUazapiInteractive,
  sendUazapiMedia,
  sendUazapiReaction,
  sendUazapiText,
  type UazapiCredentials,
} from '@/lib/whatsapp/uazapi';
import { assertOutboundMessagingAllowed } from '@/lib/whatsapp/outbound-guard';

export type WhatsAppProvider = 'meta' | 'uazapi';

export interface ProviderConfig {
  provider?: WhatsAppProvider | null;
  phone_number_id?: string | null;
  accessToken: string;
  uazapi_base_url?: string | null;
}

export function providerName(config: ProviderConfig): 'Meta' | 'UAZAPI' {
  return config.provider === 'uazapi' ? 'UAZAPI' : 'Meta';
}

function uazapiCredentials(config: ProviderConfig): UazapiCredentials {
  if (!config.uazapi_base_url) {
    throw new Error('A URL base da UAZAPI não está configurada.');
  }
  return { baseUrl: config.uazapi_base_url, token: config.accessToken };
}

function metaPhoneNumberId(config: ProviderConfig): string {
  if (!config.phone_number_id) {
    throw new Error('O identificador do número da Meta não está configurado.');
  }
  return config.phone_number_id;
}

export async function sendProviderText(args: {
  config: ProviderConfig;
  to: string;
  text: string;
  contextMessageId?: string;
}): Promise<{ messageId: string }> {
  assertOutboundMessagingAllowed(args.to);
  if (args.config.provider === 'uazapi') {
    return sendUazapiText({
      credentials: uazapiCredentials(args.config),
      to: args.to,
      text: args.text,
      replyTo: args.contextMessageId,
    });
  }
  return sendTextMessage({
    phoneNumberId: metaPhoneNumberId(args.config),
    accessToken: args.config.accessToken,
    to: args.to,
    text: args.text,
    contextMessageId: args.contextMessageId,
  });
}

export async function sendProviderMedia(args: {
  config: ProviderConfig;
  to: string;
  kind: MediaKind;
  link: string;
  caption?: string;
  filename?: string;
  contextMessageId?: string;
}): Promise<{ messageId: string }> {
  assertOutboundMessagingAllowed(args.to);
  if (args.config.provider === 'uazapi') {
    return sendUazapiMedia({
      credentials: uazapiCredentials(args.config),
      to: args.to,
      kind: args.kind,
      url: args.link,
      caption: args.caption,
      filename: args.filename,
      replyTo: args.contextMessageId,
    });
  }
  return sendMediaMessage({
    phoneNumberId: metaPhoneNumberId(args.config),
    accessToken: args.config.accessToken,
    to: args.to,
    kind: args.kind,
    link: args.link,
    caption: args.caption,
    filename: args.filename,
    contextMessageId: args.contextMessageId,
  });
}

export async function sendProviderInteractive(args: {
  config: ProviderConfig;
  to: string;
  payload: InteractiveMessagePayload;
  contextMessageId?: string;
}): Promise<{ messageId: string }> {
  assertOutboundMessagingAllowed(args.to);
  if (args.config.provider === 'uazapi') {
    return sendUazapiInteractive({
      credentials: uazapiCredentials(args.config),
      to: args.to,
      payload: args.payload,
      replyTo: args.contextMessageId,
    });
  }

  if (args.payload.kind === 'buttons') {
    return sendInteractiveButtons({
      phoneNumberId: metaPhoneNumberId(args.config),
      accessToken: args.config.accessToken,
      to: args.to,
      bodyText: args.payload.body,
      headerText: args.payload.header,
      footerText: args.payload.footer,
      buttons: args.payload.buttons,
      contextMessageId: args.contextMessageId,
    });
  }
  return sendInteractiveList({
    phoneNumberId: metaPhoneNumberId(args.config),
    accessToken: args.config.accessToken,
    to: args.to,
    bodyText: args.payload.body,
    buttonLabel: args.payload.button_label,
    headerText: args.payload.header,
    footerText: args.payload.footer,
    sections: args.payload.sections,
    contextMessageId: args.contextMessageId,
  });
}

function renderUazapiTemplate(
  template: MessageTemplate,
  legacyParams: string[] = [],
  structuredParams?: SendTimeParams
): string {
  const bodyValues = Array.isArray(structuredParams?.body)
    ? structuredParams.body.map(String)
    : legacyParams;
  const body = template.body_text.replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (match, raw) => {
      const value = bodyValues[Number(raw) - 1];
      return value === undefined ? match : value;
    }
  );
  const header =
    typeof structuredParams?.headerText === 'string'
      ? template.header_content?.replace(
          /\{\{\s*1\s*\}\}/g,
          structuredParams.headerText
        )
      : template.header_type === 'text'
        ? template.header_content
        : undefined;
  const buttonLines = (template.buttons ?? []).flatMap((button) => {
    if (button.type === 'URL') return [`${button.text}: ${button.url}`];
    if (button.type === 'PHONE_NUMBER')
      return [`${button.text}: ${button.phone_number}`];
    if (button.type === 'COPY_CODE')
      return [`${button.text}: ${button.example}`];
    return [];
  });
  return [header, body, template.footer_text, ...buttonLines]
    .filter(Boolean)
    .join('\n\n');
}

export async function sendProviderTemplate(args: {
  config: ProviderConfig;
  to: string;
  templateName: string;
  language?: string;
  template?: MessageTemplate;
  params?: string[];
  messageParams?: SendTimeParams;
  contextMessageId?: string;
}): Promise<{ messageId: string }> {
  assertOutboundMessagingAllowed(args.to);
  if (args.config.provider === 'uazapi') {
    if (!args.template) {
      throw new Error(
        'O modelo local não foi encontrado. Sincronize ou crie o conteúdo antes de enviar pela UAZAPI.'
      );
    }
    return sendUazapiText({
      credentials: uazapiCredentials(args.config),
      to: args.to,
      text: renderUazapiTemplate(
        args.template,
        args.params,
        args.messageParams
      ),
      replyTo: args.contextMessageId,
    });
  }
  return sendTemplateMessage({
    phoneNumberId: metaPhoneNumberId(args.config),
    accessToken: args.config.accessToken,
    to: args.to,
    templateName: args.templateName,
    language: args.language,
    template: args.template,
    params: args.params,
    messageParams: args.messageParams,
    contextMessageId: args.contextMessageId,
  });
}

export async function sendProviderReaction(args: {
  config: ProviderConfig;
  to: string;
  targetMessageId: string;
  emoji: string;
}): Promise<{ messageId: string }> {
  assertOutboundMessagingAllowed(args.to);
  if (args.config.provider === 'uazapi') {
    return sendUazapiReaction({
      credentials: uazapiCredentials(args.config),
      to: args.to,
      targetMessageId: args.targetMessageId,
      emoji: args.emoji,
    });
  }
  return sendReactionMessage({
    phoneNumberId: metaPhoneNumberId(args.config),
    accessToken: args.config.accessToken,
    to: args.to,
    targetMessageId: args.targetMessageId,
    emoji: args.emoji,
  });
}
