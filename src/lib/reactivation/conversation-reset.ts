export function reactivationConversationUpdates(
  connectionKey: string,
  contextStartedAt = new Date().toISOString()
) {
  return {
    whatsapp_connection_key: connectionKey,
    assigned_agent_id: null,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
    ai_handoff_summary: null,
    ai_context_started_at: contextStartedAt,
  };
}
