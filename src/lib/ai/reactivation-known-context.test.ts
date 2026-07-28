import { describe, expect, it } from 'vitest';
import { knownReactivationConfirmationCandidates } from './studiosp-orchestrator';

const questions = [
  { id: 'objective', key: 'purchase_objective' },
  { id: 'entry', key: 'entry_budget' },
];

describe('knownReactivationConfirmationCandidates', () => {
  it('confirma somente o dado histórico perguntado explicitamente', () => {
    expect(
      knownReactivationConfirmationCandidates({
        questions,
        knownContext: {
          known_objective: 'invest',
          known_entry_value: 100000,
        },
        latestUserMessage: 'Continua de pé, Pedro',
        expectedQuestionKey: 'purchase_objective',
      })
    ).toEqual([
      expect.objectContaining({
        question_id: 'objective',
        normalized_value: { value: 'invest' },
      }),
    ]);
  });

  it('não transforma a confirmação genérica da reativação em dados do perfil', () => {
    expect(
      knownReactivationConfirmationCandidates({
        questions,
        knownContext: {
          known_objective: 'invest',
          known_entry_value: 100000,
        },
        latestUserMessage: 'Sim, ainda estou olhando',
        expectedQuestionKey: null,
      })
    ).toEqual([]);
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
        expectedQuestionKey: 'entry_budget',
      })
    ).toEqual([]);
  });
});
