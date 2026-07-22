const TYPES = ['studio', 'apartment', 'house', 'commercial', 'land', 'other'];
const STATUSES = ['available', 'reserved', 'sold', 'inactive'];

const WRITABLE_FIELDS = [
  'sku', 'name', 'development_name', 'property_type', 'availability_status',
  'description', 'address', 'neighborhood', 'city', 'state', 'postal_code',
  'latitude', 'longitude', 'price', 'condo_fee', 'property_tax', 'area_m2',
  'bedrooms', 'bathrooms', 'parking_spaces', 'floor_number', 'delivery_date',
  'features', 'payment_terms', 'public_url', 'metadata', 'is_active',
] as const;

export function productPayload(
  input: unknown,
  opts: { partial?: boolean } = {}
): { data?: Record<string, unknown>; error?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'O corpo deve ser um objeto JSON.' };
  }
  const source = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const field of WRITABLE_FIELDS) {
    if (source[field] !== undefined) data[field] = source[field];
  }
  if (!opts.partial && (typeof data.name !== 'string' || !data.name.trim())) {
    return { error: 'name é obrigatório.' };
  }
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim())
      return { error: 'name não pode ser vazio.' };
    data.name = data.name.trim().slice(0, 240);
  }
  if (
    data.property_type !== undefined &&
    !TYPES.includes(String(data.property_type))
  )
    return { error: 'property_type inválido.' };
  if (
    data.availability_status !== undefined &&
    !STATUSES.includes(String(data.availability_status))
  )
    return { error: 'availability_status inválido.' };
  if (data.features !== undefined && !Array.isArray(data.features))
    return { error: 'features deve ser uma matriz de strings.' };
  if (Array.isArray(data.features)) {
    data.features = data.features
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100);
  }
  if (
    data.metadata !== undefined &&
    (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata))
  )
    return { error: 'metadata deve ser um objeto JSON.' };
  return { data };
}

export function mediaPayload(input: unknown): {
  data?: Record<string, unknown>;
  error?: string;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { error: 'Mídia inválida.' };
  const value = input as Record<string, unknown>;
  if (typeof value.url !== 'string' || !value.url.startsWith('https://'))
    return { error: 'Toda mídia precisa de uma URL HTTPS.' };
  const type = String(value.media_type ?? 'image');
  if (!['image', 'video', 'document', 'floor_plan'].includes(type))
    return { error: 'media_type inválido.' };
  return {
    data: {
      media_type: type,
      url: value.url,
      alt_text: typeof value.alt_text === 'string' ? value.alt_text : null,
      caption: typeof value.caption === 'string' ? value.caption : null,
      sort_order: Number.isInteger(value.sort_order) ? value.sort_order : 0,
      is_cover: value.is_cover === true,
    },
  };
}
