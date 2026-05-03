// Slide Studio TypeScript Types
// Matches the database schema for slide_templates, template_slot_mappings, 
// generated_presentations, and slide_generation_preferences tables

// =====================
// ENUMS
// =====================

export type SlideTemplateType = 
  | 'discovery' 
  | 'proposal' 
  | 'qbr' 
  | 'case_study' 
  | 'executive_summary' 
  | 'custom';

export type SlideGenerationMode = 'template_based' | 'ai_creative';

export type SlidePersonalizationLevel = 'account' | 'deal' | 'contact';

export type SlotMappingType = 'direct' | 'ai_generated' | 'conditional' | 'static';

export type SlideElementType = 'text' | 'image' | 'shape' | 'chart';

export type SlotFormatType = 
  | 'currency' 
  | 'date' 
  | 'percentage' 
  | 'title_case' 
  | 'uppercase';

// =====================
// INTERFACES
// =====================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConditionLogic {
  if: string; // e.g., 'deal.amount > 100000'
  show: boolean;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
}

export interface FontPreferences {
  heading: string;
  body: string;
  size_scale: 'small' | 'default' | 'large';
}

export interface ExtractedSlideElement {
  element_id: string;
  element_type: SlideElementType;
  content?: string;
  bounding_box?: BoundingBox;
  style?: Record<string, unknown>;
}

export interface ExtractedSlideStructure {
  slides: {
    index: number;
    title?: string;
    elements: ExtractedSlideElement[];
    layout_type?: string;
  }[];
  metadata?: {
    width: number;
    height: number;
    slide_count: number;
  };
}

export interface AiCallRecord {
  slot_name: string;
  prompt: string;
  response: string;
  model: string;
  tokens_used: number;
  latency_ms: number;
  timestamp: string;
}

// =====================
// DATABASE TABLE TYPES
// =====================

