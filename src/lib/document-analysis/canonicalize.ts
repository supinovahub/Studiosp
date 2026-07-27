import type { AnalysisResult, ProposedField, ProposedItem } from './analyze';

const FIELD_ALIASES: Record<string, string> = {
  incorporadora: 'developer_name',
  construtora: 'developer_name',
  developer: 'developer_name',
  developer_name: 'developer_name',
  empreendimento: 'name',
  nome_do_empreendimento: 'name',
  nome_empreendimento: 'name',
  name: 'name',
  endereco: 'address',
  localizacao: 'address',
  address: 'address',
  bairro: 'neighborhood',
  regiao: 'neighborhood',
  zona: 'neighborhood',
  neighborhood: 'neighborhood',
  cidade: 'city',
  municipio: 'city',
  city: 'city',
  status: 'property_timing',
  fase: 'property_timing',
  situacao: 'property_timing',
  property_timing: 'property_timing',
  entrega: 'expected_delivery_date',
  previsao_de_entrega: 'expected_delivery_date',
  previsao_entrega: 'expected_delivery_date',
  data_de_entrega: 'expected_delivery_date',
  expected_delivery_date: 'expected_delivery_date',
  destaques: 'highlights',
  diferenciais: 'highlights',
  highlights: 'highlights',
  observacoes: 'knowledge_notes',
  contexto: 'knowledge_notes',
  knowledge_notes: 'knowledge_notes',
  opcao: 'label',
  tipologia: 'label',
  unidade: 'label',
  label: 'label',
  area: 'area_min_sqm',
  metragem: 'area_min_sqm',
  metragem_minima: 'area_min_sqm',
  m2: 'area_min_sqm',
  area_minima: 'area_min_sqm',
  area_min_sqm: 'area_min_sqm',
  area_maxima: 'area_max_sqm',
  area_max_sqm: 'area_max_sqm',
  preco: 'price_from',
  valor: 'price_from',
  valor_de_tabela: 'price_from',
  preco_a_partir: 'price_from',
  valor_a_partir: 'price_from',
  price_from: 'price_from',
  preco_ate: 'price_to',
  price_to: 'price_to',
  entrada: 'entry_from',
  valor_entrada: 'entry_from',
  sinal: 'entry_from',
  ato: 'entry_from',
  entry_from: 'entry_from',
  entrada_ate: 'entry_to',
  entry_to: 'entry_to',
  parcela: 'installment_from',
  parcelas: 'installment_from',
  mensal: 'installment_from',
  parcela_mensal: 'installment_from',
  installment_from: 'installment_from',
  parcela_ate: 'installment_to',
  installment_to: 'installment_to',
  condicoes: 'terms_summary',
  fluxo: 'terms_summary',
  terms_summary: 'terms_summary',
  validade: 'valid_until',
  valido_ate: 'valid_until',
  valid_until: 'valid_until',
  ativo: 'is_active',
  disponivel: 'is_active',
  is_active: 'is_active',
  media_candidates: 'media_candidates',
};

const MONEY_FIELDS = new Set([
  'price_from',
  'price_to',
  'entry_from',
  'entry_to',
  'installment_from',
  'installment_to',
]);
const AREA_FIELDS = new Set(['area_min_sqm', 'area_max_sqm']);
const DATE_FIELDS = new Set(['expected_delivery_date', 'valid_until']);
const RANGE_PAIRS: Record<string, string> = {
  area_min_sqm: 'area_max_sqm',
  price_from: 'price_to',
  entry_from: 'entry_to',
  installment_from: 'installment_to',
};

