export interface UserContentPreferences {
  id: string;
  user_id: string;
  organization_id?: string;
  
  // Basic AI Style (existing)
  tone: 'casual' | 'professional' | 'formal';
  verbosity: 'concise' | 'balanced' | 'detailed';
  format_preference: 'bullets' | 'paragraphs' | 'mixed';
  custom_instructions: string | null;
  
  // Communication Style (new)
  communication_style: CommunicationStyle;
  energy_level: EnergyLevel;
  
  // Personal Voice (new)
  signature_phrases: string[];
  avoid_phrases: string[];
  
  // Rep Identity (new)
  rep_title: string | null;
  rep_bio: string | null;
  rep_photo_path: string | null;
  rep_linkedin_url: string | null;
  rep_calendar_url: string | null;
  
  // Metadata
  updated_at: string;
  created_at?: string;
}

export type CommunicationStyle = 'consultative' | 'direct' | 'storyteller' | 'technical' | 'professional';
export type EnergyLevel = 'warm_enthusiastic' | 'calm_measured' | 'bold_confident' | 'balanced';

export const COMMUNICATION_STYLES = [
  { value: 'consultative' as const, label: 'Consultative', description: 'Question-led, discovery-focused' },
  { value: 'direct' as const, label: 'Direct', description: 'Straightforward, gets to the point' },
  { value: 'storyteller' as const, label: 'Storyteller', description: 'Narrative-driven, uses examples' },
  { value: 'technical' as const, label: 'Technical', description: 'Data-focused, precise language' },
  { value: 'professional' as const, label: 'Professional', description: 'Balanced, business-appropriate' },
] as const;

export const ENERGY_LEVELS = [
  { value: 'warm_enthusiastic' as const, label: 'Warm & Enthusiastic', description: 'High energy, personable' },
  { value: 'calm_measured' as const, label: 'Calm & Measured', description: 'Steady, reassuring tone' },
  { value: 'bold_confident' as const, label: 'Bold & Confident', description: 'Assertive, conviction-driven' },
  { value: 'balanced' as const, label: 'Balanced', description: 'Adapts to context' },
] as const;

export const DEFAULT_PREFERENCES: Partial<UserContentPreferences> = {
  tone: 'professional',
  verbosity: 'balanced',
  format_preference: 'mixed',
  communication_style: 'professional',
  energy_level: 'balanced',
  signature_phrases: [],
  avoid_phrases: [],
  custom_instructions: null,
  rep_title: null,
  rep_bio: null,
  rep_photo_path: null,
  rep_linkedin_url: null,
  rep_calendar_url: null,
};
