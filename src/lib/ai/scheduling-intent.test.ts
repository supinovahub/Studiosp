import { describe, expect, it } from 'vitest';
import {
  appointmentConfirmation,
  findExactRequestedSlot,
  requestedStartFromExtraction,
} from './scheduling-intent';

describe('scheduling intent', () => {
  it('accepts a valid ISO instant and rejects an invalid value', () => {
    expect(
      requestedStartFromExtraction('2026-07-28T10:00:00-03:00')?.toISOString()
    ).toBe('2026-07-28T13:00:00.000Z');
    expect(requestedStartFromExtraction('amanhã às dez')).toBeNull();
  });

  it('matches only a real slot near the requested instant', () => {
    const slots = [
      { id: '09', starts_at: '2026-07-28T12:00:00.000Z' },
      { id: '10', starts_at: '2026-07-28T13:00:00.000Z' },
    ];
    expect(
      findExactRequestedSlot(
        slots,
        new Date('2026-07-28T10:00:00-03:00')
      )?.id
    ).toBe('10');
    expect(
      findExactRequestedSlot(
        slots,
        new Date('2026-07-28T10:30:00-03:00')
      )
    ).toBeNull();
  });

  it('builds a deterministic confirmation only from an appointment', () => {
    expect(
      appointmentConfirmation({
        starts_at: '2026-07-28T13:00:00.000Z',
        timezone: 'America/Sao_Paulo',
      })
    ).toContain('terça-feira, 28/07, 10:00');
    expect(appointmentConfirmation({ starts_at: null })).toBeNull();
  });
});
