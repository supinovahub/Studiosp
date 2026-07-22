import { describe, expect, it } from 'vitest';
import { productGrounding } from './sdr-catalog';
import type { SdrProduct } from './sdr-types';

describe('productGrounding', () => {
  it('renders database facts and the cover photo', () => {
    const product: SdrProduct = {
      id: 'p1', sku: 'ST-10', name: 'Studio Jardins',
      development_name: 'Viva Jardins', property_type: 'studio',
      availability_status: 'available', description: 'Pronto para morar',
      address: null, neighborhood: 'Jardins', city: 'São Paulo', state: 'SP',
      price: 520000, condo_fee: null, property_tax: null, area_m2: 28,
      bedrooms: 1, bathrooms: 1, parking_spaces: 0, floor_number: 10,
      delivery_date: null, features: ['academia'], payment_terms: null,
      public_url: null,
      product_media: [{ id: 'm1', media_type: 'image', url: 'https://cdn.example/studio.jpg', alt_text: null, caption: null, sort_order: 0, is_cover: true }],
    };
    const grounding = productGrounding(product);
    expect(grounding).toContain('Studio Jardins');
    expect(grounding).toContain('Jardins, São Paulo, SP');
    expect(grounding).toContain('R$');
    expect(grounding).toContain('https://cdn.example/studio.jpg');
  });
});
