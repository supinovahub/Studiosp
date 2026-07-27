import { describe, expect, it } from 'vitest';
import { summarizeReactivationTouches } from './logs';

describe('summarizeReactivationTouches', () => {
  it('separa status, erros registrados e reprocessamentos', () => {
    expect(
      summarizeReactivationTouches([
        { status: 'sent', attempt_count: 1, last_error: null },
        {
          status: 'scheduled',
          attempt_count: 1,
          last_error: 'Falha temporária',
        },
        { status: 'sent', attempt_count: 2, last_error: null },
        { status: 'failed', attempt_count: 3, last_error: 'Falha definitiva' },
        { status: 'cancelled', attempt_count: 0, last_error: null },
      ])
    ).toEqual({
      total: 5,
      sent: 2,
      scheduled: 1,
      processing: 0,
      failed: 1,
      errors: 2,
      cancelled: 1,
      retried: 2,
    });
  });
});
