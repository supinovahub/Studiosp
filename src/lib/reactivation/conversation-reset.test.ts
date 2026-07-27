import { describe, expect, it } from 'vitest';
import { reactivationConversationUpdates } from './conversation-reset';

describe('reactivationConversationUpdates', () => {
  it('prepara uma conversa antiga para um novo ciclo automático', () => {
    expect(
      reactivationConversationUpdates(
        'uazapi:instance-current',
        '2026-07-27T20:00:00.000Z'
      )
    ).toEqual({
      whatsapp_connection_key: 'uazapi:instance-current',
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
      ai_handoff_summary: null,
      ai_context_started_at: '2026-07-27T20:00:00.000Z',
    });
  });
});
