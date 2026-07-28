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

  it('accepts an explicit unknown location without inventing a region', () => {
    expect(
      isValidQualificationValue(
        { data_type: 'location' },
        { values: [], unknown: true }
      )
    ).toBe(true);
    expect(
      isValidQualificationValue(
        { data_type: 'location' },
        { values: [], unknown: false }
      )
    ).toBe(false);
  });

  it('honors configured financial limits', () => {
    const question = {
      data_type: 'money_range',
      validation_schema: { minimum: 1_000, maximum: 5_000 },
    };
    expect(
      isValidQualificationValue(question, {
        min: 1_500,
        max: 3_000,
        currency: 'BRL',
      })
    ).toBe(true);
    expect(
      isValidQualificationValue(question, {
        min: 800,
        max: 3_000,
        currency: 'BRL',
      })
    ).toBe(false);
  });

  it('accepts explicit uncertainty only when configured', () => {
    expect(
      isValidQualificationValue(
        {
          data_type: 'money_range',
          validation_schema: { allow_unknown: true },
        },
        { unknown: true }
      )
    ).toBe(true);
    expect(
      isValidQualificationValue(
        { data_type: 'money_range', validation_schema: {} },
        { unknown: true }
      )
    ).toBe(false);
  });
});
