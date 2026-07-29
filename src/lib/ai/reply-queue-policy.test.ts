import { describe, expect, it, vi } from 'vitest';
import {
  isTransientFailureReason,
  reasonCode,
  retryDelaySeconds,
  terminalState,
} from './reply-queue';

describe('AI reply durable queue policy', () => {
  it('routes successful replies back to the idle state', () => {
    expect(terminalState({ outcome: 'completed' })).toMatchObject({
      jobStatus: 'completed',
      conversationStatus: 'idle',
      reason: 'reply_sent',
    });
  });

  it('never hides a safety-limit handoff as an idle skip', () => {
    expect(
      terminalState({
        outcome: 'handoff',
        reason: 'session_reply_limit_reached',
      })
    ).toMatchObject({
      jobStatus: 'handoff',
      conversationStatus: 'handoff',
    });
  });

  it('keeps human-owned and paused threads visibly paused', () => {
    for (const reason of ['assigned_to_human', 'conversation_paused']) {
      expect(terminalState({ outcome: 'skipped', reason })).toMatchObject({
        jobStatus: 'skipped',
        conversationStatus: 'paused',
      });
    }
  });

  it('uses progressive retry delays with bounded jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(retryDelaySeconds(1)).toBe(20);
    expect(retryDelaySeconds(2)).toBe(65);
    expect(retryDelaySeconds(3)).toBe(185);
    vi.restoreAllMocks();
  });

  it('sanitizes operational reason codes', () => {
    expect(reasonCode('Falha temporária: OpenAI 429')).toBe(
      'falha_tempor_ria_openai_429'
    );
  });

  it('does not permanently pause a conversation after an upstream outage', () => {
    expect(
      terminalState({
        outcome: 'failed',
        reason: 'A OpenAI retornou uma resposta vazia.',
        retryable: true,
      })
    ).toMatchObject({
      jobStatus: 'failed',
      conversationStatus: 'idle',
    });
    expect(
      isTransientFailureReason('O provedor de IA demorou demais para responder.')
    ).toBe(true);
  });
});
