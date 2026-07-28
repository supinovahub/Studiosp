import type { ChatMessage } from './types';
import type { AiConfig } from './types';
import { generateReply } from './generate';
import {
  SDR_INTENTS,
  type LeadStage,
  type LeadTemperature,
  type SdrClassification,
  type SdrIntent,
} from './sdr-types';

const STAGES: LeadStage[] = [
  'new',
  'discovering',
  'qualified',
  'visit_ready',
  'negotiating',
  'handoff',
  'lost',
];
const TEMPERATURES: LeadTemperature[] = ['cold', 'warm', 'hot'];

const CLASSIFIER_PROMPT = `Você é o classificador de um SDR imobiliário brasileiro.
Analise a conversa e devolva SOMENTE um objeto JSON válido, sem markdown.
Não invente preferências nem valores. Use null ou [] quando não houver evidência.

Formato obrigatório:
{"primary_intent":"other","intents":["other"],"lead_stage":"new","temperature":"cold","score":0,"budget_min":null,"budget_max":null,"preferred_cities":[],"preferred_neighborhoods":[],"property_types":[],"min_bedrooms":null,"min_area_m2":null,"needs_parking":null,"financing_interest":null,"purchase_timeframe":null,"wants_photos":false,"summary":"","next_best_action":"","confidence":0,"requires_handoff":false}

Intenções permitidas: ${SDR_INTENTS.join(', ')}.
Score: 0-100. Aumente com orçamento, prazo, região, produto de interesse, pedido de visita e intenção concreta.
Handoff obrigatório para reclamação, pedido explícito de humano, negociação sensível ou quando não for seguro responder.`;

export function emptySdrClassification(): SdrClassification {
  return {
    primaryIntent: 'other', intents: ['other'], leadStage: 'new',
    temperature: 'cold', score: 0, budgetMin: null, budgetMax: null,
    preferredCities: [], preferredNeighborhoods: [], propertyTypes: [],
    minBedrooms: null, minAreaM2: null, needsParking: null,
    financingInterest: null, purchaseTimeframe: null, wantsPhotos: false,
    summary: '', nextBestAction: '', confidence: 0, requiresHandoff: false,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function clamp(value: unknown, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

export function parseSdrClassification(raw: string): SdrClassification {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    value = {};
  }

  const rawIntents = stringArray(value.intents).filter(
    (intent): intent is SdrIntent =>
      (SDR_INTENTS as readonly string[]).includes(intent)
  );
  const primaryIntent = (
    (SDR_INTENTS as readonly string[]).includes(String(value.primary_intent))
      ? value.primary_intent
      : rawIntents[0] ?? 'other'
  ) as SdrIntent;
  const leadStage = STAGES.includes(value.lead_stage as LeadStage)
    ? (value.lead_stage as LeadStage)
    : 'new';
  const temperature = TEMPERATURES.includes(
    value.temperature as LeadTemperature
  )
    ? (value.temperature as LeadTemperature)
    : 'cold';

  return {
    primaryIntent,
    intents: rawIntents.length > 0 ? rawIntents : [primaryIntent],
    leadStage,
    temperature,
    score: Math.round(clamp(value.score, 0, 100)),
    budgetMin: nullableNumber(value.budget_min),
    budgetMax: nullableNumber(value.budget_max),
    preferredCities: stringArray(value.preferred_cities),
    preferredNeighborhoods: stringArray(value.preferred_neighborhoods),
    propertyTypes: stringArray(value.property_types),
    minBedrooms: nullableNumber(value.min_bedrooms),
    minAreaM2: nullableNumber(value.min_area_m2),
    needsParking: nullableBoolean(value.needs_parking),
    financingInterest: nullableBoolean(value.financing_interest),
    purchaseTimeframe:
      typeof value.purchase_timeframe === 'string'
        ? value.purchase_timeframe.trim().slice(0, 160) || null
        : null,
    wantsPhotos: value.wants_photos === true || primaryIntent === 'photos',
    summary:
      typeof value.summary === 'string' ? value.summary.trim().slice(0, 1000) : '',
    nextBestAction:
      typeof value.next_best_action === 'string'
        ? value.next_best_action.trim().slice(0, 500)
        : '',
    confidence: clamp(value.confidence, 0, 1),
    requiresHandoff:
      value.requires_handoff === true ||
      ['human_handoff', 'complaint'].includes(primaryIntent),
  };
}

export async function classifySdrTurn(args: {
  config: AiConfig;
  messages: ChatMessage[];
}): Promise<SdrClassification> {
  const result = await generateReply({
    config: args.config,
    systemPrompt: CLASSIFIER_PROMPT,
    messages: args.messages,
  });
  return parseSdrClassification(result.text);
}
