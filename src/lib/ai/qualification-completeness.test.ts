import { describe, expect, it } from 'vitest';
import { qualificationQuestionsRequiredBeforeMeeting } from './studiosp-orchestrator';

describe('qualificationQuestionsRequiredBeforeMeeting', () => {
  it('exige todos os campos ativos, inclusive os financeiros opcionais', () => {
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
    ).toEqual([
      'purchase_objective',
      'monthly_installment_budget',
      'total_price_budget',
    ]);
  });

  it('ignora campos inativos e a preferência preenchida no agendamento', () => {
    expect(
      qualificationQuestionsRequiredBeforeMeeting([
        { key: 'purchase_objective', is_active: false },
        { key: 'schedule_preference', is_active: true },
      ])
    ).toEqual([]);
  });
});
