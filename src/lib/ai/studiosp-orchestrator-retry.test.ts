import { describe, expect, it, vi } from 'vitest';
import { existingReservationForTrigger } from './studiosp-orchestrator';

function terminal(data: unknown) {
  const chain: Record<string, unknown> = {};
  const same = () => chain;
  for (const method of ['select', 'eq', 'like', 'order', 'limit', 'in']) {
    chain[method] = vi.fn(same);
  }
  chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return chain;
}

describe('existingReservationForTrigger', () => {
  it('retoma a reserva criada pelo mesmo turno em vez de recalcular slots', async () => {
    const eventQuery = terminal({
      payload: { appointment_id: 'appointment-1' },
    });
    const appointmentQuery = terminal({
      id: 'appointment-1',
      status: 'broker_confirmed',
      starts_at: '2026-07-28T11:00:00.000Z',
    });
    const db = {
      from: vi
        .fn()
        .mockReturnValueOnce(eventQuery)
        .mockReturnValueOnce(appointmentQuery),
    };

    const result = await existingReservationForTrigger(db as never, {
      accountId: 'account-1',
      opportunityId: 'opportunity-1',
      triggerMessageId: 'message-1',
    });

    expect(result?.id).toBe('appointment-1');
    expect(eventQuery.like).toHaveBeenCalledWith(
      'idempotency_key',
      'slot:message-1%'
    );
  });

  it('não reaproveita reserva sem vínculo com o turno', async () => {
    const db = {
      from: vi.fn().mockReturnValue(terminal(null)),
    };

    await expect(
      existingReservationForTrigger(db as never, {
        accountId: 'account-1',
        opportunityId: 'opportunity-1',
        triggerMessageId: 'message-2',
      })
    ).resolves.toBeNull();
  });
});
