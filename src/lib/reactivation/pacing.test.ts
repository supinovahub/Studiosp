import { describe, expect, it } from 'vitest';
import {
  REACTIVATION_MAX_DELAY_MS,
  REACTIVATION_MIN_DELAY_MS,
  randomReactivationDelayMs,
} from './pacing';

describe('randomReactivationDelayMs', () => {
  it('respeita os limites inclusivos de 30 e 50 segundos', () => {
    expect(randomReactivationDelayMs(() => 0)).toBe(REACTIVATION_MIN_DELAY_MS);
    expect(randomReactivationDelayMs(() => 0.999999999)).toBe(
      REACTIVATION_MAX_DELAY_MS
    );
  });

  it('produz valores inteiros dentro do intervalo configurado', () => {
    for (let index = 0; index < 1_000; index++) {
      const delay = randomReactivationDelayMs();
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(REACTIVATION_MIN_DELAY_MS);
      expect(delay).toBeLessThanOrEqual(REACTIVATION_MAX_DELAY_MS);
    }
  });
});
