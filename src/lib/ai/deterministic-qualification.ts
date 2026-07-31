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
    /(?:r\$\s*)?(\d+(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(milhao|milhoes|mil|k)?(?=\b|pra|para)/i
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

function explicitLocationValue(message: string) {
  const match = message.match(
    /\b(?:bairro|regi[aã]o|localiza[cç][aã]o)\s+(?:tipo\s+|como\s+|de\s+)?([\p{L}][\p{L}\s'-]{1,60}?)(?=\s+(?:pra|para|e\s+(?:quero|queria|gostaria)|com\s+|at[eé]\s+)|[,.!?]|$)/iu
  );
  const value = match?.[1]?.trim();
  return value && value.length >= 2 ? value : null;
}

export function deterministicPropertyTimingValue(value: string) {
  const message = normalizedText(value);
  if (
    /\b(na planta|planta|lancamento|em construcao|em obras|obra em andamento|pre lancamento|pre-lancamento|entrega futura)\b/.test(
      message
    )
  ) {
    return 'off_plan';
  }
  if (
    /\b(pront[oa]s?|terminad[oa]s?|finalizad[oa]s?|concluid[oa]s?|entregues?|ja construid[oa]s?|chaves? na mao)\b/.test(
      message
    )
  ) {
    return 'ready';
  }
  if (
    /\b(tanto faz|indiferente|qualquer um|qualquer dos dois|sem preferencia)\b/.test(
      message
    )
  ) {
    return 'indifferent';
  }
  return null;
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

  const timingValue = deterministicPropertyTimingValue(message);
  if (timingValue) {
    candidates.set(
      'property_timing',
      candidate('property_timing', raw, { value: timingValue })
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
      /\b(?:tenho|teria|disponho|orcamento|budget|pra gastar|para gastar|posso gastar|consigo gastar)\b/.test(
        message
      )
    ) {
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

  const explicitLocation = explicitLocationValue(raw);
  if (explicitLocation) {
    candidates.set(
      'preferred_locations',
      candidate('preferred_locations', raw, { values: [explicitLocation] })
    );
  }

  if (
    args.expectedQuestionKey === 'preferred_locations' &&
    !candidates.has('preferred_locations') &&
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
