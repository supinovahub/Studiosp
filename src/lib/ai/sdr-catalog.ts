import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SdrClassification,
  SdrProduct,
  SdrTurnContext,
} from './sdr-types';

const PRODUCT_COLUMNS =
  'id, sku, name, development_name, property_type, availability_status, description, address, neighborhood, city, state, price, condo_fee, property_tax, area_m2, bedrooms, bathrooms, parking_spaces, floor_number, delivery_date, features, payment_terms, public_url, product_media(id, media_type, url, alt_text, caption, sort_order, is_cover)';

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function scoreProduct(
  product: SdrProduct,
  classification: SdrClassification
): number {
  let score = 0;
  const city = normalize(product.city);
  const neighborhood = normalize(product.neighborhood);
  const type = normalize(product.property_type);

  if (
    classification.preferredCities.some((item) => city.includes(normalize(item)))
  )
    score += 30;
  if (
    classification.preferredNeighborhoods.some((item) =>
      neighborhood.includes(normalize(item))
    )
  )
    score += 35;
  if (
    classification.propertyTypes.some((item) => type.includes(normalize(item)))
  )
    score += 15;
  if (
    classification.budgetMax !== null &&
    product.price !== null &&
    product.price <= classification.budgetMax
  )
    score += 20;
  if (
    classification.budgetMin !== null &&
    product.price !== null &&
    product.price >= classification.budgetMin
  )
    score += 5;
  if (
    classification.minBedrooms !== null &&
    product.bedrooms !== null &&
    product.bedrooms >= classification.minBedrooms
  )
    score += 10;
  if (
    classification.minAreaM2 !== null &&
    product.area_m2 !== null &&
    product.area_m2 >= classification.minAreaM2
  )
    score += 10;
  if (classification.needsParking === true && (product.parking_spaces ?? 0) > 0)
    score += 10;
  if (product.product_media?.some((media) => media.media_type === 'image'))
    score += 2;
  return score;
}

function money(value: number | null): string {
  if (value === null) return 'sob consulta';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function productGrounding(product: SdrProduct): string {
  const media = [...(product.product_media ?? [])].sort(
    (a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order
  );
  return [
    `ID: ${product.id}`,
    `Imóvel: ${product.name}`,
    product.development_name ? `Empreendimento: ${product.development_name}` : null,
    `Status: ${product.availability_status}`,
    `Tipo: ${product.property_type}`,
    `Localização: ${[product.neighborhood, product.city, product.state].filter(Boolean).join(', ') || 'não informada'}`,
    `Preço: ${money(product.price)}`,
    product.area_m2 !== null ? `Área: ${product.area_m2} m²` : null,
    product.bedrooms !== null ? `Dormitórios: ${product.bedrooms}` : null,
    product.bathrooms !== null ? `Banheiros: ${product.bathrooms}` : null,
    product.parking_spaces !== null ? `Vagas: ${product.parking_spaces}` : null,
    product.features?.length ? `Diferenciais: ${product.features.join(', ')}` : null,
    product.payment_terms ? `Condições: ${product.payment_terms}` : null,
    product.description ? `Descrição: ${product.description}` : null,
    product.public_url ? `Link: ${product.public_url}` : null,
    media[0]?.url ? `Foto principal: ${media[0].url}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function findProductsForLead(
  db: SupabaseClient,
  accountId: string,
  classification: SdrClassification,
  limit = 5
): Promise<SdrProduct[]> {
  let query = db
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('account_id', accountId)
    .eq('is_active', true)
    .eq('availability_status', 'available')
    .limit(200);

  if (classification.budgetMax !== null) {
    query = query.lte('price', classification.budgetMax);
  }
  if (classification.minBedrooms !== null) {
    query = query.gte('bedrooms', classification.minBedrooms);
  }
  if (classification.minAreaM2 !== null) {
    query = query.gte('area_m2', classification.minAreaM2);
  }
  if (classification.needsParking === true) {
    query = query.gt('parking_spaces', 0);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[sdr catalog] product query failed:', error);
    return [];
  }

  return ((data ?? []) as unknown as SdrProduct[])
    .map((product) => ({
      ...product,
      product_media: [...(product.product_media ?? [])].sort(
        (a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order
      ),
    }))
    .sort(
      (a, b) =>
        scoreProduct(b, classification) - scoreProduct(a, classification) ||
        (a.price ?? Number.MAX_SAFE_INTEGER) -
          (b.price ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, limit);
}

export async function buildSdrTurnContext(args: {
  db: SupabaseClient;
  accountId: string;
  classification: SdrClassification;
}): Promise<SdrTurnContext> {
  const products = await findProductsForLead(
    args.db,
    args.accountId,
    args.classification
  );
  return {
    classification: args.classification,
    products,
    grounding: products.map(productGrounding),
  };
}
