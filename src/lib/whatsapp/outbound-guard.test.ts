import { afterEach, describe, expect, it } from 'vitest';

import {
  assertOutboundMessagingAllowed,
  normalizeOutboundNumber,
} from './outbound-guard';

const originalEnabled = process.env.OUTBOUND_MESSAGING_ENABLED;
const originalAllowlist = process.env.OUTBOUND_TEST_NUMBERS;

afterEach(() => {
  if (originalEnabled === undefined)
    delete process.env.OUTBOUND_MESSAGING_ENABLED;
  else process.env.OUTBOUND_MESSAGING_ENABLED = originalEnabled;
  if (originalAllowlist === undefined) delete process.env.OUTBOUND_TEST_NUMBERS;
  else process.env.OUTBOUND_TEST_NUMBERS = originalAllowlist;
});

describe('proteção de mensagens externas', () => {
  it('normaliza números antes de comparar', () => {
    expect(normalizeOutboundNumber('+55 (11) 99999-9999')).toBe(
      '5511999999999'
    );
  });

  it('bloqueia por padrão', () => {
    delete process.env.OUTBOUND_MESSAGING_ENABLED;
    delete process.env.OUTBOUND_TEST_NUMBERS;
    expect(() => assertOutboundMessagingAllowed('5511999999999')).toThrow(
      'Envio externo bloqueado'
    );
  });

  it('libera apenas números explicitamente permitidos no staging', () => {
    process.env.OUTBOUND_MESSAGING_ENABLED = 'false';
    process.env.OUTBOUND_TEST_NUMBERS = '+55 (11) 99999-9999';
    expect(() => assertOutboundMessagingAllowed('5511999999999')).not.toThrow();
    expect(() => assertOutboundMessagingAllowed('5511888888888')).toThrow();
  });

  it('libera todos os destinatários somente com a ativação explícita', () => {
    process.env.OUTBOUND_MESSAGING_ENABLED = 'true';
    expect(() => assertOutboundMessagingAllowed('5511888888888')).not.toThrow();
  });
});
