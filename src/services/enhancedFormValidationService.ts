import { CRMEntity as CRMEntityType, EntityConfig } from '@/hooks/useCRM';
import { launchChatWith } from '@/stores/unifiedChatStore';

export interface ValidationError {
  field: string;
  message: string;
  type: 'required' | 'invalid' | 'database' | 'dependency' | 'suggestion';
  severity: 'critical' | 'moderate' | 'low';
  category: 'blocker' | 'enhancement' | 'optimization';
  userFriendlyMessage?: string;
  recoveryStrategy?: 'guided' | 'bulk' | 'quick' | 'predictive';
}

export interface ErrorPattern {
  criticalBlockers: ValidationError[];
  softSuggestions: ValidationError[];
  dataEnrichments: ValidationError[];
  userProfile: UserProfile;
  recoveryStrategy: 'guided' | 'bulk' | 'quick' | 'predictive';
  estimatedCompletionTime: number; // in seconds
}

export interface UserProfile {
  experienceLevel: 'novice' | 'intermediate' | 'expert';
  preferredInteractionStyle: 'detailed' | 'concise' | 'visual';
  frequentEntityTypes: CRMEntityType[];
  successfulCompletionHistory: number;
  lastInteractionTone: 'positive' | 'neutral' | 'frustrated';
}

export interface ChatPromptData {
  entityType: CRMEntityType;
  pattern: ErrorPattern;
  adaptiveMessage: string;
  contextualSuggestions: string[];
  existingData: any;
  recoveryActions: RecoveryAction[];
}

export interface RecoveryAction {
  type: 'fill_field' | 'suggest_value' | 'skip_optional' | 'save_draft' | 'bulk_import';
  label: string;
  description: string;
  confidence: number;
}

export class EnhancedFormValidationService {
  static validateForm(
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any,
    userProfile?: UserProfile
  ): { isValid: boolean; errors: ValidationError[]; pattern: ErrorPattern } {
    const errors: ValidationError[] = [];
    
    // Enhanced field validation with dependency checking
    const requiredFieldErrors = this.validateRequiredFields(config, formData);
    const formatErrors = this.validateFieldFormats(config, formData);
    const dependencyErrors = this.validateFieldDependencies(entityType, formData);
    const enhancementSuggestions = this.generateEnhancementSuggestions(entityType, formData);
    
    errors.push(...requiredFieldErrors, ...formatErrors, ...dependencyErrors, ...enhancementSuggestions);
    
    // Analyze error pattern with psychological insights
    const pattern = this.analyzeErrorPattern(errors, userProfile || this.detectUserProfile(formData));
    
    return {
      isValid: pattern.criticalBlockers.length === 0,
      errors,
      pattern
    };
  }

  static validateRequiredFields(config: EntityConfig<any>, formData: any): ValidationError[] {
    const errors: ValidationError[] = [];
    
    config.requiredFields.forEach(fieldName => {
      const value = formData[fieldName];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        const fieldConfig = config.formFields.find(f => f.field === fieldName);
        errors.push({
          field: fieldName,
          message: `${fieldConfig?.label || fieldName} is required`,
          type: 'required',
          severity: 'critical',
          category: 'blocker',
          userFriendlyMessage: this.generateUserFriendlyRequiredMessage(fieldName, fieldConfig?.label),
          recoveryStrategy: 'guided'
        });
      }
    });
    
