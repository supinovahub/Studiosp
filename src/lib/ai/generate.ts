import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types';
import {
  HANDOFF_SENTINEL,
  NEEDS_GUIDANCE_SENTINEL,
  aiRequestTimeoutMs,
} from './defaults';
import { generateOpenAi } from './providers/openai';
import { generateAnthropic } from './providers/anthropic';

export interface GenerateArgs {
  config: AiConfig;
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string;
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[];
  /** Override for workflows that need structured, longer output. */
  maxOutputTokens?: number;
  /** Ask providers that support it to enforce a JSON object response. */
  jsonMode?: boolean;
  /** Workflow-specific provider timeout; ordinary replies keep the global cap. */
  requestTimeoutMs?: number;
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(
  args: GenerateArgs
): Promise<GenerateResult> {
  const { config, systemPrompt, messages } = args;
  const timeoutMs = args.requestTimeoutMs ?? aiRequestTimeoutMs();
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
    maxOutputTokens: args.maxOutputTokens,
    jsonMode: args.jsonMode,
  };

  let result: { text: string; usage: AiUsage | null };
  switch (config.provider) {
    case 'openai':
      result = await generateOpenAi(providerArgs);
      break;
    case 'anthropic':
      result = await generateAnthropic(providerArgs);
      break;
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      });
  }

  return parseGeneration(result.text, result.usage);
}

/**
 * Retry transient OpenAI failures with a smaller fallback model. This stays
 * inside one durable job, before any outbound side effect, so it cannot create
 * duplicate WhatsApp messages.
 */
export async function generateReplyWithFallback(
  args: GenerateArgs
): Promise<GenerateResult> {
  try {
    return await generateReply(args);
  } catch (error) {
    if (!isTransientAiError(error) || args.config.provider !== 'openai') {
      throw error;
    }
    const fallbackModel =
      process.env.AI_OPENAI_FALLBACK_MODEL?.trim() || 'gpt-4.1-nano';
    if (!fallbackModel || fallbackModel === args.config.model) throw error;
    console.warn(
      JSON.stringify({
        event: 'ai_provider_fallback_started',
        provider: 'openai',
        primary_model: args.config.model,
        fallback_model: fallbackModel,
        reason: error.code,
      })
    );
    return generateReply({
      ...args,
      config: { ...args.config, model: fallbackModel },
    });
  }
}

export function isTransientAiError(error: unknown): error is AiError {
  return (
    error instanceof AiError &&
    ['timeout', 'empty_response', 'rate_limited', 'network_error'].includes(
      error.code
    )
  );
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  raw: string,
  usage: AiUsage | null = null
): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL);
  const needsGuidance = raw.includes(NEEDS_GUIDANCE_SENTINEL);
  const text = raw
    .split(HANDOFF_SENTINEL)
    .join('')
    .split(NEEDS_GUIDANCE_SENTINEL)
    .join('')
    .trim();
  return { text, handoff, needsGuidance, usage };
}
