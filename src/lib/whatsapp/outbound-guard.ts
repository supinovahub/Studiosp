/**
 * Proteção central para qualquer envio ativo pelo WhatsApp.
 *
 * Staging e ambientes locais começam bloqueados por padrão. Para liberar todos
 * os destinatários, OUTBOUND_MESSAGING_ENABLED precisa ser exatamente "true".
 * Durante homologação, OUTBOUND_TEST_NUMBERS permite liberar somente números
 * explícitos, mesmo com o bloqueio geral ativo.
 */
export function normalizeOutboundNumber(value: string): string {
  return value.replace(/\D/g, '');
}

function testNumberAllowlist(): Set<string> {
  return new Set(
    (process.env.OUTBOUND_TEST_NUMBERS ?? '')
      .split(',')
      .map(normalizeOutboundNumber)
      .filter(Boolean)
  );
}

export function assertOutboundMessagingAllowed(to: string): void {
  if (process.env.OUTBOUND_MESSAGING_ENABLED === 'true') return;

  const normalizedTo = normalizeOutboundNumber(to);
  if (normalizedTo && testNumberAllowlist().has(normalizedTo)) return;

  throw new Error(
    'Envio externo bloqueado neste ambiente. Libere um número de teste ou ative os envios nas configurações do ambiente.'
  );
}