    return errors;
  }

  static validateFieldFormats(config: EntityConfig<any>, formData: any): ValidationError[] {
    const errors: ValidationError[] = [];
    
    config.formFields.forEach(fieldConfig => {
      const value = formData[fieldConfig.field];
      if (value && typeof value === 'string' && value.trim() !== '') {
        const validationResult = this.validateFieldFormat(fieldConfig, value);
        if (!validationResult.isValid) {
          errors.push({
            field: fieldConfig.field,
            message: validationResult.message,
            type: 'invalid',
            severity: validationResult.severity,
            category: 'blocker',
            userFriendlyMessage: validationResult.userFriendlyMessage,
            recoveryStrategy: 'quick'
          });
        }
      }
    });
    
    return errors;
  }

  static validateFieldDependencies(entityType: CRMEntityType, formData: any): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Entity-specific dependency rules
    switch (entityType) {
      case 'contacts':
        if (!formData.email && !formData.phone) {
          errors.push({
            field: 'email',
            message: 'Either email or phone is required',
            type: 'dependency',
            severity: 'critical',
            category: 'blocker',
            userFriendlyMessage: "I need at least one way to reach this contact - either their email or phone number.",
            recoveryStrategy: 'guided'
          });
        }
        break;
        
      case 'deals':
        if (formData.amount && !formData.close_date) {
          errors.push({
            field: 'close_date',
            message: 'Close date recommended when amount is specified',
            type: 'dependency',
            severity: 'moderate',
            category: 'enhancement',
            userFriendlyMessage: "Since you've added a deal amount, when do you expect this to close?",
            recoveryStrategy: 'predictive'
          });
        }
        break;
    }
    
    return errors;
  }

  static generateEnhancementSuggestions(entityType: CRMEntityType, formData: any): ValidationError[] {
    const suggestions: ValidationError[] = [];
    
    // Smart suggestions based on existing data
    if (entityType === 'contacts' && formData.email && !formData.company) {
      const domain = formData.email.split('@')[1];
      suggestions.push({
        field: 'company',
        message: 'Company suggestion available',
        type: 'suggestion',
        severity: 'low',
        category: 'optimization',
        userFriendlyMessage: `Is this contact from ${domain.replace('.com', '')}? I can auto-fill the company name.`,
        recoveryStrategy: 'predictive'
      });
    }
    
    return suggestions;
  }

  static analyzeErrorPattern(errors: ValidationError[], userProfile: UserProfile): ErrorPattern {
    const criticalBlockers = errors.filter(e => e.category === 'blocker');
    const softSuggestions = errors.filter(e => e.category === 'enhancement');
    const dataEnrichments = errors.filter(e => e.category === 'optimization');
    
    // Determine recovery strategy based on error complexity and user profile
    let recoveryStrategy: 'guided' | 'bulk' | 'quick' | 'predictive' = 'guided';
    
    if (criticalBlockers.length === 1 && userProfile.experienceLevel === 'expert') {
      recoveryStrategy = 'quick';
    } else if (criticalBlockers.length > 3) {
      recoveryStrategy = 'bulk';
    } else if (dataEnrichments.length > criticalBlockers.length) {
      recoveryStrategy = 'predictive';
    }
    
    // Estimate completion time based on error complexity
    const estimatedCompletionTime = this.calculateCompletionTime(criticalBlockers, userProfile);
    
    return {
      criticalBlockers,
      softSuggestions,
      dataEnrichments,
      userProfile,
      recoveryStrategy,
      estimatedCompletionTime
    };
  }

  static detectUserProfile(formData: any): UserProfile {
    // Analyze form data patterns to infer user experience
    const completedFields = Object.values(formData).filter(value => 
      value !== null && value !== undefined && value !== ''
    ).length;
    
    const totalFields = Object.keys(formData).length;
    const completionRatio = completedFields / totalFields;
    
    let experienceLevel: 'novice' | 'intermediate' | 'expert' = 'novice';
    if (completionRatio > 0.7) experienceLevel = 'expert';
    else if (completionRatio > 0.4) experienceLevel = 'intermediate';
    
    return {
      experienceLevel,
      preferredInteractionStyle: experienceLevel === 'expert' ? 'concise' : 'detailed',
      frequentEntityTypes: [],
      successfulCompletionHistory: 0,
      lastInteractionTone: 'neutral'
    };
  }

  static handleFormValidationFailure(
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any,
    pattern: ErrorPattern
  ): void {
    const chatPrompt = this.generateAdaptiveChatPrompt(entityType, config, formData, pattern);
    
    // Launch chat with enhanced context
    launchChatWith(chatPrompt.adaptiveMessage, {
      type: 'form_recovery',
      entityType,
      formData,
      pattern,
      recoveryActions: chatPrompt.recoveryActions,
      contextualSuggestions: chatPrompt.contextualSuggestions,
      timestamp: Date.now()
    });
  }

  static generateAdaptiveChatPrompt(
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any,
    pattern: ErrorPattern
  ): ChatPromptData {
    const { criticalBlockers, userProfile, recoveryStrategy } = pattern;
    
    let message = this.generatePersonalizedGreeting(userProfile);
    
    // Add encouraging progress acknowledgment
    const completedFields = Object.values(formData).filter(v => v).length;
    if (completedFields > 0) {
      message += this.generateProgressAcknowledgment(completedFields, entityType);
    }
    
    // Generate context-aware error explanation
    message += this.generateErrorExplanation(criticalBlockers, userProfile, entityType);
    
    // Add recovery guidance based on strategy
    message += this.generateRecoveryGuidance(recoveryStrategy, pattern);
    
    // Generate contextual suggestions
    const contextualSuggestions = this.generateContextualSuggestions(entityType, formData, pattern);
    
    // Create recovery actions
    const recoveryActions = this.generateRecoveryActions(pattern, formData);
    
    return {
      entityType,
      pattern,
      adaptiveMessage: message,
      contextualSuggestions,
      existingData: formData,
      recoveryActions
    };
  }

  private static generatePersonalizedGreeting(userProfile: UserProfile): string {
    switch (userProfile.experienceLevel) {
      case 'expert':
        return "I noticed a few quick items to wrap up. ";
      case 'intermediate':
        return "You're almost there! Just need a few more details. ";
      default:
        return "I'm here to help you complete this form step by step. ";
    }
  }

  private static generateProgressAcknowledgment(completedFields: number, entityType: CRMEntityType): string {
    const entityName = entityType.slice(0, -1); // Remove 's' from plural
    return `Great work on the ${entityName} details you've already provided! `;
  }

  private static generateErrorExplanation(
    errors: ValidationError[],
    userProfile: UserProfile,
    entityType: CRMEntityType
  ): string {
    if (errors.length === 0) return '';
    
    let explanation = '';
    
    if (userProfile.preferredInteractionStyle === 'detailed') {
      explanation += `Here's what I need to complete your ${entityType.slice(0, -1)}:\n\n`;
      
      errors.forEach((error, index) => {
        explanation += `${index + 1}. ${error.userFriendlyMessage || error.message}\n`;
      });
    } else {
      explanation += `I need: ${errors.map(e => e.field.replace('_', ' ')).join(', ')}. `;
    }
    
    return explanation;
  }

  private static generateRecoveryGuidance(
    strategy: 'guided' | 'bulk' | 'quick' | 'predictive',
    pattern: ErrorPattern
  ): string {
    switch (strategy) {
      case 'quick':
        return "\nJust tell me these details and I'll fill everything in! ";
      case 'bulk':
        return "\nYou can provide all the information at once, or I can guide you through each field. ";
      case 'predictive':
        return "\nI can make some smart suggestions based on what you've entered. ";
      default:
        return "\nLet me walk you through this step by step. ";
    }
  }

  private static generateContextualSuggestions(
    entityType: CRMEntityType,
    formData: any,
    pattern: ErrorPattern
  ): string[] {
    const suggestions: string[] = [];
    
    // Entity-specific contextual help
    switch (entityType) {
      case 'deals':
        if (!formData.amount) {
          suggestions.push("💰 Deal amounts help prioritize your pipeline");
        }
        if (!formData.close_date) {
          suggestions.push("📅 Expected close dates improve forecasting accuracy");
        }
        break;
        
      case 'contacts':
        if (!formData.company) {
          suggestions.push("🏢 Company names help with account organization");
        }
        break;
    }
    
    return suggestions;
  }

  private static generateRecoveryActions(pattern: ErrorPattern, formData: any): RecoveryAction[] {
    const actions: RecoveryAction[] = [];
    
    // Always provide save draft option
    actions.push({
      type: 'save_draft',
      label: 'Save as Draft',
      description: 'Save what you have so far and complete later',
      confidence: 1.0
    });
    
    // Add skip option for non-critical fields
    if (pattern.softSuggestions.length > 0) {
      actions.push({
        type: 'skip_optional',
        label: 'Skip Optional Fields',
        description: 'Create with just the required information',
        confidence: 0.8
      });
    }
    
    // Add bulk import for multiple similar items
    if (pattern.criticalBlockers.length > 3) {
      actions.push({
        type: 'bulk_import',
        label: 'Bulk Import Mode',
        description: 'Upload multiple records at once',
        confidence: 0.7
      });
    }
    
    return actions;
  }

  private static generateUserFriendlyRequiredMessage(fieldName: string, label?: string): string {
    const displayName = label || fieldName.replace('_', ' ');
    
    const friendlyMessages: { [key: string]: string } = {
      'email': "What's their email address? This helps me keep in touch with them.",
      'phone': "What's their phone number? Good to have for quick calls.",
      'first_name': "What's their first name?",
      'last_name': "And their last name?",
      'company': "Which company are they from?",
      'account_name': "What's the company name for this deal?",
      'amount': "What's the deal worth? Even a rough estimate helps.",
      'close_date': "When do you expect this deal to close?",
      'title': "What would you like to call this?",
      'due_date': "When does this need to be done?"
    };
    
    return friendlyMessages[fieldName] || `I need the ${displayName} to continue.`;
  }

  private static validateFieldFormat(fieldConfig: any, value: string) {
    switch (fieldConfig.type) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidEmail = emailRegex.test(value);
        return {
          isValid: isValidEmail,
          message: isValidEmail ? '' : 'Please enter a valid email address',
          userFriendlyMessage: isValidEmail ? '' : "That email doesn't look quite right. Could you check the format?",
          severity: 'moderate' as const
        };
        
      case 'phone':
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        const isValidPhone = phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
        return {
          isValid: isValidPhone,
          message: isValidPhone ? '' : 'Please enter a valid phone number',
          userFriendlyMessage: isValidPhone ? '' : "Could you check that phone number format?",
          severity: 'moderate' as const
        };
        
      case 'number':
        const isValidNumber = !isNaN(Number(value));
        return {
          isValid: isValidNumber,
          message: isValidNumber ? '' : 'Please enter a valid number',
          userFriendlyMessage: isValidNumber ? '' : "That should be a number. Could you try again?",
          severity: 'moderate' as const
        };
        
      default:
        return { isValid: true, message: '', userFriendlyMessage: '', severity: 'low' as const };
    }
  }

  private static calculateCompletionTime(errors: ValidationError[], userProfile: UserProfile): number {
    // Base time per field in seconds
    let baseTime = 30;
    
    // Adjust for user experience
    switch (userProfile.experienceLevel) {
      case 'expert':
        baseTime = 15;
        break;
      case 'intermediate':
        baseTime = 20;
        break;
      default:
        baseTime = 30;
    }
    
    return errors.length * baseTime;
  }

  // ===== BACKWARD COMPATIBILITY METHODS =====
  
  /**
   * Simple validation result interface for backward compatibility
   */
  static validateFormSimple(
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any
  ): FormValidationResult {
    const result = this.validateForm(entityType, config, formData);
    return {
      isValid: result.isValid,
      errors: result.errors.map(e => ({
        field: e.field,
        message: e.message,
        type: e.type === 'dependency' || e.type === 'suggestion' ? 'required' : e.type as 'required' | 'invalid' | 'database'
      })),
      missingRequiredFields: result.errors.filter(e => e.type === 'required').map(e => e.field),
      invalidFields: result.errors.filter(e => e.type === 'invalid').map(e => e.field)
    };
  }

  /**
   * Simple validation failure handler for backward compatibility
   */
  static handleFormValidationFailureSimple(
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any,
    validationResult: FormValidationResult
  ): void {
    const fullResult = this.validateForm(entityType, config, formData);
    this.handleFormValidationFailure(entityType, config, formData, fullResult.pattern);
  }
}

