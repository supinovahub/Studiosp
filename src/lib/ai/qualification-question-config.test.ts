import { describe, expect, it } from 'vitest';
import {
  isQualificationQuestionVisible,
  prepareQualificationQuestionInput,
  visibleQualificationQuestions,
} from './qualification-question-config';

describe('prepareQualificationQuestionInput', () => {
  it('transforma uma configuração válida sem tratar exemplos como respostas', () => {
    expect(
      prepareQualificationQuestionInput({
        label: 'Motivo da mudança',
        promptInstruction:
          'Entenda por que o lead começou a procurar um imóvel neste momento.',
        dataType: 'single_choice',
        isRequired: true,
        validationSchema: {
          question_example: 'O que fez você começar a procurar agora?',
          examples: ['Casamento', 'Mudança de trabalho'],
        },
        visibilityCondition: { mode: 'always' },
        options: [
          { label: 'Moradia', aliases: ['morar'] },
          { label: 'Investimento', aliases: ['investir'] },
        ],
      })
    ).toMatchObject({
      label: 'Motivo da mudança',
      dataType: 'single_choice',
      normalizationStrategy: 'enum_v1',
      isRequired: true,
      validationSchema: {
        question_example: 'O que fez você começar a procurar agora?',
        examples: ['Casamento', 'Mudança de trabalho'],
      },
      options: [
        { value: 'moradia', label: 'Moradia', aliases: ['morar'] },
        {
          value: 'investimento',
          label: 'Investimento',
          aliases: ['investir'],
        },
      ],
    });
  });

  it('recusa listas de escolha com menos de duas opções', () => {
    expect(() =>
      prepareQualificationQuestionInput({
        label: 'Objetivo adicional',
        promptInstruction:
          'Entenda qual alternativa representa melhor a necessidade.',
        dataType: 'single_choice',
        options: [{ label: 'Uma opção' }],
      })
    ).toThrow('pelo menos duas opções');
  });

  it('recusa condições sem valor quando o operador compara respostas', () => {
    expect(() =>
      prepareQualificationQuestionInput({
        label: 'Detalhe condicional',
        promptInstruction:
          'Entenda o detalhe apenas quando a resposta anterior exigir.',
        dataType: 'text',
        visibilityCondition: {
          mode: 'answer_matches',
          question_key: 'purchase_objective',
          operator: 'equals',
          values: [],
        },
      })
    ).toThrow('ao menos um valor');
  });
});

describe('isQualificationQuestionVisible', () => {
  const questions = [
    {
      id: 'objective',
      key: 'purchase_objective',
      visibility_condition: {},
    },
    {
      id: 'investment-profile',
      key: 'custom_investment_profile',
      visibility_condition: {
        mode: 'answer_matches',
        question_key: 'purchase_objective',
        operator: 'equals',
        values: ['investir'],
      },
    },
  ];

  it('libera um campo condicional somente com resposta confirmada compatível', () => {
    const answers = [
      {
        question_id: 'objective',
        status: 'confirmed',
        is_current: true,
        normalized_value: { value: 'investir', label: 'Investir' },
      },
    ];
    expect(
      isQualificationQuestionVisible(questions[1], questions, answers)
    ).toBe(true);
    expect(visibleQualificationQuestions(questions, answers)).toHaveLength(2);
  });

  it('mantém o campo oculto quando a dependência não foi confirmada', () => {
    expect(isQualificationQuestionVisible(questions[1], questions, [])).toBe(
      false
    );
    expect(visibleQualificationQuestions(questions, [])).toEqual([
      questions[0],
    ]);
  });
});
