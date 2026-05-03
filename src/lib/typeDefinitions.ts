// Centralized type definitions to replace 'any' usage

// Form and validation types
export interface FormValidationError {
  field: string;
  message: string;
  type: 'required' | 'format' | 'length' | 'custom';
}

export interface ValidationResult {
  isValid: boolean;
  errors: FormValidationError[];
  data: Record<string, unknown>;
}

// Chat and messaging types
export interface ChatContext {
  type: 'form_recovery' | 'bulk_import' | 'entity_action' | 'general';
  entityType?: string;
  formData?: Record<string, unknown>;
  errors?: FormValidationError[];
  recoveryStrategy?: 'guided' | 'bulk' | 'quick' | 'predictive';
  timestamp: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  content: string;
  context?: ChatContext;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
}

// Entity types
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  user_id: string;
}

export interface Contact extends BaseEntity {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  status?: string;
  contact_number: number;
  account_id?: string;
  assigned_to?: string;
  notes?: string;
  address?: string;
  position?: string;
  version?: number;
  enrichment_confidence?: number;
  enriched_at?: string;
  data_sources?: Record<string, unknown>;
}

export interface Deal extends BaseEntity {
  name: string;
  description?: string;
  amount?: number;
  stage: string;
  probability?: number;
  probability_source?: 'stage_default' | 'manual' | 'ai_suggested' | 'imported';
  expected_close_date?: string;
  close_date?: string;
  currency?: string;
  deal_number: number;
  contact_id?: string;
  account_id?: string;
  assigned_to?: string;
  version?: number;
  enriched_at?: string;
  data_sources?: Record<string, unknown>;
}

export interface Account extends BaseEntity {
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  description?: string;
  account_number: number;
  assigned_to?: string;
  version?: number;
  enrichment_confidence?: number;
  enriched_at?: string;
  data_sources?: Record<string, unknown>;
  confidence_scores?: Record<string, number>;
  scraped_data?: Record<string, unknown>;
}

export interface Activity extends BaseEntity {
  title: string;
  type: string;
  description?: string;
  subject?: string;
  activity_date?: string;
  scheduled_at?: string;
  completed?: boolean;
  activity_number: number;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
  assigned_to?: string;
  version?: number;
}

export interface Task extends BaseEntity {
  title: string;
  description?: string;
  due_date?: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  task_number: number;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
  assigned_to?: string;
}

// Data processing types
export interface DataPattern {
  type: string;
  field: string;
  affectedCount: number;
  suggestedFix?: string;
  confidence: number;
}

export interface DataSuggestion {
  id: string;
  type: 'auto_fix' | 'suggestion' | 'validation';
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reason: string;
  confidence: number;
  requiresConfirmation: boolean;
}

export interface BulkOperationResult {
  successful: number;
  failed: number;
  warnings: number;
  errors: FormValidationError[];
  patterns: DataPattern[];
  suggestions: DataSuggestion[];
}

// API and service types
export interface ApiResponse<T = unknown> {
  data: T | null;
  error: ApiError | null;
  success: boolean;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

// Security types
export interface SecurityContext {
  user_id: string;
  organization_id: string;
  permissions: string[];
  session_id: string;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string;
}

// Metadata and configuration types
export interface MetadataConfig {
  [key: string]: unknown;
}

export interface EnrichmentConfig {
  enabled: boolean;
  sources: string[];
  confidence_threshold: number;
  auto_update: boolean;
}

// Analytics types
export interface AnalyticsEvent {
  event_type: string;
  user_id: string;
  organization_id: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface CRMStats {
  total_contacts: number;
  total_deals: number;
  total_activities: number;
  total_tasks: number;
  recent_activity: number;
  total_deal_value: number;
  avg_deal_value: number;
  won_deals: number;
  active_deals: number;
  overdue_tasks: number;
}

// Organization and user types
export interface Organization {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  company_size?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  is_active: boolean;
  is_demo?: boolean;
  demo_metadata?: Record<string, unknown>;
}

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  created_at: string;
  updated_at: string;
}

// Utility types
export type EntityType = 'contacts' | 'deals' | 'accounts' | 'activities' | 'tasks';
export type OperationType = 'create' | 'update' | 'delete' | 'bulk_create' | 'bulk_update';
export type ValidationLevel = 'strict' | 'normal' | 'lenient';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Type guards
export function isContact(entity: BaseEntity): entity is Contact {
  return 'contact_number' in entity;
}

export function isDeal(entity: BaseEntity): entity is Deal {
  return 'deal_number' in entity;
}

export function isAccount(entity: BaseEntity): entity is Account {
  return 'account_number' in entity;
}

export function isActivity(entity: BaseEntity): entity is Activity {
  return 'activity_number' in entity;
}

export function isValidEntityType(type: string): type is EntityType {
  return ['contacts', 'deals', 'accounts', 'activities', 'tasks'].includes(type);
}