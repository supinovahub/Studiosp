import type { SupabaseClient } from '@supabase/supabase-js';

export interface AiSemanticContext {
  version: 1;
  mode: 'qualification' | 'reactivation' | 'followup' | 'guidance';
  expectedQuestionKey?: string | null;
  expectedResponseKind?: 'reactivation_interest' | null;
  presentedFacts?: string[];
  offeredSlotId?: string | null;
  offeredSlotIds?: string[];
  guidanceRequestId?: string | null;
}

export function semanticMessageMetadata(context: AiSemanticContext) {
  return {
    ai_context: {
      ...context,
      version: 1,
      presentedFacts: (context.presentedFacts ?? []).slice(0, 20),
      offeredSlotIds: (context.offeredSlotIds ?? []).slice(0, 5),
    },
  };
}

export function readSemanticContext(
  metadata: unknown
): AiSemanticContext | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidate = (metadata as Record<string, unknown>).ai_context;
  if (!candidate || typeof candidate !== 'object') return null;
  const value = candidate as Record<string, unknown>;
  if (value.version !== 1) return null;
  if (
    !['qualification', 'reactivation', 'followup', 'guidance'].includes(
      String(value.mode)
    )
  ) {
    return null;
  }
  return value as unknown as AiSemanticContext;
}

export async function loadPreviousAssistantSemanticContext(args: {
  db: SupabaseClient;
  conversationId: string;
  triggerMessageId?: string | null;
}) {
  let createdAt: string | null = null;
  if (args.triggerMessageId) {
    const trigger = await args.db
      .from('messages')
      .select('created_at')
      .eq('conversation_id', args.conversationId)
      .eq('id', args.triggerMessageId)
      .maybeSingle();
    createdAt = trigger.data?.created_at ?? null;
  }
  let query = args.db
    .from('messages')
    .select('provider_metadata')
    .eq('conversation_id', args.conversationId)
    .in('sender_type', ['agent', 'bot'])
    .not('provider_metadata', 'is', null);
  if (createdAt) query = query.lte('created_at', createdAt);
  const { data } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return readSemanticContext(data?.provider_metadata);
}