export function canonicalizeAnalysis(
  items: ProposedItem[],
  existingIssues: AnalysisResult['issues']
): Pick<AnalysisResult, 'items' | 'issues'> {
  const issues = [...existingIssues];
  const normalizedItems = items.flatMap((item, itemIndex) => {
    const fields = canonicalFields(item, itemIndex, issues);
    const fieldValues = Object.fromEntries(
      fields.map((field) => [field.name, field.value])
    );
    const displayName =
      textValue(fieldValues.name) ||
      textValue(fieldValues.label) ||
      cleanText(item.displayName);
    if (!displayName || displayName === 'Item sem nome') {
      issues.push({
        type: 'missing',
        severity: 'blocking',
        code: 'missing_item_name',
        message: `Item ${itemIndex + 1} sem nome identificável.`,
      });
      return [];
    }

    if (
      item.type === 'offer' &&
      positiveNumber(fieldValues.area_min_sqm) == null
    ) {
      issues.push({
        type: 'missing',
        severity: 'blocking',
        code: 'offer_without_area',
        message: `A opção “${displayName}” não possui metragem mínima confiável.`,
      });
    }
    validateRanges(displayName, fieldValues, issues);
    validatePlausibility(displayName, fieldValues, issues);

    const normalizedKey =
      item.type === 'development'
        ? developmentKey(fieldValues, displayName)
        : offerKey(fieldValues, displayName);
    return [
      {
        ...item,
        displayName,
        normalizedKey,
        confidence: clamp(
          Math.min(item.confidence, ...fields.map((field) => field.confidence))
        ),
        fields,
      },
    ];
  });

  return {
    items: consolidateItems(normalizedItems, issues),
    issues: deduplicateIssues(issues),
  };
}

