import { describe, expect, it } from 'vitest';
import { compactAiReply, responseFingerprint } from './auto-reply';

describe('AI response guard', () => {
  it('normalizes whitespace without splitting one turn into many sends', () => {
    expect(compactAiReply('Olá!   Tudo bem?\n\n\nQual seu objetivo?')).toBe(
      'Olá! Tudo bem?\n\nQual seu objetivo?'
    );
  });

  it('treats cosmetic casing, accents and punctuation as the same response', () => {
    expect(responseFingerprint('Olá, João!')).toBe(
      responseFingerprint('  OLA JOAO  ')
    );
  });
});
