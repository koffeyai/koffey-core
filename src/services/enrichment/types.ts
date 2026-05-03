/**
 * Lead Enrichment System - Type Definitions
 */

// =============================================================================
// Enrichment Provider Types
// =============================================================================

export type AuthType = 'bearer' | 'header' | 'query_param' | 'basic' | 'none';

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body_template?: Record<string, unknown>;
}

export interface ApiConfig {
  base_url: string | null;
  auth_type: AuthType;
  auth_config: Record<string, string>;
  endpoints: Record<string, ApiEndpoint>;
  rate_limit?: { requests_per_minute: number };
}

export interface ResponseMapping {
  person?: Record<string, string>;
  company?: Record<string, string>;
}

export interface FitScoringRule {
  condition: string;
  points: number;
}

export interface ErrorBehavior {
  status_codes: number[];
  behavior: 'return_empty' | 'retry' | 'disable_provider';
  retry_after_header?: string;
}

export interface ProviderDefinition {
  id: string;
  provider_key: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  is_system_default: boolean;
  created_by_org: string | null;
  api_config: ApiConfig;
  response_mapping: ResponseMapping;
  fit_scoring_rules: Record<string, FitScoringRule>;
  error_mapping: Record<string, ErrorBehavior>;
  created_at: string;
  updated_at: string;
}

export interface ProviderConfig {
  id: string;
  organization_id: string;
  provider_definition_id: string;
  credentials: Record<string, string>;
  is_active: boolean;
  priority: number;
  monthly_quota: number | null;
  requests_this_month: number;
  quota_reset_at: string | null;
  config_overrides: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined from definition
  provider_definition?: ProviderDefinition;
}

// =============================================================================
// Enrichment Result Types
// =============================================================================

export type EnrichmentConfidence = 'high' | 'medium' | 'low';

export interface EnrichmentResult {
  success: boolean;
  provider_key: string;
  confidence: EnrichmentConfidence;
  
  // Person fields
  first_name?: string;
  last_name?: string;
  title?: string;
  phone?: string;
  linkedin_url?: string;
  
  // Company fields
  company_name?: string;
  company_domain?: string;
  industry?: string;
  employee_count?: number;
  company_description?: string;
  
  // Scoring
  fit_score: number;
  fit_signals: Record<string, boolean>;
  
  // Authority inference
  inferred_authority?: AuthorityLevel;
  
  // Error info
  error?: string;
  
  // Raw data for debugging
  raw_response?: unknown;
}

// =============================================================================
// Lead Qualification Types
// =============================================================================

export type QualificationStage = 
  | 'captured' 
  | 'enriched' 
  | 'engaged' 
  | 'discovering' 
  | 'qualified' 
  | 'disqualified';

export type CaptureMethod = 
  | 'manual_entry' 
  | 'signup' 
  | 'contact_form' 
  | 'inbound_email' 
  | 'import' 
  | 'chat_extract' 
  | 'api';

// BANT Components
export type BudgetStatus = 
  | 'unknown' 
  | 'no_budget' 
  | 'budget_pending' 
  | 'budget_allocated' 
  | 'budget_approved';

export type AuthorityLevel = 
  | 'unknown' 
  | 'influencer' 
  | 'recommender' 
  | 'decision_maker' 
  | 'economic_buyer';

export type NeedUrgency = 
  | 'unknown' 
  | 'no_pain' 
  | 'nice_to_have' 
  | 'important' 
  | 'critical' 
  | 'hair_on_fire';

export type TimelineStatus = 
  | 'unknown' 
  | 'no_timeline' 
  | 'next_year' 
  | 'this_quarter' 
  | 'this_month' 
  | 'immediate';

export interface BANTData {
  budget_status: BudgetStatus;
  budget_amount?: number;
  budget_notes?: string;
  
  authority_level: AuthorityLevel;
  
  need_urgency: NeedUrgency;
  need_description?: string;
  
  timeline_status: TimelineStatus;
  timeline_target_date?: string;
}

// =============================================================================
// Contact with Qualification Fields
// =============================================================================

export interface QualifiedContact {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  title?: string;
  company?: string;
  phone?: string;
  
  // Qualification
  qualification_stage: QualificationStage;
  capture_method?: CaptureMethod;
  capture_context?: string;
  
  // Scores
  fit_score: number;
  fit_signals: Record<string, boolean>;
  intent_score: number;
  engagement_score: number;
  bant_score: number;
  overall_lead_score: number;
  
  // BANT
  budget_status: BudgetStatus;
  budget_amount?: number;
  budget_notes?: string;
  authority_level: AuthorityLevel;
  need_urgency: NeedUrgency;
  need_description?: string;
  timeline_status: TimelineStatus;
  timeline_target_date?: string;
  
  // Enrichment metadata
  enriched_at?: string;
  enrichment_provider?: string;
  enrichment_confidence?: string;
  
  // Disqualification
  disqualification_reason?: string;
  disqualified_at?: string;
  disqualified_by?: string;
}

// =============================================================================
// Service Types
// =============================================================================

export interface EnrichContactOptions {
  contact_id: string;
  force_refresh?: boolean;
  preferred_provider?: string;
}

export interface EnrichEmailOptions {
  email: string;
  preferred_provider?: string;
}

export interface EnrichmentServiceConfig {
  organization_id: string;
  enable_logging?: boolean;
  fallback_to_email_parser?: boolean;
}

// =============================================================================
// Display Helpers
// =============================================================================

export const STAGE_LABELS: Record<QualificationStage, string> = {
  captured: 'Captured',
  enriched: 'Enriched',
  engaged: 'Engaged',
  discovering: 'Discovering',
  qualified: 'Qualified',
  disqualified: 'Disqualified'
};

export const STAGE_COLORS: Record<QualificationStage, string> = {
  captured: 'bg-muted text-muted-foreground',
  enriched: 'bg-blue-500/20 text-blue-400',
  engaged: 'bg-purple-500/20 text-purple-400',
  discovering: 'bg-amber-500/20 text-amber-400',
  qualified: 'bg-green-500/20 text-green-400',
  disqualified: 'bg-destructive/20 text-destructive'
};

export const BUDGET_LABELS: Record<BudgetStatus, string> = {
  unknown: 'Unknown',
  no_budget: 'No Budget',
  budget_pending: 'Pending Approval',
  budget_allocated: 'Allocated',
  budget_approved: 'Approved'
};

export const AUTHORITY_LABELS: Record<AuthorityLevel, string> = {
  unknown: 'Unknown',
  influencer: 'Influencer',
  recommender: 'Recommender',
  decision_maker: 'Decision Maker',
  economic_buyer: 'Economic Buyer'
};

export const NEED_LABELS: Record<NeedUrgency, string> = {
  unknown: 'Unknown',
  no_pain: 'No Pain',
  nice_to_have: 'Nice to Have',
  important: 'Important',
  critical: 'Critical',
  hair_on_fire: 'Hair on Fire 🔥'
};

export const TIMELINE_LABELS: Record<TimelineStatus, string> = {
  unknown: 'Unknown',
  no_timeline: 'No Timeline',
  next_year: 'Next Year',
  this_quarter: 'This Quarter',
  this_month: 'This Month',
  immediate: 'Immediate'
};
