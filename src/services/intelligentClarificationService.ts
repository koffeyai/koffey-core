import { CRMEntity as CRMEntityType } from '@/hooks/useCRM';

export interface ClarificationRequest {
  entityType: CRMEntityType;
  missingFields: string[];
  providedData: any;
  context: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface ClarificationResponse {
  questions: string[];
  suggestions: string[];
  examples: string[];
  canProceed: boolean;
  confidence: number;
}

export class IntelligentClarificationService {
  /**
   * Determines what clarifying questions to ask based on incomplete data
   */
  static generateClarification(request: ClarificationRequest): ClarificationResponse {
    const { entityType, missingFields, providedData, context } = request;
    
    switch (entityType) {
      case 'accounts':
        return this.clarifyAccountCreation(missingFields, providedData, context);
      case 'contacts':
        return this.clarifyContactCreation(missingFields, providedData, context);
      case 'deals':
        return this.clarifyDealCreation(missingFields, providedData, context);
      case 'tasks':
        return this.clarifyTaskCreation(missingFields, providedData, context);
      case 'activities':
        return this.clarifyActivityCreation(missingFields, providedData, context);
      default:
        return this.getGenericClarification(entityType, missingFields);
    }
  }

  private static clarifyAccountCreation(
    missingFields: string[], 
    providedData: any, 
    context: string
  ): ClarificationResponse {
    const questions: string[] = [];
    const suggestions: string[] = [];
    const examples: string[] = [];
    
    // Check if we have at least a company name
    if (!providedData.name) {
      questions.push("What's the name of the company you'd like to add?");
      examples.push("'Add Microsoft as an account'");
      examples.push("'Create an account for ABC Corporation'");
      return {
        questions,
        suggestions: ["Provide the full company name to get started"],
        examples,
        canProceed: false,
        confidence: 0.9
      };
    }

    // We have a name, ask for additional details
    const companyName = providedData.name;
    
    if (missingFields.includes('industry')) {
      questions.push(`What industry is ${companyName} in?`);
      suggestions.push("Technology, Healthcare, Finance, Manufacturing, etc.");
    }
    
    if (missingFields.includes('website')) {
      questions.push(`Do you know ${companyName}'s website?`);
      suggestions.push("Their main company website URL");
    }
    
    if (missingFields.includes('phone')) {
      questions.push(`What's ${companyName}'s main phone number?`);
    }
    
    if (missingFields.includes('address')) {
      questions.push(`Do you have their business address?`);
    }

    examples.push(`"${companyName} is in the technology industry"`);
    examples.push(`"Their website is example.com"`);
    examples.push(`"Phone number is (555) 123-4567"`);

    return {
      questions,
      suggestions: [
        "Provide whatever information you have - I can create the account with partial details",
        "You can always update the account information later"
      ],
      examples,
      canProceed: true, // Can proceed with just name
      confidence: 0.8
    };
  }

  private static clarifyContactCreation(
    missingFields: string[], 
    providedData: any, 
    context: string
  ): ClarificationResponse {
    const questions: string[] = [];
    const suggestions: string[] = [];
    const examples: string[] = [];
    
    // Check essential fields
    if (!providedData.firstName && !providedData.lastName && !providedData.email) {
      questions.push("Who is the contact you'd like to add?");
      examples.push("'Add John Smith as a contact'");
      examples.push("'Create a contact for jane.doe@company.com'");
      return {
        questions,
        suggestions: ["Provide at least a name or email address"],
        examples,
        canProceed: false,
        confidence: 0.9
      };
    }

    const contactName = providedData.firstName ? 
      `${providedData.firstName} ${providedData.lastName || ''}`.trim() : 
      'this contact';
    
    if (missingFields.includes('email')) {
      questions.push(`What's ${contactName}'s email address?`);
    }
    
    if (missingFields.includes('company')) {
      questions.push(`Which company does ${contactName} work for?`);
    }
    
    if (missingFields.includes('title')) {
      questions.push(`What's ${contactName}'s job title?`);
    }
    
    if (missingFields.includes('phone')) {
      questions.push(`Do you have ${contactName}'s phone number?`);
    }

    examples.push(`"Email is john.smith@company.com"`);
    examples.push(`"Works at ABC Corporation"`);
    examples.push(`"Title is Sales Manager"`);

    return {
      questions,
      suggestions: [
        "Email and company are the most important details",
        "You can add more information later if needed"
      ],
      examples,
      canProceed: providedData.firstName || providedData.email,
      confidence: 0.8
    };
  }

  private static clarifyDealCreation(
    missingFields: string[], 
    providedData: any, 
    context: string
  ): ClarificationResponse {
    const questions: string[] = [];
    const suggestions: string[] = [];
    const examples: string[] = [];
    
    if (!providedData.name && !providedData.account_name) {
      questions.push("What deal would you like to create?");
      examples.push("'Create a deal with Microsoft for $50,000'");
      examples.push("'Add a deal called Website Redesign Project'");
      return {
        questions,
        suggestions: ["Provide either a deal name or the company it's with"],
        examples,
        canProceed: false,
        confidence: 0.9
      };
    }

    const dealContext = providedData.name || `deal with ${providedData.account_name}`;
    
    if (missingFields.includes('amount')) {
      questions.push(`What's the value of ${dealContext}?`);
      suggestions.push("Enter the deal amount in dollars");
    }
    
    if (missingFields.includes('stage')) {
      questions.push(`What stage is ${dealContext} in?`);
      suggestions.push("Prospecting, Qualification, Proposal, Negotiation, etc.");
    }
    
    if (missingFields.includes('close_date')) {
      questions.push(`When do you expect ${dealContext} to close?`);
      suggestions.push("Expected close date (MM/DD/YYYY)");
    }

    examples.push(`"Deal amount is $75,000"`);
    examples.push(`"Stage is qualification"`);
    examples.push(`"Expected close date is 12/31/2024"`);

    return {
      questions,
      suggestions: [
        "Deal amount and stage are helpful for tracking progress",
        "You can estimate the close date if you're not sure"
      ],
      examples,
      canProceed: true,
      confidence: 0.7
    };
  }

