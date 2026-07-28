import { describe, expect, it } from 'vitest';
import {
  isInsideFollowupWindow,
  nextAllowedFollowupAt,
} from './followup-window';

const policy = {
  timezone: 'America/Sao_Paulo',
  allowed_weekdays: [1, 2, 3, 4, 5],
  window_start: '09:00',
  window_end: '20:00',
};

describe('follow-up sending window', () => {
  it('accepts a weekday during business hours', () => {
    expect(
      isInsideFollowupWindow(new Date('2026-07-28T18:00:00.000Z'), policy)
    ).toBe(true);
  });

  it('moves a late request to the next allowed morning', () => {
    const next = nextAllowedFollowupAt(
      new Date('2026-07-28T23:30:00.000Z'),
      policy
    );
    expect(next.toISOString()).toBe('2026-07-29T12:00:00.000Z');
  });
});
