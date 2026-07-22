import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEmbeddingsKey } from '@/lib/ai/config';
import { ingestDocument } from '@/lib/ai/knowledge';
import { productGrounding } from '@/lib/ai/sdr-catalog';
import type { SdrProduct } from '@/lib/ai/sdr-types';

const PRODUCT_WITH_MEDIA =
  'id, sku, name, development_name, property_type, availability_status, description, address, neighborhood, city, state, price, condo_fee, property_tax, area_m2, bedrooms, bathrooms, parking_spaces, floor_number, delivery_date, features, payment_terms, public_url, product_media(id, media_type, url, alt_text, caption, sort_order, is_cover)';

/** Rebuild the searchable knowledge document generated from one property. */
export async function syncProductKnowledge(
  db: SupabaseClient,
  accountId: string,
  productId: string,
  createdBy?: string
): Promise<{ warning?: string }> {
  await db
    .from('products')
    .update({ knowledge_status: 'processing', knowledge_error: null })
    .eq('id', productId)
    .eq('account_id', accountId);

  try {
    const { data, error } = await db
      .from('products')
      .select(PRODUCT_WITH_MEDIA)
      .eq('id', productId)
      .eq('account_id', accountId)
      .single();
    if (error || !data) throw error ?? new Error('Imóvel não encontrado.');

    const product = data as unknown as SdrProduct;
    const content = productGrounding(product);
    const title = `Imóvel: ${product.name}`;
    const { data: existing, error: existingError } = await db
      .from('ai_knowledge_documents')
      .select('id')
      .eq('account_id', accountId)
      .eq('product_id', productId)
      .maybeSingle();
    if (existingError) throw existingError;

    let documentId: string;
    if (existing) {
      const { error: updateError } = await db
        .from('ai_knowledge_documents')
        .update({ title, content, source_type: 'product' })
        .eq('id', existing.id)
        .eq('account_id', accountId);
      if (updateError) throw updateError;
      documentId = existing.id;
    } else {
      const { data: document, error: insertError } = await db
        .from('ai_knowledge_documents')
        .insert({
          account_id: accountId,
          created_by: createdBy ?? null,
          title,
          content,
          source_type: 'product',
          product_id: productId,
        })
        .select('id')
        .single();
      if (insertError || !document) throw insertError ?? new Error('Falha ao criar documento.');
      documentId = document.id;
    }

    const { key: embeddingsApiKey } = await loadEmbeddingsKey(db, accountId);
    await ingestDocument(db, accountId, { embeddingsApiKey }, documentId, content);
    await db
      .from('products')
      .update({
        knowledge_status: 'ready',
        knowledge_error: null,
        knowledge_indexed_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('account_id', accountId);
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao indexar o imóvel.';
    await db
      .from('products')
      .update({ knowledge_status: 'error', knowledge_error: message.slice(0, 500) })
      .eq('id', productId)
      .eq('account_id', accountId);
    return { warning: message };
  }
}
