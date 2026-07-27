export const BROKER_WHATSAPP_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export function normalizeBrokerWhatsApp(value: unknown): string {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export function isValidBrokerWhatsApp(value: unknown): boolean {
  return BROKER_WHATSAPP_E164_PATTERN.test(normalizeBrokerWhatsApp(value));
}
