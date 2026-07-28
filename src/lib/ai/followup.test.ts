import { describe, expect, it } from 'vitest';
import { fallbackFollowupMessage } from './followup';

describe('follow-up fallback', () => {
  it('uses a concise nudge and closes the cadence without pressure', () => {
    expect(fallbackFollowupMessage(1)).toContain('última mensagem');
    expect(fallbackFollowupMessage(4)).toContain('Vou pausar');
    expect(fallbackFollowupMessage(99)).toBe(fallbackFollowupMessage(4));
  });
});
