import { describe, expect, it, vi } from 'vitest';
import {
  existingReservationForTrigger,
  nearestCompatibleSlots,
  normalizeExtractionAnswerRows,
} from './studiosp-orchestrator';

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

describe('nearestCompatibleSlots', () => {
  it('prioriza os horários mais próximos no mesmo dia de São Paulo', () => {
    const result = nearestCompatibleSlots(
      [
        { id: 'next-day', starts_at: '2026-07-29T12:00:00.000Z' },
        { id: 'late', starts_at: '2026-07-28T15:00:00.000Z' },
        { id: 'closest', starts_at: '2026-07-28T13:15:00.000Z' },
        { id: 'early', starts_at: '2026-07-28T12:00:00.000Z' },
      ],
      new Date('2026-07-28T10:00:00-03:00'),
      2
    );

    expect(result.map((slot) => slot.id)).toEqual(['closest', 'early']);
  });
});

describe('normalizeExtractionAnswerRows', () => {
  it('preserva o contrato canônico com answers', () => {
    expect(
      normalizeExtractionAnswerRows({
        answers: [
          {
            question_id: 'objective',
            raw_text: 'investir',
            normalized_value: { value: 'invest', label: 'Investir' },
            confidence: 1,
          },
        ],
      })
    ).toHaveLength(1);
  });

  it('normaliza a resposta única produzida pelo modelo de contingência', () => {
    expect(
      normalizeExtractionAnswerRows({
        question_id: 'objective',
        raw_text: 'seria para investimento',
        normalized_value: { value: 'invest', label: 'Investir' },
        confidence: 1,
      })
    ).toEqual([
      {
        question_id: 'objective',
        raw_text: 'seria para investimento',
        normalized_value: { value: 'invest', label: 'Investir' },
        confidence: 1,
      },
    ]);
  });

  it('não transforma uma saída sem evidência em resposta', () => {
    expect(
      normalizeExtractionAnswerRows({
        summary: 'Lead interessado em investimento',
      })
    ).toEqual([]);
  });
});
