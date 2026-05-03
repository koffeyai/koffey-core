type CRMEntityType = 'contacts' | 'accounts' | 'deals' | 'activities' | 'tasks';
import { launchChatWithValidation } from '@/stores/unifiedChatStore';

export interface BulkValidationResult {
  validRecords: any[];
  invalidRecords: any[];
  patterns: BulkErrorPattern[];
  suggestions: BulkSuggestion[];
  confidence: number;
}

export interface BulkErrorPattern {
  type: 'missing_field' | 'format_error' | 'duplicate' | 'invalid_relationship';
  field: string;
  affectedCount: number;
  records: any[];
  suggestedFix?: string;
  autoFixable: boolean;
  examples: string[];
}

export interface BulkSuggestion {
  type: 'smart_default' | 'pattern_completion' | 'domain_inference' | 'relationship_mapping';
  field: string;
  value: any;
  confidence: number;
  affectedRecords: number[];
  reasoning: string;
  requiresConfirmation: boolean;
}

export interface CSVProcessingResult {
  totalRecords: number;
  validRecords: any[];
  errorPatterns: BulkErrorPattern[];
  smartSuggestions: BulkSuggestion[];
  progressiveSteps: ProgressiveValidationStep[];
  rollbackPlan: RollbackStep[];
}

export interface ProgressiveValidationStep {
  priority: 'critical' | 'important' | 'optional';
  title: string;
  description: string;
  affectedRecords: number;
  canSkip: boolean;
  estimatedTime: string;
  fixes: BulkSuggestion[];
}

export interface RollbackStep {
  step: number;
  action: string;
  affectedRecords: number[];
  reversible: boolean;
  backupData?: any;
}

class BulkChatAssistant {
  /**
   * Process CSV file with intelligent error detection and pattern recognition
   */
  async processCSVImport(
    file: File, 
    entityType: CRMEntityType,
    organizationId: string
  ): Promise<CSVProcessingResult> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const headers = this.parseCSVLine(lines[0]);
    const records = lines.slice(1).map((line, index) => ({
      index: index + 1,
      data: this.parseCSVLine(line),
      mapped: this.mapToEntityFields(this.parseCSVLine(line), headers, entityType)
    }));

    // Analyze patterns across all records
    const patterns = await this.detectErrorPatterns(records, entityType);
    const suggestions = await this.generateSmartSuggestions(records, patterns, entityType);
    const progressiveSteps = this.createProgressiveValidationPlan(patterns);
    const rollbackPlan = this.createRollbackPlan(records);

    // Separate valid and invalid records
    const validRecords = records.filter(record => 
      this.validateRecord(record.mapped, entityType).isValid
    );
    
    const errorPatterns = patterns.filter(p => p.affectedCount > 0);

    // If significant issues found, launch conversational recovery
    if (errorPatterns.length > 0 && errorPatterns.some(p => p.type === 'missing_field')) {
      this.launchBulkRecoveryChat(errorPatterns, suggestions, entityType);
    }

