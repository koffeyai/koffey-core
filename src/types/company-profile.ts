export interface CompanyProfile {
  id: string;
  organization_id: string;
  
  // Identity
  company_name: string;
  tagline: string | null;
  industry: string | null;
  website_url: string | null;
  
  // Messaging
  value_proposition: string | null;
  elevator_pitch: string | null;
  boilerplate_about: string | null;
  
  // Products
  products_services: ProductService[];
  
  // Positioning
  differentiators: string[];
  target_personas: TargetPersona[];
  
  // Social Proof
  proof_points: ProofPoint[];
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ProductService {
  id: string;
  name: string;
  description: string;
  features?: string[];
  icon?: string;
}

export interface TargetPersona {
  id: string;
  title: string;
  description: string;
  pain_points?: string[];
}

export interface ProofPoint {
  id: string;
  type: 'stat' | 'quote' | 'logo';
  value: string;
  source?: string;
  logo_url?: string;
}

export const INDUSTRIES = [
  'Technology / SaaS',
  'Financial Services',
  'Healthcare',
  'Manufacturing',
  'Retail / E-commerce',
  'Professional Services',
  'Media / Entertainment',
  'Education',
  'Real Estate',
  'Other'
] as const;

export type Industry = typeof INDUSTRIES[number];