  private static clarifyTaskCreation(
    missingFields: string[], 
    providedData: any, 
    context: string
  ): ClarificationResponse {
    const questions: string[] = [];
    const examples: string[] = [];
    
    if (!providedData.title) {
      questions.push("What task would you like to create?");
      examples.push("'Create a task to follow up with client'");
      examples.push("'Add a task: prepare proposal'");
      return {
        questions,
        suggestions: ["Describe what needs to be done"],
        examples,
        canProceed: false,
        confidence: 0.9
      };
    }

    if (missingFields.includes('due_date')) {
      questions.push(`When is "${providedData.title}" due?`);
      examples.push("'Due tomorrow'");
      examples.push("'Due date is 12/15/2024'");
    }
    
    if (missingFields.includes('priority')) {
      questions.push(`What's the priority of "${providedData.title}"?`);
      examples.push("'High priority'");
      examples.push("'Low priority'");
    }

    return {
      questions,
      suggestions: [
        "Due date helps with prioritization",
        "Priority can be: high, medium, or low"
      ],
      examples,
      canProceed: true,
      confidence: 0.8
    };
  }

  private static clarifyActivityCreation(
    missingFields: string[], 
    providedData: any, 
    context: string
  ): ClarificationResponse {
    const questions: string[] = [];
    const examples: string[] = [];
    
    if (!providedData.title && !providedData.type) {
      questions.push("What activity would you like to log?");
      examples.push("'Log a call with John Smith'");
      examples.push("'Record a meeting about project planning'");
      return {
        questions,
        suggestions: ["Describe the activity that took place"],
        examples,
        canProceed: false,
        confidence: 0.9
      };
    }

    if (missingFields.includes('type')) {
      questions.push("What type of activity was this?");
      examples.push("Call, Meeting, Email, Demo, Note");
    }
    
    if (missingFields.includes('activity_date')) {
      questions.push("When did this activity happen?");
      examples.push("'Today'");
      examples.push("'Yesterday'");
      examples.push("'12/10/2024'");
    }

    return {
      questions,
      suggestions: [
        "Activity type helps categorize your interactions",
        "Date defaults to today if not specified"
      ],
      examples,
      canProceed: true,
      confidence: 0.8
    };
  }

  private static getGenericClarification(
    entityType: CRMEntityType, 
    missingFields: string[]
  ): ClarificationResponse {
    return {
      questions: [`I need more information to create this ${entityType.slice(0, -1)}.`],
      suggestions: [`Please provide the required fields: ${missingFields.join(', ')}`],
      examples: [`Try being more specific about what you want to create.`],
      canProceed: false,
      confidence: 0.5
    };
  }

  /**
   * Determines if we have enough information to proceed with creation
   */
  static canProceedWithCreation(entityType: CRMEntityType, data: any): boolean {
    switch (entityType) {
      case 'accounts':
        return !!(data.name && data.name.length > 2);
      case 'contacts':
        return !!(data.firstName || data.email);
      case 'deals':
        return !!(data.name || data.account_name);
      case 'tasks':
        return !!(data.title);
      case 'activities':
        return !!(data.title || data.type);
      default:
        return false;
    }
  }

  /**
   * Validates that extracted data makes sense and isn't fragments
   */
  static validateExtractedData(entityType: CRMEntityType, data: any): {
    isValid: boolean;
    issues: string[];
    confidence: number;
  } {
    const issues: string[] = [];
    let confidence = 1.0;

    // Common validation for all entities
    Object.values(data).forEach((value: any) => {
      if (typeof value === 'string') {
        // Check for common extraction errors
        if (/\b(in|as|a|co|the|and|or|but|if|when|where|how|what|why|who)\b/i.test(value)) {
          issues.push(`"${value}" appears to be a sentence fragment`);
          confidence -= 0.3;
        }
        
        // Check for overly short or long values
        if (value.length < 2) {
          issues.push(`"${value}" is too short to be valid`);
          confidence -= 0.2;
        }
        
        if (value.length > 100) {
          issues.push(`"${value}" is unusually long`);
          confidence -= 0.1;
        }
      }
    });

    // Entity-specific validation
    switch (entityType) {
      case 'accounts':
        if (data.name) {
          // Company names should be properly capitalized
          if (data.name === data.name.toLowerCase()) {
            issues.push("Company name should be properly capitalized");
            confidence -= 0.2;
          }
          
          // Check for common name patterns
          if (!/^[A-Z]/.test(data.name)) {
            issues.push("Company name should start with a capital letter");
            confidence -= 0.1;
          }
        }
        break;
        
      case 'contacts':
        if (data.firstName && !/^[A-Z][a-z]+$/.test(data.firstName)) {
          issues.push("First name should be properly formatted");
          confidence -= 0.2;
        }
        
        if (data.lastName && !/^[A-Z][a-z]+$/.test(data.lastName)) {
          issues.push("Last name should be properly formatted");
          confidence -= 0.2;
        }
        
        if (data.email && !/@/.test(data.email)) {
          issues.push("Email should contain @ symbol");
          confidence -= 0.3;
        }
        break;
    }

    return {
      isValid: issues.length === 0,
      issues,
      confidence: Math.max(confidence, 0.1)
    };
  }
}