import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import type { AiConfig } from './types';

interface AiConfigRow {
  provider: 'openai' | 'anthropic';
  model: string;
  api_key: string;
  system_prompt: string | null;
  communication_prompt: string | null;
  is_active: boolean;
  auto_reply_enabled: boolean;
  auto_reply_max_per_conversation: number;
  auto_reply_allowed_numbers: string[];
  handoff_agent_id: string | null;
  embeddings_api_key: string | null;
}

interface AiBehaviorVersionRow {
  id: string;
  communication_prompt: string;
  identity_name: string;
  tone_config: Record<string, unknown>;
  completion_message: string | null;
  model_config: Record<string, unknown>;
}

const CONFIG_COLUMNS =
  'provider, model, api_key, system_prompt, communication_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, auto_reply_allowed_numbers, handoff_agent_id, embeddings_api_key';

/**
 * Load and decrypt the account's AI config for *use* (draft or
 * auto-reply). Returns `null` when there's no row or the master switch
 * (`is_active`) is off — both mean "AI is not available", which callers
 * treat identically. Throws only if the stored key can't be decrypted
 * (mismatched `ENCRYPTION_KEY`), so that distinct failure surfaces
 * rather than looking like "not configured".
 *
 * Works with any client: pass the RLS-scoped SSR client from a
 * dashboard route, or the service-role admin client from the webhook.
 */
export async function loadAiConfig(
  db: SupabaseClient,
  accountId: string,
  opts: { requireActive?: boolean } = {}
): Promise<AiConfig | null> {
  const { requireActive = true } = opts;
  const { data, error } = await db
    .from('ai_configs')
    .select(CONFIG_COLUMNS)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as AiConfigRow;
  // The Playground passes requireActive:false so an admin can test the
  // agent before flipping the master switch on.
  if (requireActive && !row.is_active) return null;
  // Defensive: the column is NOT NULL, but a partial write / manual DB
  // edit could leave it empty. Treat a missing key as "not configured"
  // rather than letting decrypt() throw on null.
  if (!row.api_key) return null;

  // `ai_configs` is the credential/runtime switch. The active version is the
  // published behavior selected in the owner dashboard. Keeping this merge in
  // one loader prevents the reply path, simulator and background workers from
  // silently using different prompts or models.
  const behaviorResult = await db
    .from('ai_config_versions')
    .select(
      'id, communication_prompt, identity_name, tone_config, completion_message, model_config'
    )
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle();
  if (behaviorResult.error) {
    console.error(
      `[ai config] active behavior version for account ${accountId} could not be loaded; using credential-level defaults.`,
      behaviorResult.error
    );
  }
  const behavior = (behaviorResult.data as AiBehaviorVersionRow | null) ?? null;
  const behaviorProvider =
    typeof behavior?.model_config?.provider === 'string'
      ? behavior.model_config.provider
      : null;
  const behaviorModel =
    typeof behavior?.model_config?.model === 'string'
      ? behavior.model_config.model.trim()
      : '';
  const effectiveModel =
    behaviorModel && (!behaviorProvider || behaviorProvider === row.provider)
      ? behaviorModel
      : row.model;

  // The embeddings key is optional and independent of the chat key —
  // a corrupt/undecryptable one should downgrade to lexical KB, not
  // take down draft/auto-reply, so decrypt failures are swallowed here.
  let embeddingsApiKey: string | null = null;
  if (row.embeddings_api_key) {
    try {
      embeddingsApiKey = decrypt(row.embeddings_api_key);
    } catch {
      // Not silent — a rotated/mismatched ENCRYPTION_KEY here means
      // semantic search quietly stops working, so leave a breadcrumb.
      console.error(
        `[ai config] embeddings key for account ${accountId} could not be decrypted — check ENCRYPTION_KEY; semantic search is disabled until it is re-entered.`
      );
      embeddingsApiKey = null;
    }
  }

  return {
    provider: row.provider,
    model: effectiveModel,
    apiKey: decrypt(row.api_key),
    internalPrompt: row.system_prompt,
    communicationPrompt:
      behavior?.communication_prompt?.trim() || row.communication_prompt,
    isActive: row.is_active,
    autoReplyEnabled: row.auto_reply_enabled,
    autoReplyMaxPerConversation: row.auto_reply_max_per_conversation,
    autoReplyAllowedNumbers: row.auto_reply_allowed_numbers ?? [],
    handoffAgentId: row.handoff_agent_id,
    behaviorVersionId: behavior?.id ?? null,
    identityName: behavior?.identity_name?.trim() || 'Pedro',
    toneConfig: {
      language:
        typeof behavior?.tone_config?.language === 'string'
          ? behavior.tone_config.language
          : 'pt-BR',
      style:
        typeof behavior?.tone_config?.style === 'string'
          ? behavior.tone_config.style
          : 'consultivo',
      message_length:
        typeof behavior?.tone_config?.message_length === 'string'
          ? behavior.tone_config.message_length
          : 'short',
      adapt_to_lead: behavior?.tone_config?.adapt_to_lead !== false,
      allow_contextual_laughter:
        behavior?.tone_config?.allow_contextual_laughter !== false,
    },
    completionMessage: behavior?.completion_message ?? null,
    embeddingsApiKey,
  };
}

/**
 * Load + decrypt just the embeddings key, independent of `is_active`.
 * Used by the knowledge-base ingest routes so the KB gets embedded (and
 * semantic search works) whenever an embeddings key is present, even if
 * the assistant's master switch is currently off.
 *
 * Returns `{ key, corrupt }`: `key` is null when there's no key OR it
 * can't be decrypted; `corrupt` distinguishes those cases so callers can
 * warn ("a key is set but unusable") rather than silently indexing
 * lexical-only and reporting success.
 */
export async function loadEmbeddingsKey(
  db: SupabaseClient,
  accountId: string
): Promise<{ key: string | null; corrupt: boolean }> {
  const { data, error } = await db
    .from('ai_configs')
    .select('embeddings_api_key')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !data?.embeddings_api_key) return { key: null, corrupt: false };
  try {
    return { key: decrypt(data.embeddings_api_key), corrupt: false };
  } catch {
    console.error(
      `[ai config] embeddings key for account ${accountId} could not be decrypted — check ENCRYPTION_KEY.`
    );
    return { key: null, corrupt: true };
  }
}
