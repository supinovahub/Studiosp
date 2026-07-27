import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInboundAiReplyAllowed } from './inbound-allowlist';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isInboundAiReplyAllowed', () => {
  it('preserva o comportamento atual quando a whitelist não está configurada', () => {
    vi.stubEnv('AI_AUTOREPLY_ALLOWED_NUMBERS', '');

    expect(isInboundAiReplyAllowed('5511999999999')).toBe(true);
  });

  it('aceita números configurados independentemente da formatação', () => {
    vi.stubEnv(
      'AI_AUTOREPLY_ALLOWED_NUMBERS',
      '+55 (27) 98116-8321, 55 27 99830-3052'
    );

    expect(isInboundAiReplyAllowed('5527981168321')).toBe(true);
    expect(isInboundAiReplyAllowed('+55 (27) 99830-3052')).toBe(true);
  });

  it('bloqueia números ausentes da whitelist', () => {
    vi.stubEnv('AI_AUTOREPLY_ALLOWED_NUMBERS', '5527981168321');

    expect(isInboundAiReplyAllowed('5511999999999')).toBe(false);
  });
});
