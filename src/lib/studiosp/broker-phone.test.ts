import { describe, expect, it } from 'vitest';
import { isValidBrokerWhatsApp, normalizeBrokerWhatsApp } from './broker-phone';

describe('WhatsApp operacional do corretor', () => {
  it('normaliza espaços, parênteses e hífen para E.164', () => {
    expect(normalizeBrokerWhatsApp('+55 (11) 99999-9999')).toBe(
      '+5511999999999'
    );
  });

  it('aceita somente números E.164 possíveis', () => {
    expect(isValidBrokerWhatsApp('+55 (11) 99999-9999')).toBe(true);
    expect(isValidBrokerWhatsApp('123')).toBe(false);
    expect(isValidBrokerWhatsApp('')).toBe(false);
  });
});
