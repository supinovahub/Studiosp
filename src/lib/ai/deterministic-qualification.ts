type Row = Record<string, unknown>;

const FINANCIAL_KEYS = new Set([
  'entry_budget',
  'monthly_installment_budget',
  'total_price_budget',
]);

function normalizedText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function resolveQualificationQuestion(
  questions: Row[],
  identifier: unknown
) {
  const candidate = normalizedText(identifier);
  if (!candidate) return null;
  return (
    questions.find(
      (question) =>
        normalizedText(question.id) === candidate ||
        normalizedText(question.key) === candidate
    ) ?? null
  );
}

function parseBrlAmount(message: string) {
  const match = message.match(
    /(?:r\$\s*)?(\d+(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(milhao|milhoes|mil|k)?\b/i
  );
  if (!match) return null;
  const raw = match[1].replace(/\s/g, '');
  const parsed = raw.includes(',')
    ? Number(raw.replace(/\./g, '').replace(',', '.'))
    : Number(raw.replace(/\./g, ''));
  if (!Number.isFinite(parsed)) return null;
  const multiplier = /milhao|milhoes/i.test(match[2] ?? '')
    ? 1_000_000
    : /mil|k/i.test(match[2] ?? '')
      ? 1_000
      : 1;
  return parsed * multiplier;
}

function moneyValue(message: string, amount: number) {
  const normalized = normalizedText(message);
  if (/\b(ate|maximo|no maximo)\b/.test(normalized)) {
    return { min: null, max: amount, currency: 'BRL' };
  }
  if (/\b(a partir|pelo menos|minimo|no minimo)\b/.test(normalized)) {
    return { min: amount, max: null, currency: 'BRL' };
  }
  return { min: amount, max: amount, currency: 'BRL' };
}

function candidate(
  questionKey: string,
  rawText: string,
  normalizedValue: unknown
) {
  return {
    question_id: questionKey,
    raw_text: rawText,
    normalized_value: normalizedValue,
    confidence: 0.99,
    deterministic: true,
  };
}

export function deterministicQualificationCandidates(args: {
  latestUserMessage: string;
  expectedQuestionKey?: string | null;
}) {
  const raw = args.latestUserMessage.trim();
  const message = normalizedText(raw);
  if (!message) return [] as Row[];
  const candidates = new Map<string, Row>();

  if (
    /\b(morar|moradia|uso proprio|investir|investimento|os dois|ambos)\b/.test(
      message
    )
  ) {
    const value =
      /\b(os dois|ambos)\b/.test(message) ||
      (/\b(morar|moradia|uso proprio)\b/.test(message) &&
        /\b(investir|investimento)\b/.test(message))
        ? 'os dois'
        : /\b(investir|investimento)\b/.test(message)
          ? 'investir'
          : 'morar';
    candidates.set(
      'purchase_objective',
      candidate('purchase_objective', raw, { value })
    );
  }

  if (
    /\b(na planta|planta|lancamento|em construcao|pronto|prontos|tanto faz|indiferente)\b/.test(
      message
    )
  ) {
    candidates.set(
      'property_timing',
      candidate('property_timing', raw, { value: raw })
    );
  }

  if (
    /\b(agora|imediato|sem pressa|\d+\s*(?:dia|dias|semana|semanas|mes|meses|ano|anos))\b/.test(
      message
    )
  ) {
    candidates.set(
      'purchase_urgency',
      candidate('purchase_urgency', raw, { text: raw })
    );
  }

  const amount = parseBrlAmount(message);
  if (amount !== null) {
    const explicitFinancialKeys: string[] = [];
    if (/\b(entrada|sinal)\b/.test(message)) {
      explicitFinancialKeys.push('entry_budget');
    }
    if (/\b(parcela|parcelas|mensal|por mes)\b/.test(message)) {
      explicitFinancialKeys.push('monthly_installment_budget');
    }
    if (/\b(preco total|valor total|valor do imovel|preco do imovel)\b/.test(message)) {
      explicitFinancialKeys.push('total_price_budget');
    }
    if (
      explicitFinancialKeys.length === 0 &&
      args.expectedQuestionKey &&
      FINANCIAL_KEYS.has(args.expectedQuestionKey)
    ) {
      explicitFinancialKeys.push(args.expectedQuestionKey);
    }
    for (const key of explicitFinancialKeys) {
      candidates.set(key, candidate(key, raw, moneyValue(message, amount)));
    }
  }

  if (
    args.expectedQuestionKey === 'preferred_locations' &&
    candidates.size === 0 &&
    !/\d/.test(message) &&
    !/^(sim|nao|isso|correto|nao sei|ainda nao sei)$/.test(message)
  ) {
    candidates.set(
      'preferred_locations',
      candidate('preferred_locations', raw, { values: [raw] })
    );
  }

  return [...candidates.values()];
}
