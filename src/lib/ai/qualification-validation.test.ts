import { describe, expect, it } from 'vitest';
import { isValidQualificationValue } from './qualification-validation';

describe('qualification value validation', () => {
  it('rejects a location accidentally assigned to a money question', () => {
    expect(
      isValidQualificationValue(
        { data_type: 'money_range' },
        { values: ['Higienópolis'] }
      )
    ).toBe(false);
  });

  it('accepts BRL ranges with at least one numeric boundary', () => {
    expect(
      isValidQualificationValue(
        { data_type: 'money_range' },
        { min: null, max: 200_000, currency: 'BRL' }
      )
    ).toBe(true);
    expect(
      isValidQualificationValue(
        { data_type: 'money_range' },
        { min: null, max: null, currency: 'BRL' }
      )
    ).toBe(false);
  });

  it('checks configured options for single-choice questions', () => {
    expect(
      isValidQualificationValue(
        { data_type: 'single_choice' },
        { value: 'off_plan' },
        ['off_plan', 'ready']
      )
    ).toBe(true);
    expect(
      isValidQualificationValue(
        { data_type: 'single_choice' },
        { value: 'Higienópolis' },
        ['off_plan', 'ready']
      )
    ).toBe(false);
  });
});
