type Row = Record<string, unknown>;

function finiteNonNegative(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  );
}

export function isValidQualificationValue(
  question: Row,
  normalizedValue: unknown,
  allowedOptions: string[] = []
) {
  const validation =
    question.validation_schema &&
    typeof question.validation_schema === 'object' &&
    !Array.isArray(question.validation_schema)
      ? (question.validation_schema as Row)
      : {};
  const value =
    normalizedValue && typeof normalizedValue === 'object'
      ? (normalizedValue as Row)
      : null;
  if (validation.allow_unknown === true && value?.unknown === true) return true;

  switch (question.data_type) {
    case 'money_range': {
      const structurallyValid =
        Boolean(value) &&
        finiteNonNegative(value?.min) &&
        finiteNonNegative(value?.max) &&
        (typeof value?.min === 'number' || typeof value?.max === 'number') &&
        (value?.currency === undefined || value.currency === 'BRL');
      if (!structurallyValid) return false;
      const minimum =
        typeof validation.minimum === 'number' ? validation.minimum : null;
      const maximum =
        typeof validation.maximum === 'number' ? validation.maximum : null;
      const suppliedMinimum =
        typeof value?.min === 'number' ? value.min : value?.max;
      const suppliedMaximum =
        typeof value?.max === 'number' ? value.max : value?.min;
      return (
        (minimum === null ||
          (typeof suppliedMinimum === 'number' &&
            suppliedMinimum >= minimum)) &&
        (maximum === null ||
          (typeof suppliedMaximum === 'number' && suppliedMaximum <= maximum))
      );
    }
    case 'location':
      return (
        Boolean(value) &&
        Array.isArray(value?.values) &&
        ((value.unknown === true &&
          validation.allow_unknown !== false &&
          value.values.length === 0) ||
          (value.values.length > 0 &&
            value.values.every(
              (item) => typeof item === 'string' && item.trim().length > 0
            )))
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
