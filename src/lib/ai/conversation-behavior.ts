import type { ChatMessage } from './types';
import { deterministicPropertyTimingValue } from './deterministic-qualification';

type Row = Record<string, unknown>;

const QUESTION_PATTERNS: Array<[string, RegExp]> = [
  [
    'total_price_budget',
    /\b(pre[cç]o|valor|or[cç]amento)\s+(?:de\s+)?(?:compra\s+)?total\b|\bvalor\s+do\s+(?:im[oó]vel|apartamento|studio)\b|\b(?:quanto|valor).{0,30}\binvestir\b/i,
  ],
  [
    'monthly_installment_budget',
    /\b(parcela|mensalidade|por\s+m[eê]s|mensal)\b/i,
  ],
  ['entry_budget', /\b(entrada|sinal|valor\s+inicial)\b/i],
  [
    'purchase_objective',
    /\b(morar|moradia|investir|investimento|objetivo\s+da\s+compra|uso\s+pr[oó]prio)\b/i,
  ],
  [
    'preferred_locations',
    /\b(bairro|regi[aã]o|localiza[cç][aã]o|onde\s+(?:voc[eê]\s+)?(?:quer|prefere|busca))\b/i,
  ],
  [
    'property_timing',
    /\b(na\s+planta|lan[cç]amento|pronto(?:\s+para\s+morar)?|em\s+constru[cç][aã]o)\b/i,
  ],
  [
    'purchase_urgency',
    /\b(urg[eê]ncia|prazo|pressa|quando\s+(?:quer|pretende)|quanto\s+tempo)\b/i,
  ],
  [
    'schedule_preference',
    /\b(agenda|agendar|hor[aá]rio|disponibilidade|dia\s+e\s+per[ií]odo)\b/i,
  ],
];

const QUESTION_FIELD_PATTERNS: Record<string, RegExp> =
  Object.fromEntries(QUESTION_PATTERNS);

const FINANCIAL_KEYS = new Set([
  'entry_budget',
  'monthly_installment_budget',
  'total_price_budget',
]);

const CONTEXT_DEPENDENT_SHORT_REPLY =
  /^(?:sim|s|n[aã]o|n|isso|exato|correto|continua|ainda|n[aã]o sei|sei n[aã]o|talvez|mais ou menos|depende|acho que sim|n[aã]o tenho certeza|tanto faz|qualquer um|um e meio|dois|tr[eê]s|quatro|cinco)$/i;

const UNKNOWN_REPLY =
  /^(?:n[aã]o sei(?: ainda)?|sei n[aã]o|ainda n[aã]o sei|n[aã]o tenho (?:ideia|prefer[eê]ncia)|sem prefer[eê]ncia|qualquer (?:bairro|regi[aã]o|lugar)|tanto faz)$/i;

const NEGATIVE_REPLY =
  /^(?:n[aã]o|n|nenhum|nenhuma|ainda n[aã]o|n[aã]o tenho)$/i;

export interface ConversationTurn {
  latestUserMessage: string;
  previousAssistantMessage: string;
  expectedQuestionKey: string | null;
  expectedResponseKind: 'reactivation_interest' | 'schedule_preference' | null;
}

export type LeadPosture =
  | 'neutral'
  | 'ambivalent'
  | 'reactivation_hesitation'
  | 'confused'
  | 'frustrated'
  | 'playful';

export function normalizeConversationText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function inferExpectedQuestionKey(
  assistantMessage: string,
  questions: Row[] = []
): string | null {
  for (const [key, pattern] of QUESTION_PATTERNS) {
    if (pattern.test(assistantMessage)) return key;
  }

  const normalizedAssistant = normalizeConversationText(assistantMessage);
  let best: { key: string; score: number } | null = null;
  for (const question of questions) {
    const key = String(question.key ?? '');
    const source = `${question.label ?? ''} ${question.prompt_instruction ?? ''}`;
    const meaningfulTokens = normalizeConversationText(source)
      .split(' ')
      .filter((token) => token.length >= 5);
    const score = meaningfulTokens.filter((token) =>
      normalizedAssistant.includes(token)
    ).length;
    if (key && score >= 2 && (!best || score > best.score)) {
      best = { key, score };
    }
  }
  return best?.key ?? null;
}

