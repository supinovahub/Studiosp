import { describe, expect, it } from 'vitest';
import {
  buildReactivationMessage,
  parseReactivationCadence,
} from './cadence';

describe('parseReactivationCadence', () => {
  it('aceita, ordena e normaliza dias válidos', () => {
    expect(parseReactivationCadence('9, 0, 2, 5')).toEqual([
      { day: 0 },
      { day: 2 },
      { day: 5 },
      { day: 9 },
    ]);
  });

  it('exige D0 e rejeita dias repetidos', () => {
    expect(() => parseReactivationCadence('2,5')).toThrow(/D0/);
    expect(() => parseReactivationCadence('0,2,2')).toThrow(/repetir/);
  });
});

describe('buildReactivationMessage', () => {
  it('usa os dados conhecidos apenas na primeira abordagem', () => {
    const lead = {
      name: 'Matheus Silva',
      objective: 'invest',
      entry_value: 100000,
    };

    const initial = buildReactivationMessage(lead, 1);
    const followup = buildReactivationMessage(lead, 2);

    expect(initial).toContain('Matheus');
    expect(initial).toContain('investir');
    expect(initial).toContain('R$');
    expect(followup).not.toContain('100.000');
  });
});
