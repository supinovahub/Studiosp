import { describe, expect, it } from 'vitest';
import {
  classifyLeadPosture,
  conversationTurn,
  deterministicPostureReply,
  explicitUnknownCandidate,
  inferExpectedQuestionKey,
  isExplicitReactivationAffirmation,
  isQualificationCandidateSemanticallyCompatible,
  isQualificationCandidateGrounded,
} from './conversation-behavior';

describe('conversation behavior', () => {
  it('uses the last assistant question to interpret a short financial answer', () => {
    const turn = conversationTurn([
      {
        role: 'assistant',
        content: 'Qual faixa de entrada você consegue usar?',
      },
      { role: 'user', content: 'entre 30 e 50 mil' },
    ]);
    expect(turn.expectedQuestionKey).toBe('entry_budget');
    expect(
      isQualificationCandidateGrounded({
        candidate: {
          raw_text: 'entre 30 e 50 mil',
          normalized_value: { min: 30000, max: 50000, currency: 'BRL' },
        },
        question: { key: 'entry_budget' },
        latestUserMessage: turn.latestUserMessage,
        expectedQuestionKey: turn.expectedQuestionKey,
      })
    ).toBe(true);
    expect(
      isQualificationCandidateGrounded({
        candidate: {
          raw_text: 'entre 30 e 50 mil',
          normalized_value: { min: 30000, max: 50000, currency: 'BRL' },
        },
        question: { key: 'monthly_installment_budget' },
        latestUserMessage: turn.latestUserMessage,
        expectedQuestionKey: turn.expectedQuestionKey,
      })
    ).toBe(false);
  });

  it('rejects an example from an older message as evidence for the latest no', () => {
    expect(
      isQualificationCandidateGrounded({
        candidate: {
          raw_text: '400 mil',
          normalized_value: { min: null, max: 400000, currency: 'BRL' },
        },
        question: { key: 'total_price_budget' },
        latestUserMessage: 'não',
        expectedQuestionKey: 'total_price_budget',
      })
    ).toBe(false);
  });

  it('stores not knowing a location as an explicit broad preference', () => {
    expect(
      explicitUnknownCandidate({
        questions: [{ id: 'location', key: 'preferred_locations' }],
        latestUserMessage: 'não sei ainda',
        expectedQuestionKey: 'preferred_locations',
      })
    ).toEqual(
      expect.objectContaining({
        question_id: 'location',
        normalized_value: { values: [], unknown: true },
      })
    );
  });

  it('distinguishes hesitation in a reactivation from a qualification answer', () => {
    expect(
      classifyLeadPosture({
        latestUserMessage: 'não sei',
        previousAssistantMessage: 'Você ainda pretende seguir com a compra?',
        expectedQuestionKey: null,
        isReactivation: true,
      })
    ).toBe('reactivation_hesitation');
  });

  it('treats the exact production reply as reactivation hesitation without a qualification key', () => {
    expect(
      classifyLeadPosture({
        latestUserMessage: 'Mais ou menos',
        previousAssistantMessage:
          'Você ainda está avaliando essa possibilidade?',
        expectedQuestionKey: null,
        expectedResponseKind: 'reactivation_interest',
        isReactivation: true,
      })
    ).toBe('reactivation_hesitation');
  });

  it('recognizes a bare question mark as confusion', () => {
    expect(
      classifyLeadPosture({
        latestUserMessage: '?',
        previousAssistantMessage:
          'Você ainda está avaliando essa possibilidade?',
        expectedQuestionKey: null,
        expectedResponseKind: 'reactivation_interest',
        isReactivation: true,
      })
    ).toBe('confused');
  });

  it('creates different contextual repairs for hesitation and confusion', () => {
    const hesitation = deterministicPostureReply({
      posture: 'reactivation_hesitation',
      isReactivation: true,
      expectedResponseKind: 'reactivation_interest',
    });
    const confusion = deterministicPostureReply({
      posture: 'confused',
      isReactivation: true,
      expectedResponseKind: 'reactivation_interest',
    });

    expect(hesitation).toMatch(/dúvida/i);
    expect(confusion).toMatch(/ainda está nos seus planos/i);
    expect(confusion).not.toBe(hesitation);
  });

  it('only resolves reactivation when the lead affirms continued interest', () => {
    expect(
      isExplicitReactivationAffirmation('Sim, ainda estou avaliando')
    ).toBe(true);
    expect(isExplicitReactivationAffirmation('Sim, tá correto')).toBe(true);
    expect(isExplicitReactivationAffirmation('Isso mesmo')).toBe(true);
    expect(isExplicitReactivationAffirmation('Claro, pode sim')).toBe(true);
    expect(isExplicitReactivationAffirmation('Mais ou menos')).toBe(false);
    expect(isExplicitReactivationAffirmation('?')).toBe(false);
  });

  it('keeps an ambivalent short answer on the same qualification subject', () => {
    expect(
      classifyLeadPosture({
        latestUserMessage: 'mais ou menos',
        previousAssistantMessage: 'Você ainda pretende seguir com a compra?',
        expectedQuestionKey: 'purchase_objective',
        isReactivation: true,
      })
    ).toBe('ambivalent');
  });

  it('recognizes canonical questions in natural language', () => {
    expect(
      inferExpectedQuestionKey('Qual parcela mensal fica confortável pra você?')
    ).toBe('monthly_installment_budget');
    expect(
      inferExpectedQuestionKey('Você prefere algo na planta ou pronto?')
    ).toBe('property_timing');
  });
});

describe('semantic qualification invariants', () => {
  it('never accepts a neighborhood as a purchase objective', () => {
    expect(
      isQualificationCandidateSemanticallyCompatible({
        questionKey: 'purchase_objective',
        rawText: 'vila madalena',
      })
    ).toBe(false);
  });

  it('accepts the same neighborhood only as a location', () => {
    expect(
      isQualificationCandidateSemanticallyCompatible({
        questionKey: 'preferred_locations',
        rawText: 'vila madalena',
      })
    ).toBe(true);
  });

  it('keeps explicit objective and purchase horizon evidence valid', () => {
    expect(
      isQualificationCandidateSemanticallyCompatible({
        questionKey: 'purchase_objective',
        rawText: 'para morar',
      })
    ).toBe(true);
    expect(
      isQualificationCandidateSemanticallyCompatible({
        questionKey: 'purchase_urgency',
        rawText: 'em 3 anos',
      })
    ).toBe(true);
  });
});
