import { describe, expect, it } from 'vitest';
import {
  qualificationQuestionsRequiredBeforeMeeting,
  qualificationRequirementState,
} from './studiosp-orchestrator';

describe('qualificationQuestionsRequiredBeforeMeeting', () => {
  it('exige apenas os campos marcados como obrigatórios', () => {
    const questions = [
      { key: 'purchase_objective', is_active: true, is_required: true },
      {
        key: 'monthly_installment_budget',
        is_active: true,
        is_required: false,
      },
      { key: 'total_price_budget', is_active: true, is_required: false },
      { key: 'schedule_preference', is_active: true, is_required: false },
    ];

    expect(
      qualificationQuestionsRequiredBeforeMeeting(questions).map(
        (question) => question.key
      )
    ).toEqual(['purchase_objective']);
  });

  it('ignora campos inativos e a preferência preenchida no agendamento', () => {
    expect(
      qualificationQuestionsRequiredBeforeMeeting([
        { key: 'purchase_objective', is_active: false },
        { key: 'schedule_preference', is_active: true },
      ])
    ).toEqual([]);
  });

  it('conclui com os campos obrigatórios e uma referência financeira', () => {
    const questions = [
      {
        id: 'objective',
        key: 'purchase_objective',
        is_active: true,
        is_required: true,
      },
      {
        id: 'entry',
        key: 'entry_budget',
        is_active: true,
        is_required: false,
      },
      {
        id: 'installment',
        key: 'monthly_installment_budget',
        is_active: true,
        is_required: false,
      },
      {
        id: 'total',
        key: 'total_price_budget',
        is_active: true,
        is_required: false,
      },
    ];

    expect(
      qualificationRequirementState(
        questions,
        new Set(['objective', 'installment'])
      )
    ).toEqual({ complete: true, missingQuestions: [] });
    expect(
      qualificationRequirementState(questions, new Set(['objective', 'total']))
        .missingQuestions
    ).toEqual([questions[1]]);
  });
});
