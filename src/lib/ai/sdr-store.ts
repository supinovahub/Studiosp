import type { SupabaseClient } from '@supabase/supabase-js';
import type { SdrClassification } from './sdr-types';

function stateRow(args: {
  accountId: string;
  conversationId: string;
  contactId: string;
  classification: SdrClassification;
  productIds: string[];
}) {
  const c = args.classification;
  return {
    conversation_id: args.conversationId,
    account_id: args.accountId,
    contact_id: args.contactId,
    primary_intent: c.primaryIntent,
    intents: c.intents,
    lead_stage: c.leadStage,
    temperature: c.temperature,
    score: c.score,
    budget_min: c.budgetMin,
    budget_max: c.budgetMax,
    preferred_cities: c.preferredCities,
    preferred_neighborhoods: c.preferredNeighborhoods,
    property_types: c.propertyTypes,
    min_bedrooms: c.minBedrooms,
    min_area_m2: c.minAreaM2,
    needs_parking: c.needsParking,
    financing_interest: c.financingInterest,
    purchase_timeframe: c.purchaseTimeframe,
    wants_photos: c.wantsPhotos,
    summary: c.summary,
    next_best_action: c.nextBestAction,
    recommended_product_ids: args.productIds,
    confidence: c.confidence,
    last_classified_at: new Date().toISOString(),
  };
}

export async function persistSdrClassification(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  classification: SdrClassification;
  productIds: string[];
  responseText?: string;
  outcome?: 'classified' | 'replied' | 'handoff' | 'failed';
}): Promise<void> {
  const row = stateRow(args);
  const { error: stateError } = await args.db
    .from('conversation_sdr_state')
    .upsert(row, { onConflict: 'conversation_id' });
  if (stateError) {
    console.error('[sdr] state upsert failed:', stateError);
  }

  const { error: eventError } = await args.db.from('ai_sdr_events').insert({
    account_id: args.accountId,
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    classification: args.classification,
    recommended_product_ids: args.productIds,
    response_text: args.responseText ?? null,
    outcome: args.outcome ?? 'classified',
  });
  if (eventError) {
    console.error('[sdr] event insert failed:', eventError);
  }
}
