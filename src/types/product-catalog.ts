// Product Catalog & Feature Gap Types

export interface PricingTier {
  name: string;
  price: number;
  billing_frequency?: 'monthly' | 'annual' | 'one_time';
  limits?: Record<string, number | string>;
  features?: string[];
}

export interface Product {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  icon: string | null;
  category: string | null;
  pricing_model: 'subscription' | 'one_time' | 'usage_based' | 'custom';
  base_price: number | null;
  billing_frequency: 'monthly' | 'annual' | 'one_time';
  pricing_tiers: PricingTier[];
  status: 'active' | 'deprecated' | 'coming_soon';
  roadmap_eta: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProductFeature {
  id: string;
  organization_id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  status: 'available' | 'beta' | 'coming_soon' | 'deprecated';
  roadmap_eta: string | null;
  roadmap_priority: 'high' | 'medium' | 'low' | null;
  is_premium: boolean;
  minimum_tier: string | null;
  competitors_with_feature: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DealFeatureGap {
  id: string;
  organization_id: string;
  deal_id: string;
  feature_id: string | null;
  feature_name: string;
  impact_level: 'critical' | 'high' | 'medium' | 'low';
  was_dealbreaker: boolean;
  attributed_amount: number | null;
  prospect_feedback: string | null;
  workaround_offered: string | null;
  workaround_rejected_reason: string | null;
  created_at: string;
  created_by: string | null;
}

export interface FeatureRequest {
  id: string;
  organization_id: string;
  source_type: 'deal_loss' | 'customer_feedback' | 'support_ticket' | 'sales_call';
  source_deal_id: string | null;
  source_account_id: string | null;
  source_contact_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  total_opportunity_value: number;
  request_count: number;
  status: 'new' | 'under_review' | 'planned' | 'in_progress' | 'shipped' | 'declined';
  linked_feature_id: string | null;
  priority_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductGapInsight {
  organization_id: string;
  feature_name: string;
  feature_id: string | null;
  feature_category: string | null;
  feature_status: string | null;
  roadmap_eta: string | null;
  roadmap_priority: string | null;
  deals_affected: number;
  dealbreaker_count: number;
  total_opportunity_cost: number;
  total_deal_value: number;
  avg_impact_per_deal: number;
  impact_levels: string[];
  last_occurrence: string;
}

// LTV Types

export interface AccountLTV {
  ltv_calculated: number | null;
  ltv_predicted: number | null;
  ltv_confidence: number | null;
  ltv_segment: 'high' | 'medium' | 'low' | 'churned' | null;
  ltv_last_calculated_at: string | null;
  arr: number | null;
  mrr: number | null;
  total_revenue: number;
  customer_since: string | null;
  churn_risk_score: number | null;
  expansion_potential: number | null;
  health_score: number | null;
}

export interface AccountLTVHistory {
  id: string;
  account_id: string;
  organization_id: string;
  ltv_calculated: number | null;
  ltv_predicted: number | null;
  arr: number | null;
  mrr: number | null;
  total_revenue: number | null;
  health_score: number | null;
  churn_risk_score: number | null;
  calculation_method: string | null;
  factors_used: Record<string, any> | null;
  recorded_at: string;
}

export interface LTVBenchmark {
  id: string;
  organization_id: string;
  segment_type: 'industry' | 'company_size' | 'region' | 'use_case';
  segment_value: string;
  avg_ltv: number | null;
  median_ltv: number | null;
  avg_contract_length_months: number | null;
  avg_deal_size: number | null;
  churn_rate: number | null;
  expansion_rate: number | null;
  sample_size: number;
  last_calculated_at: string;
}

// Constants

export const PRODUCT_CATEGORIES = [
  'Core Platform',
  'Add-on',
  'Integration',
  'Professional Services',
  'Support',
  'Training',
] as const;

export const FEATURE_CATEGORIES = [
  'Integration',
  'Analytics',
  'Security',
  'Automation',
  'Collaboration',
  'Reporting',
  'API',
  'Mobile',
  'AI/ML',
  'Compliance',
] as const;

export const IMPACT_LEVELS = [
  { value: 'critical', label: 'Critical', color: 'red' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'low', label: 'Low', color: 'gray' },
] as const;

export const LTV_SEGMENTS = [
  { value: 'high', label: 'High Value', minLTV: 100000, color: 'green' },
  { value: 'medium', label: 'Medium Value', minLTV: 25000, color: 'blue' },
  { value: 'low', label: 'Low Value', minLTV: 0, color: 'gray' },
  { value: 'churned', label: 'Churned', minLTV: null, color: 'red' },
] as const;
