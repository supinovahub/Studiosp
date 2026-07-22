export const SDR_INTENTS = [
  'property_search',
  'price',
  'availability',
  'location',
  'features',
  'photos',
  'financing',
  'investment',
  'schedule',
  'human_handoff',
  'objection',
  'complaint',
  'opt_out',
  'other',
] as const;

export type SdrIntent = (typeof SDR_INTENTS)[number];
export type LeadStage =
  | 'new'
  | 'discovering'
  | 'qualified'
  | 'visit_ready'
  | 'negotiating'
  | 'handoff'
  | 'lost';
export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface SdrClassification {
  primaryIntent: SdrIntent;
  intents: SdrIntent[];
  leadStage: LeadStage;
  temperature: LeadTemperature;
  score: number;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredCities: string[];
  preferredNeighborhoods: string[];
  propertyTypes: string[];
  minBedrooms: number | null;
  minAreaM2: number | null;
  needsParking: boolean | null;
  financingInterest: boolean | null;
  purchaseTimeframe: string | null;
  wantsPhotos: boolean;
  summary: string;
  nextBestAction: string;
  confidence: number;
  requiresHandoff: boolean;
}

export interface ProductMedia {
  id: string;
  media_type: 'image' | 'video' | 'document' | 'floor_plan';
  url: string;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
}

export interface SdrProduct {
  id: string;
  sku: string | null;
  name: string;
  development_name: string | null;
  property_type: string;
  availability_status: string;
  description: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  condo_fee: number | null;
  property_tax: number | null;
  area_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  floor_number: number | null;
  delivery_date: string | null;
  features: string[];
  payment_terms: string | null;
  public_url: string | null;
  product_media: ProductMedia[];
}

export interface SdrTurnContext {
  classification: SdrClassification;
  products: SdrProduct[];
  grounding: string[];
}
