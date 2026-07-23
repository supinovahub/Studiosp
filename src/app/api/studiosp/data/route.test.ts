import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentAccount = vi.fn();

vi.mock('@/lib/auth/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/account')>();
  return { ...actual, getCurrentAccount };
});

function query(data: unknown = []) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data, error: null }),
    then: (
      resolve: (value: { data: unknown; error: null }) => unknown
    ) => resolve({ data, error: null }),
  };
  return builder;
}

function supabaseStub() {
  return {
    from: (table: string) => {
      if (table === 'profiles') return query({ id: 'profile-1' });
      if (table === 'broker_profiles') return query({ id: 'broker-1' });
      return query([]);
    },
    rpc: async () => ({ data: {}, error: null }),
  };
}

function context(role: 'owner' | 'admin' | 'agent' | 'viewer') {
  return {
    supabase: supabaseStub(),
    userId: 'user-1',
    accountId: 'account-1',
    role,
    account: { id: 'account-1', name: 'Conta' },
  };
}

describe('GET /api/studiosp/data authorization', () => {
  beforeEach(() => getCurrentAccount.mockReset());

  it.each([
    'overview',
    'attention',
    'pipeline',
    'followups',
    'developments',
    'intelligence',
    'settings',
    'reports',
  ])('returns 403 when a broker requests the administrative view %s', async (view) => {
    getCurrentAccount.mockResolvedValue(context('agent'));
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(`http://localhost/api/studiosp/data?view=${view}`)
    );
    expect(response.status).toBe(403);
  });

  it('allows an owner to load an administrative view', async () => {
    getCurrentAccount.mockResolvedValue(context('owner'));
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('http://localhost/api/studiosp/data?view=overview')
    );
    expect(response.status).toBe(200);
  });

  it('allows a broker to load only their operational leads', async () => {
    getCurrentAccount.mockResolvedValue(context('agent'));
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('http://localhost/api/studiosp/data?view=leads')
    );
    expect(response.status).toBe(200);
  });
});

