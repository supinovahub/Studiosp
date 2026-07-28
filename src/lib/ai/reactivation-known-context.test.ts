import { describe, expect, it } from 'vitest';
import { knownReactivationConfirmationCandidates } from './studiosp-orchestrator';

const questions = [
  { id: 'objective', key: 'purchase_objective' },
  { id: 'entry', key: 'entry_budget' },
];

describe('knownReactivationConfirmationCandidates', () => {
  it('confirma objetivo e entrada conhecidos quando o lead mantém o cenário', () => {
    expect(
      knownReactivationConfirmationCandidates({
        questions,
        knownContext: {
          known_objective: 'invest',
          known_entry_value: 100000,
        },
        latestUserMessage: 'Continua de pé, Pedro',
      })
    ).toEqual([
      expect.objectContaining({
        question_id: 'objective',
        normalized_value: { value: 'invest' },
      }),
      expect.objectContaining({
        question_id: 'entry',
        normalized_value: {
          min: 100000,
          max: 100000,
          currency: 'BRL',
        },
      }),
    ]);
  });

  it('não confirma automaticamente quando o lead sinaliza mudança', () => {
    expect(
      knownReactivationConfirmationCandidates({
        questions,
        knownContext: {
          known_objective: 'invest',
          known_entry_value: 100000,
        },
        latestUserMessage: 'Continua, mas a entrada mudou',
      })
    ).toEqual([]);
  });
});
