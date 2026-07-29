import type { ChatMessage } from './types';
import { normalizeConversationText } from './conversation-behavior';

const IDENTITY_QUESTION =
  /\b(quem (?:e|é) (?:voce|você)|quem (?:esta|está) falando|(?:voce|você) (?:e|é) (?:uma )?(?:ia|inteligencia artificial|inteligência artificial|robo|robô|bot|humano|humana|pessoa)|(?:e|é) atendimento automatico|(?:é|e) o pedro mesmo)\b/i;

const UNSAFE_IDENTITY_CLAIMS = [
  /\beu sou (?:humano|humana|uma pessoa)\b/i,
  /\bn[aã]o sou (?:rob[oô]|bot|ia|intelig[eê]ncia artificial)\b/i,
  /\bsou o pedro (?:de verdade|mesmo)\b/i,
];

const SECRET_LEAK_PATTERNS = [
  /\b(system prompt|prompt do sistema|instru[cç][oõ]es internas)\b/i,
  /\b(api[_ -]?key|service[_ -]?role|access[_ -]?token|bearer\s+[a-z0-9_-]+)\b/i,
  /\[\[(?:HANDOFF|NEEDS_GUIDANCE)\]\]/,
];

const PROMPT_INJECTION_SIGNALS: Array<[string, RegExp]> = [
  [
    'override_instructions',
    /\b(ignore|ignorar|desconsidere|esque[cç]a|anule).{0,45}\b(instru[cç][oõ]es|regras|prompt|mensagens anteriores|sistema)\b/i,
  ],
  [
    'role_override',
    /\b(agora|a partir de agora).{0,30}\b(voc[eê] (?:e|é|ser[aá])|aja como|finja ser|novo papel)\b/i,
  ],
  [
    'secret_exfiltration',
    /\b(revele|mostre|repita|imprima|copie).{0,45}\b(prompt|instru[cç][oõ]es internas|token|senha|chave|credencial)\b/i,
  ],
  [
    'cross_contact_data',
    /\b(outro (?:lead|cliente|contato)|outra conversa).{0,30}\b(mensagem|dados|telefone|hist[oó]rico)\b/i,
  ],
  [
    'control_token',
    /\[\[(?:HANDOFF|NEEDS_GUIDANCE)\]\]|(?:responda|retorne).{0,20}(?:handoff|needs_guidance)/i,
  ],
  [
    'tool_or_policy_override',
    /\b(chame|execute|use|acesse).{0,25}\b(api|ferramenta|banco|sistema|terminal)\b/i,
  ],
];

const EXPLICIT_OPT_OUT_PATTERNS = [
  /^(?:stop|sair|pare|parar)$/i,
  /\b(?:pare|para|parar|deixe)\s+de\s+(?:me\s+)?(?:mandar|enviar)\s+mensage(?:m|ns)\b/i,
  /\bn[aã]o\s+(?:quero|desejo)\s+mais\s+(?:receber|que\s+(?:me\s+)?(?:mande|envie))\s+mensage(?:m|ns)\b/i,
  /\b(?:me\s+)?(?:tire|retire|remova|exclua)(?:\s+(?:me|meu\s+(?:n[uú]mero|contato)|o\s+meu\s+contato))?\s+(?:da\s+(?:lista|base)|do\s+sistema)\b/i,
  /\b(?:remova|exclua)\s+(?:o\s+)?meu\s+(?:n[uú]mero|contato)\b/i,
  /\b(?:cancelar|cancele)\s+(?:minha\s+)?(?:inscri[cç][aã]o|cadastro)\b/i,
];

export const PEDRO_IDENTITY_REPLY =
  'Aqui é o Pedro. Trabalho com o mercado de imóveis em SP.';

export interface PromptInjectionAssessment {
  detected: boolean;
  severity: 'info' | 'warning';
  signals: string[];
}

export function assessPromptInjection(
  message: string
): PromptInjectionAssessment {
  const signals = PROMPT_INJECTION_SIGNALS.filter(([, pattern]) =>
    pattern.test(message)
  ).map(([signal]) => signal);
  return {
    detected: signals.length > 0,
    severity: signals.length >= 2 ? 'warning' : 'info',
    signals,
  };
}

