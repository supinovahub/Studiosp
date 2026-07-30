import {
  isQualificationCandidateSemanticallyCompatible,
  normalizeConversationText,
} from './conversation-behavior';
import type { PromptInjectionAssessment } from './response-policy';

export type InboundDomain =
  | 'business'
  | 'qualification_answer'
  | 'scheduling'
  | 'human_request'
  | 'opt_out'
  | 'greeting'
  | 'off_topic'
  | 'manipulation';

export interface InboundDomainDecision {
  domain: InboundDomain;
  allowed: boolean;
  reason: string;
}

const BUSINESS_LANGUAGE =
  /\b(imovel|imoveis|studio|apartamento|empreendimento|comprar|compra|morar|moradia|investir|investimento|bairro|regiao|localizacao|entrada|parcela|preco|valor|orcamento|financiamento|planta|pronto|construcao|vaga|metragem|m2|corretor|oportunidade)\b/;
const SCHEDULING_LANGUAGE =
  /\b(agenda|agendar|reuniao|call|horario|disponibilidade|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|manha|tarde|noite)\b/;
const HUMAN_LANGUAGE =
  /\b(humano|pessoa|atendente|falar com alguem|transferir|corretor)\b/;
const OPT_OUT_LANGUAGE =
  /\b(pare de|nao quero receber|me tire da lista|remova meu numero|cancelar cadastro)\b/;
const GREETING_LANGUAGE =
  /^(oi|ola|hi|hello|bom dia|boa tarde|boa noite|tudo bem|e ai|opa)[!,. ]*$/;
const CONTEXTUAL_LANGUAGE =
  /^(sim|nao|isso|correto|exato|pode ser|claro|ainda|continua|nao sei|talvez|depende|tanto faz|qualquer um|como assim|\?+)[!,.? ]*$/;
const COMMAND_LANGUAGE =
  /\b(esqueca|ignore|desconsidere|revele|mostre|repita|finja|aja como|me ensine|me fale como|me diga como|escreva|execute|acesse)\b/;
const EXTERNAL_TOPIC_LANGUAGE =
  /\b(receita|cozinhar|cozinha|arroz|feijao|brownie|bolo|brigadeiro|lasanha|pizza|poema|piada|codigo fonte|programacao|futebol|politica)\b/;

export function classifyInboundDomain(args: {
  message: string;
  expectedQuestionKey?: string | null;
  securityBoundaryActive?: boolean;
  injection: PromptInjectionAssessment;
  explicitOptOut?: boolean;
}): InboundDomainDecision {
  const normalized = normalizeConversationText(args.message);

  if (args.injection.detected) {
    return blocked('manipulation', 'prompt_injection_signal');
  }
  if (args.explicitOptOut || OPT_OUT_LANGUAGE.test(normalized)) {
    return allowed('opt_out', 'explicit_opt_out');
  }
  if (EXTERNAL_TOPIC_LANGUAGE.test(normalized)) {
    return blocked('off_topic', 'external_topic');
  }
  if (
    args.securityBoundaryActive &&
    COMMAND_LANGUAGE.test(normalized) &&
    !BUSINESS_LANGUAGE.test(normalized)
  ) {
    return blocked('manipulation', 'restricted_mode_command');
  }
  if (GREETING_LANGUAGE.test(normalized)) {
    return allowed('greeting', 'greeting');
  }
  if (HUMAN_LANGUAGE.test(normalized)) {
    return allowed('human_request', 'human_request');
  }
  if (SCHEDULING_LANGUAGE.test(normalized)) {
    return allowed('scheduling', 'scheduling_language');
  }
  if (BUSINESS_LANGUAGE.test(normalized)) {
    return allowed('business', 'business_language');
  }
  if (
    args.expectedQuestionKey &&
    isQualificationCandidateSemanticallyCompatible({
      questionKey: args.expectedQuestionKey,
      rawText: args.message,
    })
  ) {
    return allowed('qualification_answer', 'pending_question_compatible');
  }
  if (CONTEXTUAL_LANGUAGE.test(normalized)) {
    return allowed('qualification_answer', 'contextual_reply');
  }
  if (args.securityBoundaryActive) {
    return blocked('off_topic', 'restricted_mode_not_business');
  }

  // Fail closed for a message that has no relation to the commercial domain
  // and is not compatible with the server-owned pending question.
  return blocked('off_topic', 'domain_not_recognized');
}

function allowed(domain: InboundDomain, reason: string): InboundDomainDecision {
  return { domain, allowed: true, reason };
}

function blocked(
  domain: Extract<InboundDomain, 'off_topic' | 'manipulation'>,
  reason: string
): InboundDomainDecision {
  return { domain, allowed: false, reason };
}