function consolidateItems(
  items: ProposedItem[],
  issues: AnalysisResult['issues']
) {
  const consolidated: ProposedItem[] = [];
  const newIndexByOldIndex = new Map<number, number>();
  const indexByKey = new Map<string, number>();

  for (let oldIndex = 0; oldIndex < items.length; oldIndex++) {
    const source = items[oldIndex];
    const parentIndex =
      source.parentIndex == null
        ? null
        : (newIndexByOldIndex.get(source.parentIndex) ?? null);
    const parent =
      parentIndex == null ? null : (consolidated[parentIndex] ?? null);
    const normalizedKey =
      source.type === 'offer' && parent?.type === 'development'
        ? `${parent.normalizedKey}|${source.normalizedKey}`
        : source.normalizedKey;
    const item = { ...source, parentIndex, normalizedKey };
    const key =
      item.type === 'offer' && parent == null
        ? `${item.type}:${normalizedKey}:orphan:${oldIndex}`
        : `${item.type}:${normalizedKey}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex == null) {
      const nextIndex = consolidated.length;
      consolidated.push(item);
      indexByKey.set(key, nextIndex);
      newIndexByOldIndex.set(oldIndex, nextIndex);
      continue;
    }

    const existing = consolidated[existingIndex];
    consolidated[existingIndex] = {
      ...existing,
      confidence: Math.max(existing.confidence, item.confidence),
      fields: mergeCanonicalFields(existing, item, issues),
    };
    newIndexByOldIndex.set(oldIndex, existingIndex);
  }
  return consolidated;
}

function mergeCanonicalFields(
  existing: ProposedItem,
  incoming: ProposedItem,
  issues: AnalysisResult['issues']
) {
  const merged = new Map(existing.fields.map((field) => [field.name, field]));
  for (const field of incoming.fields) {
    const current = merged.get(field.name);
    if (!current) {
      merged.set(field.name, field);
      continue;
    }
    if (stableValue(current.value) !== stableValue(field.value)) {
      issues.push({
        type: 'conflict',
        severity: 'warning',
        code: 'conflicting_sources',
        message: `Fontes diferentes apresentam valores distintos para “${field.name}” em “${existing.displayName}”.`,
      });
    }
    if (field.confidence > current.confidence) merged.set(field.name, field);
  }
  return [...merged.values()];
}

function canonicalFields(
  item: ProposedItem,
  itemIndex: number,
  issues: AnalysisResult['issues']
) {
  const byName = new Map<string, ProposedField>();
  for (const field of item.fields) {
    const alias = normalizeToken(field.name);
    const name = FIELD_ALIASES[alias];
    if (!name) {
      issues.push({
        type: 'missing',
        severity: 'info',
        code: 'unknown_field_ignored',
        message: `Campo “${field.name}” do item ${itemIndex + 1} não faz parte do modelo canônico.`,
      });
      continue;
    }
    const range = RANGE_PAIRS[name] ? parseLocalizedRange(field.value) : null;
    const candidates = range
      ? [
          { name, value: range[0] },
          { name: RANGE_PAIRS[name], value: range[1] },
        ]
      : [{ name, value: canonicalValue(name, field.value) }];
    for (const candidate of candidates) {
      const normalized = {
        ...field,
        name: candidate.name,
        value: candidate.value,
        confidence: clamp(field.confidence),
      };
      if (normalized.value == null || normalized.value === '') continue;
      const existing = byName.get(candidate.name);
      if (!existing) {
        byName.set(candidate.name, normalized);
        continue;
      }
      if (stableValue(existing.value) !== stableValue(normalized.value)) {
        issues.push({
          type: 'conflict',
          severity: 'warning',
          code: 'conflicting_field_in_item',
          message: `O campo “${candidate.name}” aparece com valores diferentes em “${item.displayName}”.`,
        });
      }
      if (normalized.confidence > existing.confidence)
        byName.set(candidate.name, normalized);
    }
  }
  return [...byName.values()];
}

function canonicalValue(name: string, value: unknown) {
  if (MONEY_FIELDS.has(name)) return parseLocalizedNumber(value);
  if (AREA_FIELDS.has(name)) return parseLocalizedNumber(value);
  if (DATE_FIELDS.has(name)) return parseDate(value);
  if (name === 'property_timing') return propertyTiming(value);
  if (name === 'is_active') return booleanValue(value);
  if (name === 'highlights') return stringList(value);
  if (name === 'address') return addressValue(value);
  if (name === 'media_candidates') return Array.isArray(value) ? value : [];
  return cleanText(value);
}

export function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const token = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const multiplier = /\bmilh(?:ao|oes)\b/i.test(token)
    ? 1_000_000
    : /\bmil\b/i.test(token)
      ? 1_000
      : 1;
  let text = value
    .replace(/\s*(?:m²|m2|metros?\s+quadrados?)/gi, '')
    .normalize('NFKC')
    .replace(/[^\d,.\-]/g, '')
    .trim();
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
  else if (dot > comma && comma >= 0) text = text.replace(/,/g, '');
  else if (comma >= 0) {
    const decimals = text.length - comma - 1;
    text = decimals === 3 ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (dot >= 0) {
    const groups = text.split('.');
    const looksLikeThousands =
      groups.length > 2 ||
      (groups.length === 2 && groups[1].length === 3 && groups[0].length <= 3);
    if (looksLikeThousands) text = groups.join('');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number * multiplier : null;
}

export function parseLocalizedRange(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(/\s+(?:a|até|ate|[-–—])\s+/i);
  if (parts.length !== 2) return null;
  const minimum = parseLocalizedNumber(parts[0]);
  const maximum = parseLocalizedNumber(parts[1]);
  return minimum != null && maximum != null ? [minimum, maximum] : null;
}

export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = cleanText(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso && validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])))
    return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br && validDate(Number(br[3]), Number(br[2]), Number(br[1])))
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const monthYear = normalizeToken(text).match(
    /^(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[ _-]+(\d{4})$/
  );
  if (monthYear) {
    const months = [
      'janeiro',
      'fevereiro',
      'marco',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ];
    return `${monthYear[2]}-${String(months.indexOf(monthYear[1]) + 1).padStart(2, '0')}-01`;
  }
  return null;
}

function propertyTiming(value: unknown) {
  const normalized = normalizeToken(String(value ?? ''));
  if (/\b(pronto|entregue|ready)\b/.test(normalized)) return 'ready';
  if (/\b(ambos|pronto_e_planta|both)\b/.test(normalized)) return 'both';
  return 'off_plan';
}

function addressValue(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const aliases: Record<string, string> = {
      logradouro: 'street',
      rua: 'street',
      endereco: 'street',
      street: 'street',
      numero: 'number',
      number: 'number',
      bairro: 'neighborhood',
      neighborhood: 'neighborhood',
      cidade: 'city',
      municipio: 'city',
      city: 'city',
      estado: 'state',
      uf: 'state',
      state: 'state',
      cep: 'postal_code',
      postal_code: 'postal_code',
    };
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [
          aliases[normalizeToken(key)] ?? normalizeToken(key),
          cleanText(entry),
        ])
        .filter(([, entry]) => Boolean(entry))
    );
  }
  const street = cleanText(value);
  return street ? { street } : null;
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  return !/\b(nao|inativo|indisponivel|vendido|false|0)\b/.test(
    normalizeToken(String(value ?? ''))
  );
}

function stringList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,;\n]/);
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, 30);
}

function validateRanges(
  displayName: string,
  fields: Record<string, unknown>,
  issues: AnalysisResult['issues']
) {
  for (const [from, to, label] of [
    ['area_min_sqm', 'area_max_sqm', 'metragem'],
    ['price_from', 'price_to', 'preço'],
    ['entry_from', 'entry_to', 'entrada'],
    ['installment_from', 'installment_to', 'parcela'],
  ]) {
    const minimum = positiveNumber(fields[from]);
    const maximum = positiveNumber(fields[to]);
    if (minimum != null && maximum != null && minimum > maximum) {
      issues.push({
        type: 'conflict',
        severity: 'blocking',
        code: `invalid_${from}_${to}`,
        message: `A faixa de ${label} de “${displayName}” está invertida.`,
      });
    }
  }
}

function validatePlausibility(
  displayName: string,
  fields: Record<string, unknown>,
  issues: AnalysisResult['issues']
) {
  const area = positiveNumber(fields.area_min_sqm);
  const price = positiveNumber(fields.price_from);
  if (area != null && (area < 8 || area > 2_000)) {
    issues.push({
      type: 'low_confidence',
      severity: 'warning',
      code: 'implausible_area',
      message: `A metragem de “${displayName}” (${area} m²) precisa de revisão.`,
    });
  }
  if (price != null && price < 50_000) {
    issues.push({
      type: 'low_confidence',
      severity: 'warning',
      code: 'implausible_price',
      message: `O preço de “${displayName}” parece baixo para um imóvel e pode ser entrada ou parcela.`,
    });
  }
}

function deduplicateIssues(issues: AnalysisResult['issues']) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function developmentKey(fields: Record<string, unknown>, fallback: string) {
  const developer = textValue(fields.developer_name);
  const name = textValue(fields.name) || fallback;
  const address =
    fields.address && typeof fields.address === 'object'
      ? textValue((fields.address as Record<string, unknown>).street)
      : '';
  return [developer, name, address]
    .map(normalizeToken)
    .filter(Boolean)
    .join('|');
}

function offerKey(fields: Record<string, unknown>, fallback: string) {
  return [
    textValue(fields.label) || fallback,
    positiveNumber(fields.area_min_sqm),
    positiveNumber(fields.area_max_sqm),
  ]
    .map((value) => normalizeToken(String(value ?? '')))
    .filter(Boolean)
    .join('|');
}

export function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/m²/g, 'm2')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanText(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 2_000)
    : value == null
      ? ''
      : String(value).trim().slice(0, 2_000);
}

function textValue(value: unknown) {
  return typeof value === 'string' ? cleanText(value) : '';
}

function positiveNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function stableValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return JSON.stringify(value);
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    )
  );
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
