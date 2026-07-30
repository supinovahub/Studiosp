import { describe, expect, it } from 'vitest';
import {
  deterministicQualificationCandidates,
  resolveQualificationQuestion,
} from './deterministic-qualification';
import {
  normalizeQualificationValue,
  qualificationEvidenceMessage,
} from './studiosp-orchestrator';
import { isValidQualificationValue } from './qualification-validation';

describe('deterministic qualification', () => {
  it('binds a fact to the exact message that contains its evidence', () => {
    const messages = [
      { id: 'm1', content_text: 'Seria para morar mesmo' },
      { id: 'm2', content_text: 'mas nada tão caro de começo' },
    ];

    expect(
      qualificationEvidenceMessage({
        rawText: 'Seria para morar mesmo\nmas nada tão caro de começo',
        questionKey: 'purchase_objective',
        messages,
      })
    ).toMatchObject({
      id: 'm1',
      content_text: 'Seria para morar mesmo',
    });
  });

  it('uses the latest compatible correction inside a rapid message turn', () => {
    const messages = [
      { id: 'm1', content_text: 'uns 50' },
      { id: 'm2', content_text: 'na real 40' },
    ];

    const candidates = messages.flatMap((message) =>
      deterministicQualificationCandidates({
        latestUserMessage: message.content_text,
        expectedQuestionKey: 'entry_budget',
      })
    );

    expect(candidates.at(-1)).toMatchObject({
      raw_text: 'na real 40',
      normalized_value: { min: 40, max: 40, currency: 'BRL' },
    });
  });

  it('resolves both canonical keys and database ids', () => {
    const questions = [
      { id: 'uuid-objective', key: 'purchase_objective' },
      { id: 'uuid-location', key: 'preferred_locations' },
    ];
    expect(
      resolveQualificationQuestion(questions, 'purchase_objective')?.id
    ).toBe('uuid-objective');
    expect(
      resolveQualificationQuestion(questions, 'uuid-location')?.key
    ).toBe('preferred_locations');
  });

  it('replays the objective and location turns without confusing their fields', () => {
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: 'seria pra morar',
        expectedQuestionKey: 'purchase_objective',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ question_id: 'purchase_objective' }),
      ])
    );
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: 'vila madalena',
        expectedQuestionKey: 'preferred_locations',
      })
    ).toEqual([
      expect.objectContaining({ question_id: 'preferred_locations' }),
    ]);
  });

  it('extracts the three financial fields from the failed conversation', () => {
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: '150 mil de preço total',
        expectedQuestionKey: 'entry_budget',
      })
    ).toEqual([
      expect.objectContaining({
        question_id: 'total_price_budget',
        normalized_value: {
          min: 150000,
          max: 150000,
          currency: 'BRL',
        },
      }),
    ]);
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: 'e até 5 mil de parcela',
        expectedQuestionKey: 'entry_budget',
      })
    ).toEqual([
      expect.objectContaining({
        question_id: 'monthly_installment_budget',
        normalized_value: {
          min: null,
          max: 5000,
          currency: 'BRL',
        },
      }),
    ]);
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: '40 mil',
        expectedQuestionKey: 'entry_budget',
      })
    ).toEqual([
      expect.objectContaining({
        question_id: 'entry_budget',
        normalized_value: {
          min: 40000,
          max: 40000,
          currency: 'BRL',
        },
      }),
    ]);
  });

  it('extracts property timing and a long purchase horizon', () => {
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: 'prefiro imóveis prontos mesmo',
        expectedQuestionKey: 'property_timing',
      })
    ).toEqual([
      expect.objectContaining({
        question_id: 'property_timing',
        normalized_value: { value: 'pronto' },
      }),
    ]);
    expect(
      deterministicQualificationCandidates({
        latestUserMessage: 'seria em até 3 anos mesmo',
        expectedQuestionKey: 'purchase_urgency',
      })
    ).toEqual([
      expect.objectContaining({ question_id: 'purchase_urgency' }),
    ]);
  });

  it('replays every business field into the canonical production contract', () => {
    const questions = [
      { id: 'q-objective', key: 'purchase_objective', data_type: 'single_choice' },
      { id: 'q-location', key: 'preferred_locations', data_type: 'location' },
      { id: 'q-entry', key: 'entry_budget', data_type: 'money_range' },
      {
        id: 'q-installment',
        key: 'monthly_installment_budget',
        data_type: 'money_range',
      },
      { id: 'q-total', key: 'total_price_budget', data_type: 'money_range' },
      { id: 'q-timing', key: 'property_timing', data_type: 'single_choice' },
      { id: 'q-urgency', key: 'purchase_urgency', data_type: 'single_choice' },
    ];
    const options = [
      { question_id: 'q-objective', value: 'live', label: 'Morar', aliases: ['morar'] },
      {
        question_id: 'q-timing',
        value: 'ready',
        label: 'Pronto',
        aliases: ['pronto para morar', 'prontos'],
      },
      {
        question_id: 'q-urgency',
        value: 'over_twelve_months',
        label: 'Mais de 12 meses',
        aliases: ['sem pressa'],
      },
    ];
    const turns = [
      ['seria pra morar', 'purchase_objective'],
      ['vila madalena', 'preferred_locations'],
      ['150 mil de preço total', 'entry_budget'],
      ['e até 5 mil de parcela', 'entry_budget'],
      ['40 mil', 'entry_budget'],
      ['prefiro imóveis prontos mesmo', 'property_timing'],
      ['seria em até 3 anos mesmo', 'purchase_urgency'],
    ] as const;
    const accepted = new Set<string>();

    for (const [latestUserMessage, expectedQuestionKey] of turns) {
      for (const extracted of deterministicQualificationCandidates({
        latestUserMessage,
        expectedQuestionKey,
      })) {
        const question = resolveQualificationQuestion(
          questions,
          extracted.question_id
        );
        expect(question).not.toBeNull();
        const questionOptions = options.filter(
          (option) => option.question_id === question?.id
        );
        const normalized = normalizeQualificationValue({
          question: question!,
          normalizedValue: extracted.normalized_value,
          options: questionOptions,
        });
        expect(
          isValidQualificationValue(
            question!,
            normalized,
            questionOptions.map((option) => option.value)
          )
        ).toBe(true);
        accepted.add(String(question?.key));
      }
    }

    expect(accepted).toEqual(
      new Set([
        'purchase_objective',
        'preferred_locations',
        'entry_budget',
        'monthly_installment_budget',
        'total_price_budget',
        'property_timing',
        'purchase_urgency',
      ])
    );
  });
});
