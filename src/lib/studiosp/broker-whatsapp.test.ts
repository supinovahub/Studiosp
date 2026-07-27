import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendProviderText } from '@/lib/whatsapp/provider';
import { handleBrokerOperationalReply } from './broker-whatsapp';

vi.mock('@/lib/whatsapp/provider', () => ({
  sendProviderText: vi.fn(),
}));

type FakeOptions = {
  broker: Record<string, unknown> | null;
  offer: Record<string, unknown> | null;
};

function fakeDb(options: FakeOptions) {
  const upserts: Array<{ table: string; value: unknown }> = [];

  const db = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data:
            table === 'broker_profiles'
              ? options.broker
              : table === 'assignment_offers'
                ? options.offer
                : null,
          error: null,
        }),
        upsert: async (value: unknown) => {
          upserts.push({ table, value });
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };

  return { db: db as unknown as SupabaseClient, upserts };
}

const baseArgs = {
  accountId: 'account-1',
  whatsappConfigId: 'whatsapp-1',
  remoteChatId: '5527981168321@s.whatsapp.net',
  phone: '5527981168321',
  text: 'Ainda é sim',
  providerConfig: {
    provider: 'uazapi' as const,
    uazapi_base_url: 'https://example.invalid',
    accessToken: 'token',
  },
};

describe('handleBrokerOperationalReply', () => {
  beforeEach(() => {
    vi.mocked(sendProviderText).mockReset();
  });

  it('devolve a mensagem ao fluxo do lead quando o corretor não tem oferta pendente', async () => {
    const { db, upserts } = fakeDb({
      broker: { id: 'broker-1' },
      offer: null,
    });

    const handled = await handleBrokerOperationalReply({ ...baseArgs, db });

    expect(handled).toBe(false);
    expect(upserts).toEqual([]);
    expect(sendProviderText).not.toHaveBeenCalled();
  });

  it('consome a mensagem como operacional quando existe oferta pendente', async () => {
    const { db, upserts } = fakeDb({
      broker: { id: 'broker-1' },
      offer: { id: 'offer-1' },
    });

    const handled = await handleBrokerOperationalReply({
      ...baseArgs,
      db,
      text: 'Olá',
    });

    expect(handled).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.table).toBe('broker_operational_conversations');
    expect(sendProviderText).toHaveBeenCalledOnce();
  });
});
