export function reactivationConversationUpdates(
  connectionKey: string,
  contextStartedAt = new Date().toISOString()
) {
  return {
    status: 'open',
    whatsapp_connection_key: connectionKey,
    assigned_agent_id: null,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
    ai_handoff_summary: null,
    ai_context_started_at: contextStartedAt,
    ai_control_mode: 'ai_active',
    ai_control_reason: 'reactivation_started',
    ai_control_changed_at: contextStartedAt,
    ai_processing_status: 'idle',
    ai_processing_reason: 'reactivation_started',
    ai_processing_job_id: null,
  };
}
