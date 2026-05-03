import { CRMEntity as CRMEntityType, EntityConfig } from '@/hooks/useCRM';
import { ValidationError } from '@/services/enhancedFormValidationService';
import { launchChatWith } from '@/stores/unifiedChatStore';

// Preserved types for backward compatibility with ConversationalFormAssistant
export interface ConversationContext {
  sessionId: string;
  entityType: CRMEntityType;
  formData: any;
  conversationHistory: ConversationTurn[];
  userProfile: UserProfile;
  currentStage: ConversationStage;
  partialInputs: { [field: string]: any };
  lastInteractionTime: number;
  escapeHatchesOffered: string[];
  progressAcknowledged: boolean;
}

export interface ConversationTurn {
  timestamp: number;
  speaker: 'assistant' | 'user';
  message: string;
  intent: ConversationIntent;
  fieldsDiscussed: string[];
  emotionalTone: 'positive' | 'neutral' | 'frustrated' | 'confused';
  successfulFieldCompletions: string[];
}

export interface UserProfile {
  experienceLevel: 'novice' | 'intermediate' | 'expert';
  preferredCommunicationStyle: 'detailed' | 'concise' | 'visual' | 'encouraging';
  attentionSpan: 'short' | 'medium' | 'long';
  errorTolerance: 'low' | 'medium' | 'high';
  lastSuccessfulCompletionTime?: number;
  frustrationLevel: number;
}

export type ConversationStage =
  | 'greeting'
  | 'problem_identification'
  | 'data_gathering'
  | 'validation'
  | 'completion'
  | 'recovery'
  | 'celebration';

export type ConversationIntent =
  | 'field_completion'
  | 'clarification'
  | 'encouragement'
  | 'alternative_suggestion'
  | 'escape_hatch_offer'
  | 'progress_celebration'
  | 'error_recovery';

export interface ConversationalPrompt {
  message: string;
  suggestedResponses: string[];
  escapeHatches: EscapeHatch[];
  progressIndicator: ProgressIndicator;
  emotionalTone: 'supportive' | 'encouraging' | 'collaborative' | 'understanding';
  contextualExamples: string[];
}

export interface EscapeHatch {
  type: 'save_draft' | 'skip_optional' | 'bulk_mode' | 'template_use' | 'help_request';
  label: string;
  description: string;
  conversationalOffer: string;
  confidence: number;
}

export interface ProgressIndicator {
  completedFields: number;
  totalFields: number;
  celebrationMessage: string;
  nextStepHint: string;
  estimatedTimeRemaining: string;
}

/**
 * Simplified stub — delegates to the chat system for conversational recovery
 * instead of using rigid keyword-matching form loops.
 */
export class ConversationalRecoveryFlow {
  static initiateeRecovery(
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any,
    errors: ValidationError[],
    _userProfile?: UserProfile
  ): ConversationContext {
    const sessionId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Delegate to chat — let the LLM handle recovery conversationally
    const errorSummary = errors.map(e => e.field || e.message).join(', ');
    launchChatWith(
      `Help me fix these fields for a new ${entityType.slice(0, -1)}: ${errorSummary}`,
      { entityType, formData }
    );

    return {
      sessionId,
      entityType,
      formData,
      conversationHistory: [],
      userProfile: {
        experienceLevel: 'intermediate',
        preferredCommunicationStyle: 'concise',
        attentionSpan: 'medium',
        errorTolerance: 'medium',
        frustrationLevel: 0
      },
      currentStage: 'data_gathering',
      partialInputs: {},
      lastInteractionTime: Date.now(),
      escapeHatchesOffered: [],
      progressAcknowledged: false
    };
  }

  static handleUserResponse(
    _sessionId: string,
    _userMessage: string,
    _extractedData?: any
  ): ConversationalPrompt | null {
    // Let the chat system handle responses naturally
    return null;
  }
}