export interface SlideTemplate {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  template_type: SlideTemplateType;
  stage_alignment: string[];
  storage_path?: string;
  thumbnail_path?: string;
  slide_count?: number;
  extracted_structure: ExtractedSlideStructure;
  is_ai_base_template: boolean;
  is_active: boolean;
  is_default: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SlideTemplateInsert {
  organization_id: string;
  name: string;
  description?: string;
  template_type?: SlideTemplateType;
  stage_alignment?: string[];
  storage_path?: string;
  thumbnail_path?: string;
  slide_count?: number;
  extracted_structure?: ExtractedSlideStructure;
  is_ai_base_template?: boolean;
  is_active?: boolean;
  is_default?: boolean;
  created_by?: string;
}

export interface SlideTemplateUpdate {
  name?: string;
  description?: string;
  template_type?: SlideTemplateType;
  stage_alignment?: string[];
  storage_path?: string;
  thumbnail_path?: string;
  slide_count?: number;
  extracted_structure?: ExtractedSlideStructure;
  is_ai_base_template?: boolean;
  is_active?: boolean;
  is_default?: boolean;
}

export interface TemplateSlotMapping {
  id: string;
  template_id: string;
  slide_index: number;
  element_id: string;
  element_type: SlideElementType;
  placeholder_text?: string;
  bounding_box?: BoundingBox;
  slot_name: string;
  mapping_type: SlotMappingType;
  data_source?: string;
  ai_prompt?: string;
  ai_model: string;
  ai_max_tokens: number;
  ai_temperature: number;
  condition_logic?: ConditionLogic;
  max_characters?: number;
  format_as?: SlotFormatType;
  fallback_value?: string;
  display_order: number;
  created_at: string;
}

export interface TemplateSlotMappingInsert {
  template_id: string;
  slide_index: number;
  element_id: string;
  element_type?: SlideElementType;
  placeholder_text?: string;
  bounding_box?: BoundingBox;
  slot_name: string;
  mapping_type?: SlotMappingType;
  data_source?: string;
  ai_prompt?: string;
  ai_model?: string;
  ai_max_tokens?: number;
  ai_temperature?: number;
  condition_logic?: ConditionLogic;
  max_characters?: number;
  format_as?: SlotFormatType;
  fallback_value?: string;
  display_order?: number;
}

export interface TemplateSlotMappingUpdate {
  slide_index?: number;
  element_id?: string;
  element_type?: SlideElementType;
  placeholder_text?: string;
  bounding_box?: BoundingBox;
  slot_name?: string;
  mapping_type?: SlotMappingType;
  data_source?: string;
  ai_prompt?: string;
  ai_model?: string;
  ai_max_tokens?: number;
  ai_temperature?: number;
  condition_logic?: ConditionLogic;
  max_characters?: number;
  format_as?: SlotFormatType;
  fallback_value?: string;
  display_order?: number;
}

export interface GeneratedPresentation {
  id: string;
  organization_id: string;
  user_id: string;
  template_id?: string;
  generation_mode: SlideGenerationMode;
  personalization_level: SlidePersonalizationLevel;
  account_id?: string;
  deal_id?: string;
  contact_id?: string;
  storage_path: string;
  file_name: string;
  slot_values_used: Record<string, unknown>;
  ai_calls_made: AiCallRecord[];
  generation_time_ms?: number;
  version: number;
  created_at: string;
}

export interface GeneratedPresentationInsert {
  organization_id: string;
  user_id: string;
  template_id?: string;
  generation_mode?: SlideGenerationMode;
  personalization_level?: SlidePersonalizationLevel;
  account_id?: string;
  deal_id?: string;
  contact_id?: string;
  storage_path: string;
  file_name: string;
  slot_values_used?: Record<string, unknown>;
  ai_calls_made?: AiCallRecord[];
  generation_time_ms?: number;
  version?: number;
}

export interface SlideGenerationPreferences {
  id: string;
  organization_id: string;
  brand_colors: BrandColors;
  font_preferences: FontPreferences;
  logo_storage_path?: string;
  default_ai_model: string;
  style_keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface SlideGenerationPreferencesInsert {
  organization_id: string;
  brand_colors?: BrandColors;
  font_preferences?: FontPreferences;
  logo_storage_path?: string;
  default_ai_model?: string;
  style_keywords?: string[];
}

export interface SlideGenerationPreferencesUpdate {
  brand_colors?: BrandColors;
  font_preferences?: FontPreferences;
  logo_storage_path?: string;
  default_ai_model?: string;
  style_keywords?: string[];
}

// =====================
// STORAGE PATH HELPERS
// =====================

export const SLIDE_TEMPLATES_BUCKET = 'slide-templates';
export const GENERATED_SLIDES_BUCKET = 'generated-slides';

/**
 * Generate storage path for a template file
 */
export function getTemplateStoragePath(
  organizationId: string,
  templateId: string,
  extension: string = 'pptx'
): string {
  return `${organizationId}/${templateId}.${extension}`;
}

/**
 * Generate storage path for a generated presentation
 */
export function getGeneratedPresentationPath(
  organizationId: string,
  presentationId: string,
  extension: string = 'pptx'
): string {
  return `${organizationId}/${presentationId}.${extension}`;
}

/**
 * Generate storage path for a template thumbnail
 */
export function getTemplateThumbnailPath(
  organizationId: string,
  templateId: string
): string {
  return `${organizationId}/thumbnails/${templateId}.png`;
}

// =====================
// DATA SOURCE HELPERS
// =====================

/**
 * Available data sources for slot mappings
 */
export const DATA_SOURCES = {
  account: [
    'account.name',
    'account.industry',
    'account.website',
    'account.phone',
    'account.address',
    'account.description',
  ],
  deal: [
    'deal.name',
    'deal.amount',
    'deal.stage',
    'deal.probability',
    'deal.expected_close_date',
    'deal.description',
    'deal.key_use_case',
    'deal.products_positioned',
  ],
  contact: [
    'contact.full_name',
    'contact.first_name',
    'contact.last_name',
    'contact.email',
    'contact.phone',
    'contact.title',
    'contact.company',
  ],
} as const;

export type DataSourcePath = 
  | typeof DATA_SOURCES.account[number]
  | typeof DATA_SOURCES.deal[number]
  | typeof DATA_SOURCES.contact[number];

// =====================
// TEMPLATE TYPE METADATA
// =====================

export const TEMPLATE_TYPE_LABELS: Record<SlideTemplateType, string> = {
  discovery: 'Discovery Call',
  proposal: 'Proposal Deck',
  qbr: 'Quarterly Business Review',
  case_study: 'Case Study',
  executive_summary: 'Executive Summary',
  custom: 'Custom Template',
};

export const TEMPLATE_TYPE_DESCRIPTIONS: Record<SlideTemplateType, string> = {
  discovery: 'Introduction and needs assessment presentations',
  proposal: 'Solution proposals and pricing presentations',
  qbr: 'Quarterly performance and roadmap reviews',
  case_study: 'Customer success stories and social proof',
  executive_summary: 'High-level overviews for C-suite audiences',
  custom: 'User-defined presentation templates',
};

// =====================
// DEAL STAGE ALIGNMENT
// =====================

export const DEAL_STAGES = [
  'lead',
  'qualification',
  'discovery',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

export type DealStage = typeof DEAL_STAGES[number];

export const RECOMMENDED_TEMPLATES_BY_STAGE: Record<DealStage, SlideTemplateType[]> = {
  lead: ['discovery'],
  qualification: ['discovery'],
  discovery: ['discovery', 'case_study'],
  proposal: ['proposal', 'case_study'],
  negotiation: ['proposal', 'executive_summary'],
  closed_won: ['qbr'],
  closed_lost: [],
};
