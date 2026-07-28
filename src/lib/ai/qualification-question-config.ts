export type QualificationDataType =
  | 'text'
  | 'single_choice'
  | 'multi_choice'
  | 'money_range'
  | 'location'
  | 'date_range'
  | 'boolean';

export type QualificationVisibilityCondition =
  | { mode: 'always' }
  | {
      mode: 'answer_matches';
      question_key: string;
      operator: 'answered' | 'not_answered' | 'equals' | 'includes_any';
      values: string[];
    };

export interface QualificationQuestionOptionInput {
  id?: string;
  value: string;
  label: string;
  aliases: string[];
}

export interface QualificationQuestionInput {
  label: string;
  promptInstruction: string;
  dataType: QualificationDataType;
  normalizationStrategy: string;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
  validationSchema: Record<string, unknown>;
  visibilityCondition: QualificationVisibilityCondition;
  options: QualificationQuestionOptionInput[];
}

type Row = Record<string, unknown>;

export const QUALIFICATION_DATA_TYPES: Array<{
  value: QualificationDataType;
  label: string;
  description: string;
}> = [
  {
    value: 'text',
    label: 'Texto curto',
    description: 'Respostas abertas, como uma motivação ou observação.',
  },
  {
    value: 'single_choice',
    label: 'Uma opção',
    description: 'A resposta deve corresponder a uma alternativa.',
  },
  {
    value: 'multi_choice',
    label: 'Várias opções',
    description: 'O lead pode mencionar mais de uma alternativa.',
  },
  {
    value: 'money_range',
    label: 'Faixa de valor',
    description: 'Normaliza valores mínimo e máximo em reais.',
  },
  {
    value: 'location',
    label: 'Bairro ou região',
    description: 'Aceita uma ou mais localizações e “ainda não sei”.',
  },
  {
    value: 'date_range',
    label: 'Prazo ou período',
    description: 'Normaliza uma preferência de tempo em texto.',
  },
  {
    value: 'boolean',
    label: 'Sim ou não',
    description: 'Decisão simples com resposta afirmativa ou negativa.',
  },
];

const DATA_TYPE_VALUES = new Set(
  QUALIFICATION_DATA_TYPES.map((type) => type.value)
);

const NORMALIZATION_BY_TYPE: Record<QualificationDataType, string> = {
  text: 'free_text_v1',
  single_choice: 'enum_v1',
  multi_choice: 'enum_list_v1',
  money_range: 'currency_range_brl_v1',
  location: 'location_list_v1',
  date_range: 'date_range_text_v1',
  boolean: 'boolean_v1',
};

export class QualificationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualificationConfigurationError';
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedIdentifier(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function qualificationLabelFingerprint(value: unknown) {
  return stringValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitizeStringList(value: unknown, limit: number, itemLimit: number) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map(stringValue)
        .filter(Boolean)
        .map((item) => item.slice(0, itemLimit))
    ),
  ].slice(0, limit);
}

function sanitizeValidationSchema(value: unknown) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Row)
      : {};
  const schema: Record<string, unknown> = {};
  const questionExample = stringValue(source.question_example);
  const clarificationGuidance = stringValue(source.clarification_guidance);
  const examples = sanitizeStringList(source.examples, 6, 160);
  const minimum = finiteNumber(source.minimum);
  const maximum = finiteNumber(source.maximum);

  if (questionExample) schema.question_example = questionExample.slice(0, 240);
  if (clarificationGuidance) {
    schema.clarification_guidance = clarificationGuidance.slice(0, 500);
  }
  if (examples.length) schema.examples = examples;
  if (source.allow_unknown === true) schema.allow_unknown = true;
  if (minimum !== null) schema.minimum = minimum;
  if (maximum !== null) schema.maximum = maximum;
  if (source.currency === 'BRL') schema.currency = 'BRL';
  if (minimum !== null && maximum !== null && minimum > maximum) {
    throw new QualificationConfigurationError(
      'O valor mínimo não pode ser maior que o valor máximo.'
    );
  }
  return schema;
}

function sanitizeVisibilityCondition(
  value: unknown
): QualificationVisibilityCondition {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Row)
      : {};
  if (!source.mode || source.mode === 'always') return { mode: 'always' };
  if (source.mode !== 'answer_matches') {
    throw new QualificationConfigurationError(
      'A condição de uso desta informação é inválida.'
    );
  }
  const questionKey = stringValue(source.question_key);
  const operator = stringValue(source.operator);
  const operators = new Set([
    'answered',
    'not_answered',
    'equals',
    'includes_any',
  ]);
  if (!questionKey || !operators.has(operator)) {
    throw new QualificationConfigurationError(
      'Escolha uma informação anterior e uma condição válida.'
    );
  }
  const values = sanitizeStringList(source.values, 12, 100);
  if (['equals', 'includes_any'].includes(operator) && !values.length) {
    throw new QualificationConfigurationError(
      'Informe ao menos um valor para a condição.'
    );
  }
  return {
    mode: 'answer_matches',
    question_key: questionKey,
    operator: operator as
      'answered' | 'not_answered' | 'equals' | 'includes_any',
    values,
  };
}

function sanitizeOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.map((rawOption, index) => {
    const option =
      rawOption && typeof rawOption === 'object'
        ? (rawOption as Row)
        : ({} as Row);
    const label = stringValue(option.label).slice(0, 100);
    const baseValue =
      stringValue(option.value) ||
      normalizedIdentifier(label) ||
      `opcao_${index + 1}`;
    const optionValue = normalizedIdentifier(baseValue);
    if (!label) {
      throw new QualificationConfigurationError(
        `Informe o nome da opção ${index + 1}.`
      );
    }
    if (!optionValue || seen.has(optionValue)) {
      throw new QualificationConfigurationError(
        'As opções precisam ter nomes diferentes.'
      );
    }
    seen.add(optionValue);
    return {
      ...(stringValue(option.id) ? { id: stringValue(option.id) } : {}),
      value: optionValue,
      label,
      aliases: sanitizeStringList(option.aliases, 10, 80),
    };
  });
}

export function prepareQualificationQuestionInput(
  body: Record<string, unknown>
): QualificationQuestionInput {
  const label = stringValue(body.label);
  const promptInstruction = stringValue(body.promptInstruction);
  const requestedType = stringValue(body.dataType) as QualificationDataType;
  if (label.length < 3 || label.length > 120) {
    throw new QualificationConfigurationError(
      'Dê um nome interno de 3 a 120 caracteres para a informação.'
    );
  }
  if (promptInstruction.length < 12 || promptInstruction.length > 800) {
    throw new QualificationConfigurationError(
      'Explique em 12 a 800 caracteres o que a IA precisa descobrir.'
    );
  }
  if (!DATA_TYPE_VALUES.has(requestedType)) {
    throw new QualificationConfigurationError(
      'Escolha um tipo de resposta válido.'
    );
  }
  const displayOrder = Number(body.displayOrder ?? 100);
  if (
    !Number.isInteger(displayOrder) ||
    displayOrder < 0 ||
    displayOrder > 10000
  ) {
    throw new QualificationConfigurationError(
      'A posição desta informação é inválida.'
    );
  }
  const validationSchema = sanitizeValidationSchema(body.validationSchema);
  const visibilityCondition = sanitizeVisibilityCondition(
    body.visibilityCondition
  );
  const options = sanitizeOptions(body.options);
  const isChoice = ['single_choice', 'multi_choice'].includes(requestedType);
  if (isChoice && options.length < 2) {
    throw new QualificationConfigurationError(
      'Cadastre pelo menos duas opções de resposta.'
    );
  }
  if (!isChoice && options.length) {
    throw new QualificationConfigurationError(
      'Este tipo de resposta não utiliza uma lista de opções.'
    );
  }
  if (requestedType === 'money_range') validationSchema.currency = 'BRL';

  return {
    label,
    promptInstruction,
    dataType: requestedType,
    normalizationStrategy: NORMALIZATION_BY_TYPE[requestedType],
    isRequired: body.isRequired === true,
    isActive: body.isActive !== false,
    displayOrder,
    validationSchema,
    visibilityCondition,
    options,
  };
}

function answerComparableValues(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value)];
  }
  if (typeof value === 'boolean') return [String(value)];
  if (!value || typeof value !== 'object') return [];
  const row = value as Row;
  const values = Array.isArray(row.values)
    ? row.values.map((item) => String(item))
    : [];
  for (const candidate of [row.value, row.text, row.min, row.max]) {
    if (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      values.push(String(candidate));
    }
  }
  return values.map(qualificationLabelFingerprint).filter(Boolean);
}

export function isQualificationQuestionVisible(
  question: Row,
  questions: Row[],
  confirmedAnswers: Row[]
) {
  let condition: QualificationVisibilityCondition;
  try {
    condition = sanitizeVisibilityCondition(question.visibility_condition);
  } catch {
    return false;
  }
  if (condition.mode === 'always') return true;
  const dependency = questions.find(
    (candidate) => candidate.key === condition.question_key
  );
  if (!dependency) return false;
  const answer = confirmedAnswers.find(
    (candidate) =>
      candidate.question_id === dependency.id &&
      candidate.status === 'confirmed' &&
      candidate.is_current !== false
  );
  if (condition.operator === 'answered') return Boolean(answer);
  if (condition.operator === 'not_answered') return !answer;
  if (!answer) return false;
  const configuredValues = condition.values.map(qualificationLabelFingerprint);
  const answerValues = answerComparableValues(answer.normalized_value);
  return configuredValues.some((value) => answerValues.includes(value));
}

export function visibleQualificationQuestions(
  questions: Row[],
  confirmedAnswers: Row[]
) {
  return questions.filter((question) =>
    isQualificationQuestionVisible(question, questions, confirmedAnswers)
  );
}
