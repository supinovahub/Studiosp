import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, unknown>;

export async function upsertOwnerAttention(
  db: SupabaseClient,
  args: {
    accountId: string;
    kind: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    deduplicationKey: string;
    opportunityId?: string | null;
    context?: JsonObject;
    dueAt?: string | null;
  }
) {
  const { data, error } = await db.rpc('studiosp_upsert_attention_item', {
    p_account_id: args.accountId,
    p_kind: args.kind,
    p_severity: args.severity,
    p_title: args.title,
    p_deduplication_key: args.deduplicationKey,
    p_opportunity_id: args.opportunityId ?? null,
    p_context: args.context ?? {},
    p_due_at: args.dueAt ?? new Date().toISOString(),
  });
  if (error) throw error;
  return data;
}
