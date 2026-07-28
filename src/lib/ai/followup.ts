import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConversationContext } from './context';
import { loadAiConfig } from './config';
import { buildSystemPrompt } from './defaults';
import { generateReply } from './generate';
import { loadTrustedGuidance } from './guidance';
import { enforceOutboundPolicy } from './response-policy';

const FALLBACK_MESSAGES = [
  'Oi! Conseguiu ver minha última mensagem?',
  'Se ainda fizer sentido pra você, posso retomar de onde a gente parou.',
  'Ainda posso te ajudar com isso? Se o momento mudou, fica à vontade pra me falar.',
  'Vou pausar por aqui pra não te incomodar. Quando quiser retomar, é só me chamar.',
];

export function fallbackFollowupMessage(stepNumber: number) {
  return FALLBACK_MESSAGES[
    Math.min(FALLBACK_MESSAGES.length - 1, Math.max(0, stepNumber - 1))
  ];
}

export async function generateContextualFollowup(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  stepNumber: number;
  totalSteps: number;
  leadSummary?: string | null;
}): Promise<string | null> {
  const messages = await buildConversationContext(args.db, args.conversationId);
  if (!messages.length) return fallbackFollowupMessage(args.stepNumber);

  // A due execution can race the webhook that cancels it. If a lead message
  // already became the newest turn, never send a proactive nudge on top of it.
  if (messages.at(-1)?.role === 'user') return null;

  const config = await loadAiConfig(args.db, args.accountId).catch((error) => {
    console.error(
      '[Studiosp/IA] configuração do follow-up indisponível:',
      error
    );
    return null;
  });
  if (!config || !config.autoReplyEnabled) {
    return fallbackFollowupMessage(args.stepNumber);
  }

  const isFinalStep = args.stepNumber >= args.totalSteps;
  const trustedGuidance = await loadTrustedGuidance({
    db: args.db,
    accountId: args.accountId,
    conversationId: args.conversationId,
  });
  const systemPrompt = buildSystemPrompt({
    internalPrompt: config.internalPrompt,
    communicationPrompt: config.communicationPrompt,
    identityName: config.identityName,
    toneConfig: config.toneConfig,
    mode: 'followup',
    operation: [
      `Esta é a tentativa ${args.stepNumber} de ${args.totalSteps}. O lead ainda não respondeu à última mensagem da assistente.`,
      isFinalStep
        ? 'Esta é a última tentativa. Avise com leveza que o atendimento será pausado e que o lead pode chamar quando quiser. Não pressione e não faça uma nova pergunta de qualificação.'
        : 'Faça um lembrete breve e contextual. Retome a intenção da última mensagem sem copiá-la palavra por palavra e sem trocar para uma pergunta diferente.',
      args.leadSummary
        ? `Resumo factual disponível no sistema: ${args.leadSummary.slice(0, 1000)}.`
        : 'Não há resumo adicional confiável disponível.',
      ...trustedGuidance,
    ],
  });

  try {
    const generated = await generateReply({
      config,
      systemPrompt,
      messages,
    });
    const text = generated.text.replace(/\s+/g, ' ').trim().slice(0, 1200);
    const { data: lead } = await args.db
      .from('conversations')
      .select('contacts(name)')
      .eq('account_id', args.accountId)
      .eq('id', args.conversationId)
      .maybeSingle();
    const contact = Array.isArray(lead?.contacts)
      ? lead.contacts[0]
      : lead?.contacts;
    const policy = enforceOutboundPolicy({
      text,
      latestLeadMessage:
        messages.findLast((message) => message.role === 'user')?.content ?? '',
      messages,
      leadName: contact?.name,
    });
    return !generated.handoff && !generated.needsGuidance && policy.ok
      ? policy.text
      : fallbackFollowupMessage(args.stepNumber);
  } catch (error) {
    console.error(
      '[Studiosp/IA] geração contextual de follow-up falhou:',
      error
    );
    return fallbackFollowupMessage(args.stepNumber);
  }
}
