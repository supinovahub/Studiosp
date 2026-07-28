type Row = Record<string, unknown>;

function finiteNonNegative(value: unknown) {
  return (
    (value === null || value === undefined) ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  );
}

export function isValidQualificationValue(
  question: Row,
  normalizedValue: unknown,
  allowedOptions: string[] = []
) {
  const value =
    normalizedValue && typeof normalizedValue === 'object'
      ? (normalizedValue as Row)
      : null;

  switch (question.data_type) {
    case 'money_range':
      return (
        Boolean(value) &&
        finiteNonNegative(value?.min) &&
        finiteNonNegative(value?.max) &&
        (typeof value?.min === 'number' || typeof value?.max === 'number') &&
        (value?.currency === undefined || value.currency === 'BRL')
      );
    case 'location':
      return (
        Boolean(value) &&
        Array.isArray(value?.values) &&
        value.values.length > 0 &&
        value.values.every(
          (item) => typeof item === 'string' && item.trim().length > 0
        )
      );
    case 'single_choice':
      return (
        Boolean(value) &&
        typeof value?.value === 'string' &&
        value.value.length > 0 &&
        (!allowedOptions.length || allowedOptions.includes(value.value))
      );
    case 'multi_choice':
      return (
        Boolean(value) &&
        Array.isArray(value?.values) &&
        value.values.length > 0 &&
        value.values.every(
          (item) =>
            typeof item === 'string' &&
            (!allowedOptions.length || allowedOptions.includes(item))
        )
      );
    case 'date_range':
      return (
        Boolean(value) &&
        typeof value?.text === 'string' &&
        value.text.trim().length > 0
      );
    case 'boolean':
      return (
        typeof normalizedValue === 'boolean' ||
        (Boolean(value) && typeof value?.value === 'boolean')
      );
    case 'text':
      return (
        (typeof normalizedValue === 'string' &&
          normalizedValue.trim().length > 0) ||
        (Boolean(value) &&
          typeof value?.text === 'string' &&
          value.text.trim().length > 0)
      );
    default:
      return false;
  }
}