export function conversationTurn(
  messages: ChatMessage[],
  questions: Row[] = [],
  trustedExpectedQuestionKey?: string | null,
  trustedExpectedResponseKind?:
    'reactivation_interest' | 'schedule_preference' | null
): ConversationTurn {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user'
  );
  const latestUserMessage = latestUserTurn(messages);
  let previousAssistantMessage = '';
  for (let index = latestUserIndex - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') {
      previousAssistantMessage = messages[index].content.trim();
      break;
    }
  }
  return {
    latestUserMessage,
    previousAssistantMessage,
    expectedQuestionKey:
      trustedExpectedQuestionKey ??
      inferExpectedQuestionKey(previousAssistantMessage, questions),
    expectedResponseKind: trustedExpectedResponseKind ?? null,
  };
}

export function latestUserTurn(messages: ChatMessage[]) {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user'
  );
  if (latestUserIndex < 0) return '';
  let firstUserIndex = latestUserIndex;
  while (firstUserIndex > 0 && messages[firstUserIndex - 1].role === 'user') {
    firstUserIndex--;
  }
  return messages
    .slice(firstUserIndex, latestUserIndex + 1)
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n');
}

export function isolateLatestTurnForModel(messages: ChatMessage[]) {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user'
  );
  if (latestUserIndex < 0) return [];
  let previousAssistantIndex = -1;
  for (let index = latestUserIndex - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') {
      previousAssistantIndex = index;
      break;
    }
  }
  const isolated: ChatMessage[] = [];
  if (previousAssistantIndex >= 0) {
    isolated.push(messages[previousAssistantIndex]);
  }
  isolated.push({ role: 'user', content: latestUserTurn(messages) });
  return isolated;
}

export function classifyLeadPosture(args: {
  latestUserMessage: string;
  previousAssistantMessage: string;
  expectedQuestionKey: string | null;
  expectedResponseKind?: 'reactivation_interest' | 'schedule_preference' | null;
  isReactivation: boolean;
}): LeadPosture {
  const latest = normalizeConversationText(args.latestUserMessage);
  if (/^\s*(?:\?+|🤔+)\s*$/u.test(args.latestUserMessage)) {
    return 'confused';
  }
  if (
    /\b(nao entendi|nao ficou claro|como assim|que voce quer dizer|explica melhor|nao entendi nada)\b/.test(
      latest
    )
  ) {
    return 'confused';
  }
  if (
    /\b(ja falei|ja respondi|de novo|voce perguntou isso|nao leu|presta atencao|uai)\b/.test(
      latest
    )
  ) {
    return 'frustrated';
  }
  if (
    args.isReactivation &&
    (args.expectedResponseKind === 'reactivation_interest' ||
      !args.expectedQuestionKey) &&
    /\b(nao sei|talvez|mais ou menos|depende|acho que sim|mais pra sim|mais pra nao|estou em duvida|to em duvida|nao tenho certeza|repensando)\b/.test(
      latest
    )
  ) {
    return 'reactivation_hesitation';
  }
  if (
    args.expectedQuestionKey &&
    /^(?:mais ou menos|depende|talvez|acho que sim|n[aã]o tenho certeza|mais pra sim|mais pra n[aã]o)\b/.test(
      latest
    )
  ) {
    return 'ambivalent';
  }
  if (/\b(kk+k|rsrs+|haha+|hehe+)\b|[😂🤣]/i.test(args.latestUserMessage)) {
    return 'playful';
  }
  return 'neutral';
}

