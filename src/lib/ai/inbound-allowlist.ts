import { normalizePhone } from '@/lib/whatsapp/phone-utils';

/**
 * Restricts only automatic AI replies to controlled lead numbers.
 *
 * An empty variable preserves the normal production behavior. When configured,
 * every inbound number not explicitly listed remains visible in the inbox but
 * is not sent to the AI provider and receives no automatic AI response.
 */
export function isInboundAiReplyAllowed(phone: string): boolean {
  const configuredNumbers = (process.env.AI_AUTOREPLY_ALLOWED_NUMBERS ?? '')
    .split(',')
    .map(normalizePhone)
    .filter(Boolean);

  if (configuredNumbers.length === 0) return true;

  const normalizedPhone = normalizePhone(phone);
  return Boolean(
    normalizedPhone && new Set(configuredNumbers).has(normalizedPhone)
  );
}