const CLEARLY_OFF_TOPIC_PATTERNS = [
  /\b(receita|brownie|bolo|brigadeiro|lasanha|pizza)\b/i,
  /\b(escreva|conte|invente).{0,25}\b(poema|piada|hist[oó]ria)\b/i,
];

export function isClearlyOffTopicRequest(message: string) {
  return CLEARLY_OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(message));
}

export function securityBoundaryReply(nextQuestion?: string | null) {
  const redirect = 'Consigo te ajudar com a busca do imóvel.';
  return nextQuestion ? `${redirect} ${nextQuestion}` : redirect;
}

export function isIdentityQuestion(message: string) {
  return IDENTITY_QUESTION.test(message);
}

export function isExplicitOptOut(message: string) {
  const value = message.trim();
  return EXPLICIT_OPT_OUT_PATTERNS.some((pattern) => pattern.test(value));
}

export interface OutboundPolicyResult {
  ok: boolean;
  text: string;
  violations: string[];
}

export function enforceOutboundPolicy(args: {
  text: string;
  latestLeadMessage: string;
  messages: ChatMessage[];
  leadName?: string | null;
}): OutboundPolicyResult {
  if (isIdentityQuestion(args.latestLeadMessage)) {
    return { ok: true, text: PEDRO_IDENTITY_REPLY, violations: [] };
  }

  const violations: string[] = [];
  let text = args.text.trim();
  if (!text) violations.push('empty_response');
  if (UNSAFE_IDENTITY_CLAIMS.some((pattern) => pattern.test(text))) {
    violations.push('identity_claim');
  }
  if (SECRET_LEAK_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push('internal_data_leak');
  }
  if (questionCount(text) > 1) violations.push('multiple_questions');

  text = removeRepeatedLeadName({
    text,
    leadName: args.leadName,
    messages: args.messages,
  });
  return { ok: violations.length === 0, text, violations };
}

export function questionCount(value: string) {
  const explicit = value.match(/\?/g)?.length ?? 0;
  if (explicit > 0) return explicit;
  const normalized = normalizeConversationText(value);
  const interrogatives =
    normalized.match(
      /\b(qual|quais|quanto|quantos|quando|onde|como|porque|por que|prefere|consegue|pode me dizer|faz sentido)\b/g
    ) ?? [];
  return Math.min(interrogatives.length, 2);
}

/**
 * A second model pass is unnecessary when the only defect is two questions.
 * Keep the conversational setup and the first complete question, which is the
 * next decision the lead can actually answer.
 */
export function keepFirstQuestion(value: string) {
  const text = value.trim();
  const firstQuestionEnd = text.indexOf('?');
  if (firstQuestionEnd < 0) return text;
  return text.slice(0, firstQuestionEnd + 1).trim();
}

export function removeRepeatedLeadName(args: {
  text: string;
  leadName?: string | null;
  messages: ChatMessage[];
}) {
  const firstName = String(args.leadName ?? '')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}'-]/gu, '');
  if (!firstName || firstName.length < 2) return args.text;
  const recentAssistantText = args.messages
    .filter((message) => message.role === 'assistant')
    .slice(-4)
    .map((message) => normalizeConversationText(message.content))
    .join(' ');
  if (!recentAssistantText.includes(normalizeConversationText(firstName))) {
    return args.text;
  }
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return args.text
    .replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*([.!?])/g, '$2')
    .replace(/([,;:])\s*([,;:])/g, '$1')
    .replace(/^[,!.:;\s-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^([a-záàâãéêíóôõúç])/, (letter) =>
      letter.toLocaleUpperCase('pt-BR')
    );
}

export function delayedResumePrefix(waitedMs: number) {
  const minutes = waitedMs / 60_000;
  if (minutes <= 20) return '';
  if (minutes <= 180)
    return 'Desculpa a demora, eu estava resolvendo outra demanda por aqui.';
  if (minutes <= 1_440)
    return 'Desculpa a demora, o dia ficou corrido por aqui.';
  if (minutes <= 4_320)
    return 'Demorei porque precisei confirmar essa informação antes de te responder.';
  return 'Desculpa ter sumido, eu estava organizando as informações para te responder direito.';
}

export function joinResumePrefix(prefix: string, reply: string) {
  if (!prefix) return reply.trim();
  const normalizedReply = reply.trim();
  if (!normalizedReply) return prefix;
  return `${prefix}\n\n${normalizedReply}`;
}