export function isExplicitReactivationAffirmation(value: string) {
  const normalized = normalizeConversationText(value);
  return (
    /^(?:sim|s|ainda|claro|com certeza|correto|isso mesmo)(?:[,.! ]+(?:pode sim|vamos sim|ta|esta correto))?[.! ]*$/.test(
      normalized
    ) ||
    /^(?:sim|isso mesmo)[,.! ]+(?:ta|esta) correto[.! ]*$/.test(normalized) ||
    /\b(?:ainda (?:estou|to|quero|pretendo|tenho interesse)|continuo (?:interessado|interessada|avaliando|pesquisando)|quero (?:continuar|retomar|comprar)|vamos (?:continuar|retomar)|podemos (?:continuar|retomar)|faz sentido retomar|continua de pe)\b/.test(
      normalized
    )
  );
}

export function deterministicPostureReply(args: {
  posture: LeadPosture;
  isReactivation: boolean;
  expectedResponseKind?: 'reactivation_interest' | 'schedule_preference' | null;
  expectedQuestionKey?: string | null;
}) {
  if (args.posture === 'reactivation_hesitation') {
    return 'Entendi. O que está pesando mais nessa dúvida hoje: o momento da compra ou as condições?';
  }
  if (
    args.posture === 'confused' &&
    args.isReactivation &&
    args.expectedResponseKind === 'reactivation_interest' &&
    !args.expectedQuestionKey
  ) {
    return 'Quis saber se essa compra ainda está nos seus planos ou se o cenário mudou desde a nossa última conversa. O que não ficou claro?';
  }
  if (
    args.posture === 'confused' &&
    args.expectedQuestionKey === 'property_timing'
  ) {
    return 'Quero entender se você prefere um imóvel pronto para usar mais rápido, na planta para ter mais prazo de pagamento, ou se tanto faz. Qual opção combina mais com você?';
  }
  return null;
}

export function postureInstruction(posture: LeadPosture): string | null {
  switch (posture) {
    case 'ambivalent':
      return 'A resposta foi parcial ou ambivalente. Acolha isso em poucas palavras e esclareça o mesmo assunto com uma pergunta simples. Não registre certeza, não presuma o motivo e não avance para outro campo da qualificação neste turno.';
    case 'reactivation_hesitation':
      return 'O lead demonstrou dúvida sobre continuar a compra após uma reativação. Não inicie a qualificação neste turno. Acolha sem pressionar e faça uma pergunta aberta e simples para entender o que mudou ou o que está gerando a dúvida.';
    case 'confused':
      return 'O lead não entendeu a mensagem anterior. Primeiro explique a intenção daquela pergunta com palavras simples e um exemplo curto, sem tratar o exemplo como resposta do lead. Não avance para outra pergunta neste turno.';
    case 'frustrated':
      return 'O lead sinalizou repetição ou impaciência. Reconheça isso brevemente, mostre que considerou o que ele já disse e não repita a mesma pergunta. Frustração leve não exige transferência para humano.';
    case 'playful':
      return 'O lead está usando um tom leve. Você pode acompanhar esse clima com moderação, sem perder clareza nem forçar gírias.';
    default:
      return null;
  }
}

export function isExplicitUnknownReply(value: string) {
  const normalized = normalizeConversationText(value);
  return (
    UNKNOWN_REPLY.test(value.trim()) ||
    /^(?:nao sei|ainda nao sei)\b/.test(normalized) ||
    /^(?:nao conheco (?:nada|muito)|conheco nada)\b/.test(normalized)
  );
}

export function isSoftConversationFriction(value: string) {
  const normalized = normalizeConversationText(value);
  return /\b(nao entendi|como assim|ja falei|ja respondi|de novo|uai|po)\b/.test(
    normalized
  );
}