// ===== BACKWARD COMPATIBILITY EXPORTS =====

/**
 * Simple validation error interface for backward compatibility
 */
export interface SimpleValidationError {
  field: string;
  message: string;
  type: 'required' | 'invalid' | 'database';
}

/**
 * Simple form validation result for backward compatibility
 */
export interface FormValidationResult {
  isValid: boolean;
  errors: SimpleValidationError[];
  missingRequiredFields: string[];
  invalidFields: string[];
}

/**
 * @deprecated Use EnhancedFormValidationService instead
 * Backward compatibility alias
 */
export const FormValidationService = {
  validateForm: (entityType: CRMEntityType, config: EntityConfig<any>, formData: any) => 
    EnhancedFormValidationService.validateFormSimple(entityType, config, formData),
  
  handleFormValidationFailure: (
    entityType: CRMEntityType,
    config: EntityConfig<any>,
    formData: any,
    validationResult: FormValidationResult
  ) => EnhancedFormValidationService.handleFormValidationFailureSimple(entityType, config, formData, validationResult),
  
  generateChatPrompt: (entityType: CRMEntityType, config: EntityConfig<any>, formData: any, errors: SimpleValidationError[]) => {
    const result = EnhancedFormValidationService.validateForm(entityType, config, formData);
    const prompt = EnhancedFormValidationService.generateAdaptiveChatPrompt(entityType, config, formData, result.pattern);
    return {
      entityType,
      missingFields: errors,
      existingData: formData,
      chatMessage: prompt.adaptiveMessage
    };
  }
};