    return {
      totalRecords: records.length,
      validRecords: validRecords.map(r => r.mapped),
      errorPatterns,
      smartSuggestions: suggestions,
      progressiveSteps,
      rollbackPlan
    };
  }

  /**
   * Detect common error patterns across bulk records
   */
  private async detectErrorPatterns(
    records: any[], 
    entityType: CRMEntityType
  ): Promise<BulkErrorPattern[]> {
    const patterns: BulkErrorPattern[] = [];
    const requiredFields = this.getRequiredFields(entityType);

    // Pattern 1: Missing required fields
    for (const field of requiredFields) {
      const missingRecords = records.filter(r => !r.mapped[field] || r.mapped[field] === '');
      if (missingRecords.length > 0) {
        const examples = missingRecords.slice(0, 3).map(r => 
          `Row ${r.index}: ${JSON.stringify(r.data).substring(0, 50)}...`
        );

        patterns.push({
          type: 'missing_field',
          field,
          affectedCount: missingRecords.length,
          records: missingRecords,
          suggestedFix: this.getSuggestedFix(field, missingRecords, entityType),
          autoFixable: this.isAutoFixable(field, missingRecords),
          examples
        });
      }
    }

    // Pattern 2: Email domain patterns for contact inference
    if (entityType === 'contacts') {
      const emailDomainPattern = this.detectEmailDomainPatterns(records);
      if (emailDomainPattern) {
        patterns.push(emailDomainPattern);
      }
    }

    // Pattern 3: Duplicate detection
    const duplicatePattern = this.detectDuplicates(records, entityType);
    if (duplicatePattern.affectedCount > 0) {
      patterns.push(duplicatePattern);
    }

    // Pattern 4: Format errors
    const formatErrors = this.detectFormatErrors(records, entityType);
    patterns.push(...formatErrors);

    return patterns;
  }

  /**
   * Generate smart suggestions for bulk fixes
   */
  private async generateSmartSuggestions(
    records: any[], 
    patterns: BulkErrorPattern[],
    entityType: CRMEntityType
  ): Promise<BulkSuggestion[]> {
    const suggestions: BulkSuggestion[] = [];

    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'missing_field':
          if (pattern.field === 'email' && entityType === 'contacts') {
            // Check if we can infer emails from company domain
            const domainSuggestion = this.inferEmailsFromCompany(pattern.records);
            if (domainSuggestion) {
              suggestions.push(domainSuggestion);
            }
          }
          
          if (pattern.field === 'company' && entityType === 'contacts') {
            // Infer company from email domain
            const companySuggestion = this.inferCompanyFromEmail(pattern.records);
            if (companySuggestion) {
              suggestions.push(companySuggestion);
            }
          }
          break;

        case 'format_error':
          // Suggest format corrections
          const formatSuggestion = this.suggestFormatCorrection(pattern);
          if (formatSuggestion) {
            suggestions.push(formatSuggestion);
          }
          break;
      }
    }

    return suggestions;
  }

  /**
   * Launch conversational recovery for bulk operations
   */
  private launchBulkRecoveryChat(
    patterns: BulkErrorPattern[],
    suggestions: BulkSuggestion[],
    entityType: CRMEntityType
  ): void {
    const criticalIssues = patterns.filter(p => 
      p.type === 'missing_field' && this.getRequiredFields(entityType).includes(p.field)
    );

    const totalAffected = patterns.reduce((sum, p) => sum + p.affectedCount, 0);
    
    let prompt = `I found ${totalAffected} records that need attention in your ${entityType} import. Here's what I can help fix:\n\n`;

    // Describe patterns in friendly language
    for (const pattern of criticalIssues.slice(0, 3)) {
      prompt += `• ${pattern.affectedCount} records are missing ${pattern.field}`;
      if (pattern.suggestedFix) {
        prompt += `. I can suggest: ${pattern.suggestedFix}`;
      }
      prompt += `\n`;
    }

    // Highlight smart suggestions
    const highConfidenceSuggestions = suggestions.filter(s => s.confidence > 0.8);
    if (highConfidenceSuggestions.length > 0) {
      prompt += `\n✨ Smart suggestions available:\n`;
      for (const suggestion of highConfidenceSuggestions.slice(0, 2)) {
        prompt += `• ${suggestion.reasoning}\n`;
      }
    }

    prompt += `\nWould you like me to help fix these issues? I can guide you through each step or apply the high-confidence fixes automatically.`;

    launchChatWithValidation(
      [], // No individual field errors, this is bulk
      { patterns, suggestions, entityType },
      entityType,
      'bulk'
    );
  }

  /**
   * Helper methods for pattern detection
   */
  private detectEmailDomainPatterns(records: any[]): BulkErrorPattern | null {
    const domainCounts: Record<string, number> = {};
    const contactsWithoutEmail: any[] = [];

    records.forEach(record => {
      if (record.mapped.email) {
        const domain = record.mapped.email.split('@')[1];
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      } else if (record.mapped.company) {
        contactsWithoutEmail.push(record);
      }
    });

    const dominantDomain = Object.entries(domainCounts)
      .sort(([,a], [,b]) => b - a)[0];

    if (dominantDomain && contactsWithoutEmail.length > 0) {
      return {
        type: 'missing_field',
        field: 'email',
        affectedCount: contactsWithoutEmail.length,
        records: contactsWithoutEmail,
        suggestedFix: `Use ${dominantDomain[0]} domain pattern`,
        autoFixable: false, // Requires confirmation
        examples: contactsWithoutEmail.slice(0, 3).map(r => 
          `${r.mapped.first_name} ${r.mapped.last_name} at ${r.mapped.company}`
        )
      };
    }

    return null;
  }

  private detectDuplicates(records: any[], entityType: CRMEntityType): BulkErrorPattern {
    const duplicates: any[] = [];
    const seen = new Set();
    const uniqueField = this.getUniqueField(entityType);

    records.forEach(record => {
      const key = record.mapped[uniqueField];
      if (key && seen.has(key.toLowerCase())) {
        duplicates.push(record);
      } else if (key) {
        seen.add(key.toLowerCase());
      }
    });

    return {
      type: 'duplicate',
      field: uniqueField,
      affectedCount: duplicates.length,
      records: duplicates,
      suggestedFix: 'Merge duplicates or add unique identifiers',
      autoFixable: false,
      examples: duplicates.slice(0, 3).map(r => r.mapped[uniqueField])
    };
  }

  private detectFormatErrors(records: any[], entityType: CRMEntityType): BulkErrorPattern[] {
    const patterns: BulkErrorPattern[] = [];
    
    // Email format validation
    if (entityType === 'contacts') {
      const invalidEmails = records.filter(r => 
        r.mapped.email && !this.isValidEmail(r.mapped.email)
      );
      
      if (invalidEmails.length > 0) {
        patterns.push({
          type: 'format_error',
          field: 'email',
          affectedCount: invalidEmails.length,
          records: invalidEmails,
          suggestedFix: 'Correct email format',
          autoFixable: true,
          examples: invalidEmails.slice(0, 3).map(r => r.mapped.email)
        });
      }
    }

    return patterns;
  }

  /**
   * Smart suggestion generators
   */
  private inferEmailsFromCompany(records: any[]): BulkSuggestion | null {
    const companiesWithEmails = records.filter(r => r.mapped.company);
    if (companiesWithEmails.length === 0) return null;

    const companyName = companiesWithEmails[0].mapped.company;
    const suggestedDomain = companyName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/inc|llc|corp|company|ltd/g, '') + '.com';

    return {
      type: 'domain_inference',
      field: 'email',
      value: suggestedDomain,
      confidence: 0.7,
      affectedRecords: records.map(r => r.index),
      reasoning: `Infer emails using ${suggestedDomain} domain pattern`,
      requiresConfirmation: true
    };
  }

  private inferCompanyFromEmail(records: any[]): BulkSuggestion | null {
    const emailRecords = records.filter(r => r.mapped.email && !r.mapped.company);
    if (emailRecords.length === 0) return null;

    const domains = emailRecords.map(r => r.mapped.email.split('@')[1]);
    const dominantDomain = this.getMostCommonValue(domains);
    
    if (dominantDomain) {
      const companyName = dominantDomain.split('.')[0];
      return {
        type: 'pattern_completion',
        field: 'company',
        value: this.capitalizeCompanyName(companyName),
        confidence: 0.8,
        affectedRecords: emailRecords.map(r => r.index),
        reasoning: `Infer company name from email domain: ${dominantDomain}`,
        requiresConfirmation: true
      };
    }

    return null;
  }

  /**
   * Utility methods
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  private mapToEntityFields(data: string[], headers: string[], entityType: CRMEntityType): any {
    const mapped: any = {};
    const fieldMappings = this.getFieldMappings(entityType);

    headers.forEach((header, index) => {
      const normalizedHeader = header.toLowerCase().trim();
      const mappedField = fieldMappings[normalizedHeader] || normalizedHeader;
      mapped[mappedField] = data[index]?.trim() || '';
    });

    return mapped;
  }

  private getFieldMappings(entityType: CRMEntityType): Record<string, string> {
    const mappings: Record<CRMEntityType, Record<string, string>> = {
      contacts: {
        'first name': 'first_name',
        'last name': 'last_name',
        'email address': 'email',
        'phone number': 'phone',
        'company name': 'company',
        'job title': 'title'
      },
      accounts: {
        'company name': 'name',
        'website url': 'website',
        'company industry': 'industry'
      },
      deals: {
        'deal name': 'name',
        'deal value': 'amount',
        'close date': 'close_date',
        'deal stage': 'stage'
      },
      activities: {
        'activity title': 'title',
        'activity type': 'type',
        'activity date': 'date'
      },
      tasks: {
        'task title': 'title',
        'due date': 'due_date',
        'task priority': 'priority'
      }
    };

    return mappings[entityType] || {};
  }

  private getRequiredFields(entityType: CRMEntityType): string[] {
    const required: Record<CRMEntityType, string[]> = {
      contacts: ['first_name', 'email'],
      accounts: ['name'],
      deals: ['name', 'amount'],
      activities: ['title', 'type'],
      tasks: ['title']
    };

    return required[entityType] || [];
  }

  private getUniqueField(entityType: CRMEntityType): string {
    const unique: Record<CRMEntityType, string> = {
      contacts: 'email',
      accounts: 'name',
      deals: 'name',
      activities: 'title',
      tasks: 'title'
    };

    return unique[entityType];
  }

  private validateRecord(record: any, entityType: CRMEntityType): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const requiredFields = this.getRequiredFields(entityType);

    for (const field of requiredFields) {
      if (!record[field] || record[field] === '') {
        errors.push(`${field} is required`);
      }
    }

    if (record.email && !this.isValidEmail(record.email)) {
      errors.push('Invalid email format');
    }

    return { isValid: errors.length === 0, errors };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private getSuggestedFix(field: string, records: any[], entityType: CRMEntityType): string {
    switch (field) {
      case 'email':
        return 'Infer from company domain or contact info';
      case 'company':
        return 'Extract from email domain';
      case 'amount':
        return 'Use average deal size or ask for estimation';
      default:
        return `Provide ${field} information`;
    }
  }

  private isAutoFixable(field: string, records: any[]): boolean {
    // Email format corrections are auto-fixable
    if (field === 'email') {
      return records.some(r => r.mapped.email && !this.isValidEmail(r.mapped.email));
    }
    return false;
  }

  private createProgressiveValidationPlan(patterns: BulkErrorPattern[]): ProgressiveValidationStep[] {
    const steps: ProgressiveValidationStep[] = [];

    // Critical issues first
    const criticalPatterns = patterns.filter(p => 
      p.type === 'missing_field' && ['email', 'name', 'amount'].includes(p.field)
    );

    if (criticalPatterns.length > 0) {
      steps.push({
        priority: 'critical',
        title: 'Fix Required Fields',
        description: 'Address missing required fields that prevent import',
        affectedRecords: criticalPatterns.reduce((sum, p) => sum + p.affectedCount, 0),
        canSkip: false,
        estimatedTime: '2-5 minutes',
        fixes: [] // Will be populated with suggestions
      });
    }

    // Format issues
    const formatPatterns = patterns.filter(p => p.type === 'format_error');
    if (formatPatterns.length > 0) {
      steps.push({
        priority: 'important',
        title: 'Correct Data Formats',
        description: 'Fix formatting issues for better data quality',
        affectedRecords: formatPatterns.reduce((sum, p) => sum + p.affectedCount, 0),
        canSkip: true,
        estimatedTime: '1-2 minutes',
        fixes: []
      });
    }

    // Duplicates
    const duplicatePatterns = patterns.filter(p => p.type === 'duplicate');
    if (duplicatePatterns.length > 0) {
      steps.push({
        priority: 'optional',
        title: 'Handle Duplicates',
        description: 'Merge or remove duplicate records',
        affectedRecords: duplicatePatterns.reduce((sum, p) => sum + p.affectedCount, 0),
        canSkip: true,
        estimatedTime: '3-10 minutes',
        fixes: []
      });
    }

    return steps;
  }

  private createRollbackPlan(records: any[]): RollbackStep[] {
    return [
      {
        step: 1,
        action: 'Backup original CSV data',
        affectedRecords: records.map(r => r.index),
        reversible: true,
        backupData: records
      },
      {
        step: 2,
        action: 'Create validation checkpoint',
        affectedRecords: [],
        reversible: true
      },
      {
        step: 3,
        action: 'Apply progressive fixes',
        affectedRecords: [],
        reversible: true
      }
    ];
  }

  private getMostCommonValue(values: string[]): string | null {
    const counts: Record<string, number> = {};
    values.forEach(value => {
      counts[value] = (counts[value] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort(([,a], [,b]) => b - a);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  private capitalizeCompanyName(name: string): string {
    return name.split('').map((char, index) => 
      index === 0 ? char.toUpperCase() : char
    ).join('');
  }

  private suggestFormatCorrection(pattern: BulkErrorPattern): BulkSuggestion | null {
    if (pattern.field === 'email') {
      return {
        type: 'smart_default',
        field: 'email',
        value: 'corrected_format',
        confidence: 0.9,
        affectedRecords: pattern.records.map(r => r.index),
        reasoning: 'Auto-correct common email format issues',
        requiresConfirmation: false
      };
    }
    return null;
  }
}

export const bulkChatAssistant = new BulkChatAssistant();