export function isQualificationCandidateGrounded(args: {
  candidate: Row;
  question: Row;
  latestUserMessage: string;
  expectedQuestionKey: string | null;
  currentAnswer?: Row;
}) {
  const questionKey = String(args.question.key ?? '');
  const latest = normalizeConversationText(args.latestUserMessage);
  const raw = normalizeConversationText(args.candidate.raw_text);
  if (!latest || !raw) return false;
  if (!latest.includes(raw) && !raw.includes(latest)) return false;

  if (
    CONTEXT_DEPENDENT_SHORT_REPLY.test(args.latestUserMessage.trim()) &&
    args.expectedQuestionKey !== questionKey
  ) {
    return false;
  }

  if (
    args.expectedQuestionKey &&
    args.expectedQuestionKey !== questionKey &&
    !QUESTION_FIELD_PATTERNS[questionKey]?.test(args.latestUserMessage)
  ) {
    return false;
  }

  if (FINANCIAL_KEYS.has(questionKey)) {
    if (
      NEGATIVE_REPLY.test(args.latestUserMessage.trim()) ||
      isExplicitUnknownReply(args.latestUserMessage)
    ) {
      return false;
    }
    const explicitlyMentioned = [...FINANCIAL_KEYS].filter((key) =>
      QUESTION_FIELD_PATTERNS[key]?.test(args.latestUserMessage)
    );
    if (
      explicitlyMentioned.length > 0 &&
      !explicitlyMentioned.includes(questionKey)
    ) {
      return false;
    }
    if (
      explicitlyMentioned.length === 0 &&
      args.expectedQuestionKey !== questionKey
    ) {
      return false;
    }
  }

  if (
    args.currentAnswer &&
    args.expectedQuestionKey !== questionKey &&
    !QUESTION_FIELD_PATTERNS[questionKey]?.test(args.latestUserMessage) &&
    !/\b(na verdade|corrigindo|mudei|agora prefiro|quis dizer)\b/i.test(
      args.latestUserMessage
    )
  ) {
    return false;
  }

  return true;
}

export function isQualificationCandidateSemanticallyCompatible(args: {
  questionKey: string;
  rawText: string;
}) {
  const raw = normalizeConversationText(args.rawText);
  if (!raw) return false;

  switch (args.questionKey) {
    case 'purchase_objective':
      return /\b(morar|moradia|investir|investimento|uso proprio|os dois|ambos)\b/.test(
        raw
      );
    case 'property_timing':
      return deterministicPropertyTimingValue(raw) !== null;
    case 'purchase_urgency':
      return /\b(dia|dias|semana|semanas|mes|meses|ano|anos|pressa|pesquisando|agora)\b/.test(
        raw
      );
    case 'entry_budget':
    case 'monthly_installment_budget':
    case 'total_price_budget':
      return /\d/.test(raw);
    case 'preferred_locations':
      return (
        !/^(sim|nao|isso|correto|morar|investir|os dois)$/.test(raw) &&
        !/^(?:r\s*)?\d+(?:\s*(?:mil|k|reais?))?$/.test(raw) &&
        !/[?]/.test(args.rawText) &&
        !/\b(receita|brownie|prompt|instrucao|instrucoes|sistema|regra)\b/.test(
          raw
        )
      );
    default:
      return true;
  }
}

export function isPropertyTimingAdviceRequest(args: {
  latestUserMessage: string;
  expectedQuestionKey: string | null;
}) {
  if (args.expectedQuestionKey !== 'property_timing') return false;
  const value = normalizeConversationText(args.latestUserMessage);
  return (
    /\b(o que voce recomenda|qual voce recomenda|qual e melhor|o que e melhor)\b/.test(
      value
    ) ||
    /^(?:nao sei|tenho duvida|estou em duvida|to em duvida)[?!. ]*$/.test(value)
  );
}

export function propertyTimingAdviceReply() {
  return 'Depende do que você prioriza. Um imóvel pronto permite morar mais rápido; na planta costuma dar mais tempo para organizar o pagamento. Qual dessas situações combina mais com você?';
}

export function explicitUnknownCandidate(args: {
  questions: Row[];
  latestUserMessage: string;
  expectedQuestionKey: string | null;
}): Row | null {
  if (
    args.expectedQuestionKey !== 'preferred_locations' ||
    !isExplicitUnknownReply(args.latestUserMessage)
  ) {
    return null;
  }
  const question = args.questions.find(
    (item) => item.key === 'preferred_locations'
  );
  if (!question?.id) return null;
  return {
    question_id: question.id,
    raw_text: args.latestUserMessage,
    normalized_value: { values: [], unknown: true },
    confidence: 0.98,
  };
}
