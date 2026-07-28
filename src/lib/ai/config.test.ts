import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// decrypt is identity in tests so we don't depend on real ciphertext.
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (v: string) => `plain:${v}`,
}));

import { loadAiConfig } from './config';

function terminal(row: Record<string, unknown> | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return chain;
}

function dbReturning(
  row: Record<string, unknown> | null,
  behavior: Record<string, unknown> | null = null
): SupabaseClient {
  const chain = {
    from: (table: string) => terminal(table === 'ai_configs' ? row : behavior),
  };
  return chain as unknown as SupabaseClient;
}

const ROW = {
  provider: 'openai',
  model: 'gpt-x',
  api_key: 'enc-key',
  system_prompt: null,
  communication_prompt: 'Seja objetiva.',
  is_active: false,
  auto_reply_enabled: false,
  auto_reply_max_per_conversation: 3,
  handoff_agent_id: null,
  embeddings_api_key: null,
};

describe('loadAiConfig requireActive', () => {
  it('returns null for an inactive config by default', async () => {
    expect(await loadAiConfig(dbReturning(ROW), 'acct')).toBeNull();
  });

  it('returns the config when requireActive is false (Playground path)', async () => {
    const config = await loadAiConfig(dbReturning(ROW), 'acct', {
      requireActive: false,
    });
    expect(config).not.toBeNull();
    expect(config!.provider).toBe('openai');
    expect(config!.apiKey).toBe('plain:enc-key');
    expect(config!.internalPrompt).toBeNull();
    expect(config!.communicationPrompt).toBe('Seja objetiva.');
  });

  it('returns null when there is no row', async () => {
    expect(
      await loadAiConfig(dbReturning(null), 'acct', { requireActive: false })
    ).toBeNull();
  });

  it('merges the published behavior with credential-level runtime settings', async () => {
    const config = await loadAiConfig(
      dbReturning(
        { ...ROW, is_active: true },
        {
          id: 'behavior-2',
          communication_prompt: 'Escreva como WhatsApp.',
          identity_name: 'Lia',
          tone_config: {
            style: 'direto',
            adapt_to_lead: true,
            allow_contextual_laughter: false,
          },
          completion_message: 'Perfil concluído.',
          model_config: { provider: 'openai', model: 'gpt-published' },
        }
      ),
      'acct'
    );

    expect(config).toEqual(
      expect.objectContaining({
        model: 'gpt-published',
        communicationPrompt: 'Escreva como WhatsApp.',
        behaviorVersionId: 'behavior-2',
        identityName: 'Lia',
        completionMessage: 'Perfil concluído.',
        toneConfig: expect.objectContaining({
          style: 'direto',
          adapt_to_lead: true,
          allow_contextual_laughter: false,
        }),
      })
    );
  });
});
