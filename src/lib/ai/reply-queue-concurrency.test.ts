import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  dispatch: vi.fn(),
  trigger: vi.fn(),
  stale: vi.fn().mockResolvedValue([]),
  openFailure: vi.fn(),
}));

vi.mock('./auto-reply', () => ({
  dispatchInboundToAiReply: h.dispatch,
}));
vi.mock('./delivery', () => ({
  findStaleSendingOutboxes: h.stale,
}));
vi.mock('./guidance', () => ({
  openOperationalFailure: h.openFailure,
}));
vi.mock('./processor-trigger', () => ({
  triggerAiReplyProcessor: h.trigger,
}));
vi.mock('./admin-client', () => ({
  supabaseAdmin: vi.fn(),
}));

import { processAiReplyQueue } from './reply-queue';

function job(id: string) {
  return {
    id,
    account_id: 'account-1',
    conversation_id: `conversation-${id}`,
    contact_id: `contact-${id}`,
    trigger_message_id: `message-${id}`,
    config_owner_user_id: 'owner-1',
    sender_phone: '5511999999999',
    attempt_count: 1,
    max_attempts: 3,
    correlation_id: `correlation-${id}`,
    context_version: 1,
  };
}

function database() {
  let claims = 0;
  const terminal = { data: [], error: null };
  const chain = {
    select: () => chain,
    insert: () => Promise.resolve(terminal),
    update: () => chain,
    in: () => chain,
    lte: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(terminal),
    then: (
      resolve: (value: typeof terminal) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(terminal).then(resolve, reject),
  };
  return {
    from: () => chain,
    rpc: (name: string) => {
      if (name !== 'claim_ai_reply_jobs') {
        return Promise.resolve({ data: null, error: null });
      }
      claims += 1;
      return Promise.resolve({
        data: claims === 1 ? [job('one'), job('two')] : [],
        error: null,
      });
    },
  };
}

describe('AI reply queue concurrency', () => {
  it('starts an independent lead while another lead is still processing', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    h.dispatch.mockImplementation(async ({ jobId }: { jobId: string }) => {
      if (jobId === 'one') await firstGate;
      return { outcome: 'completed' as const };
    });

    const processing = processAiReplyQueue(
      database() as unknown as Parameters<typeof processAiReplyQueue>[0],
      4
    );
    await vi.waitFor(() => expect(h.dispatch).toHaveBeenCalledTimes(2));
    releaseFirst?.();

    await expect(processing).resolves.toBe(2);
  });
});
