import { describe, expect, it } from 'vitest';
import {
  buildReactivationMessage,
  buildReactivationMessageWithVariant,
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
    expect(initial).toContain('investimento');
    expect(initial).toContain('R$');
    expect(followup).not.toContain('100.000');
  });

  it('separa o D0 em saudação, contexto, dado conhecido e pergunta', () => {
    const message = buildReactivationMessageWithVariant(
      {
        id: 'lead-semantic-parts',
        name: 'Arthur Rocha',
        objective: 'invest',
        entry_value: 100000,
      },
      1
    );

    expect(message.parts).toHaveLength(4);
    expect(message.parts[0]).toMatch(/Arthur/);
    expect(message.parts[1]).toMatch(/studio|investimento/i);
    expect(message.parts[2]).toContain('100.000');
    expect(message.parts[3]).toMatch(/\?$/);
    expect(message.text).toBe(message.parts.join(' '));
  });

  it('distribui leads entre estruturas diferentes de forma determinística', () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      buildReactivationMessageWithVariant(
        {
          id: `lead-${index}`,
          name: 'Arthur Rocha',
          objective: 'invest',
          entry_value: 100000,
        },
        1
      )
    );

    expect(
      new Set(messages.map((message) => message.variant)).size
    ).toBeGreaterThan(5);
    expect(
      new Set(messages.map((message) => message.text)).size
    ).toBeGreaterThan(5);
    expect(
      buildReactivationMessageWithVariant(
        { id: 'lead-1', name: 'Arthur Rocha', objective: 'invest' },
        1
      )
    ).toEqual(
      buildReactivationMessageWithVariant(
        { id: 'lead-1', name: 'Arthur Rocha', objective: 'invest' },
        1
      )
    );
  });
});
