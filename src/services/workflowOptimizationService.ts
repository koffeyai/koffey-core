import { supabase } from '@/integrations/supabase/client';

type CRMEntityType = 'contacts' | 'deals' | 'accounts' | 'tasks' | 'activities';

interface WorkflowMetrics {
  entityType: CRMEntityType;
  userId: string;
  organizationId: string;
  completionTime: number;
  abandonmentRate: number;
  errorCount: number;
  assistanceUsed: boolean;
  fieldCompletionOrder: string[];
  predictionsAccepted: number;
  conversationsStarted: number;
  timestamp: number;
}

interface UserBehaviorPattern {
  userId: string;
  entityType: CRMEntityType;
  preferredFieldOrder: string[];
  avgCompletionTime: number;
  commonErrors: Array<{ field: string; frequency: number }>;
  assistancePreference: 'immediate' | 'delayed' | 'minimal';
  optimalWorkingHours: number[];
  deviceType: 'mobile' | 'desktop' | 'tablet';
  experienceLevel: 'novice' | 'intermediate' | 'expert';
}

interface WorkflowOptimization {
  suggestedFieldOrder: string[];
  proactiveAssistanceFields: string[];
  simplificationOpportunities: Array<{
    field: string;
    suggestion: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  predictedCompletionTime: number;
  riskFactors: Array<{
    type: 'abandonment' | 'error' | 'frustration';
    probability: number;
    triggerField?: string;
  }>;
}

interface OrganizationInsights {
  organizationId: string;
  topBottlenecks: Array<{
    entityType: CRMEntityType;
    field: string;
    avgStuckTime: number;
    affectedUsers: number;
  }>;
  conversionRates: Record<CRMEntityType, number>;
  peakUsageHours: number[];
  mostEffectiveAssistanceTypes: Array<{
    type: string;
    successRate: number;
  }>;
  recommendedTraining: Array<{
    topic: string;
    priority: 'high' | 'medium' | 'low';
    affectedUsers: string[];
  }>;
}

export class WorkflowOptimizationService {
  private static behaviorCache = new Map<string, UserBehaviorPattern>();
  private static metricsQueue: WorkflowMetrics[] = [];

  // Track user behavior and form interactions
  static async trackFormInteraction(metrics: Partial<WorkflowMetrics>) {
    const fullMetrics: WorkflowMetrics = {
      entityType: 'contacts',
      userId: '',
      organizationId: '',
      completionTime: 0,
      abandonmentRate: 0,
      errorCount: 0,
      assistanceUsed: false,
      fieldCompletionOrder: [],
      predictionsAccepted: 0,
      conversationsStarted: 0,
      timestamp: Date.now(),
      ...metrics
    };

    this.metricsQueue.push(fullMetrics);

    // Batch process metrics every 10 interactions
    if (this.metricsQueue.length >= 10) {
      await this.flushMetrics();
    }

    // Update real-time behavior pattern
    await this.updateUserBehaviorPattern(fullMetrics);
  }

  // Get personalized workflow optimization for a user
  static async getWorkflowOptimization(
    userId: string,
    entityType: CRMEntityType,
    organizationId: string,
    currentFormData: any = {}
  ): Promise<WorkflowOptimization> {
    const userPattern = await this.getUserBehaviorPattern(userId, entityType);
    const orgInsights = await this.getOrganizationInsights(organizationId);
    
    return {
      suggestedFieldOrder: this.optimizeFieldOrder(userPattern, entityType),
      proactiveAssistanceFields: this.identifyAssistanceFields(userPattern, orgInsights),
      simplificationOpportunities: this.findSimplificationOpportunities(userPattern, entityType),
      predictedCompletionTime: this.predictCompletionTime(userPattern, currentFormData),
      riskFactors: this.assessRiskFactors(userPattern, currentFormData, orgInsights)
    };
  }

  // Analyze organization-wide patterns and bottlenecks
  static async getOrganizationInsights(organizationId: string): Promise<OrganizationInsights> {
    // Use localStorage for now until database tables are created
    const storageKey = `workflow_insights_${organizationId}`;
    const cached = localStorage.getItem(storageKey);
    
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        console.error('Error parsing cached insights:', error);
      }
    }

    const insights = this.getDefaultInsights(organizationId);
    localStorage.setItem(storageKey, JSON.stringify(insights));
    return insights;
  }

  // Generate proactive assistance recommendations
  static async generateProactiveRecommendations(
    userId: string,
    entityType: CRMEntityType,
    currentField: string,
    formProgress: number
  ): Promise<{
    shouldIntervene: boolean;
    intervention: 'suggestion' | 'assistance' | 'simplification';
    message: string;
    confidence: number;
  }> {
    const userPattern = await this.getUserBehaviorPattern(userId, entityType);
    
    // Check if user typically struggles with this field
    const fieldError = userPattern.commonErrors.find(e => e.field === currentField);
    const isStuckField = userPattern.preferredFieldOrder.indexOf(currentField) === -1;
    
    let shouldIntervene = false;
    let intervention: 'suggestion' | 'assistance' | 'simplification' = 'suggestion';
    let message = '';
    let confidence = 0;

    if (fieldError && fieldError.frequency > 0.3) {
      shouldIntervene = true;
      intervention = 'assistance';
      message = `I notice this field can be tricky. Would you like some guidance with ${currentField}?`;
      confidence = fieldError.frequency;
    } else if (isStuckField && formProgress > 0.7) {
      shouldIntervene = true;
      intervention = 'suggestion';
      message = `You're almost done! Need a quick suggestion for ${currentField}?`;
      confidence = 0.6;
    } else if (userPattern.assistancePreference === 'immediate' && formProgress > 0.5) {
      shouldIntervene = true;
      intervention = 'assistance';
      message = `Making good progress! I can help speed things up if you'd like.`;
      confidence = 0.4;
    }

    return { shouldIntervene, intervention, message, confidence };
  }

  // Real-time learning from user interactions
  static async updateUserBehaviorPattern(metrics: WorkflowMetrics) {
    const cacheKey = `${metrics.userId}-${metrics.entityType}`;
    let pattern = this.behaviorCache.get(cacheKey);

    if (!pattern) {
      pattern = await this.getUserBehaviorPattern(metrics.userId, metrics.entityType);
    }

    // Update pattern with new data (exponential moving average)
    const alpha = 0.1; // Learning rate
    pattern.avgCompletionTime = pattern.avgCompletionTime * (1 - alpha) + metrics.completionTime * alpha;
    
    // Update field order preferences
    metrics.fieldCompletionOrder.forEach((field, index) => {
      const currentIndex = pattern!.preferredFieldOrder.indexOf(field);
      if (currentIndex === -1) {
        pattern!.preferredFieldOrder.splice(index, 0, field);
      } else if (Math.abs(currentIndex - index) > 2) {
        // Significant deviation, update preference
        pattern!.preferredFieldOrder.splice(currentIndex, 1);
        pattern!.preferredFieldOrder.splice(index, 0, field);
      }
    });

    // Update assistance preference based on usage
    if (metrics.assistanceUsed && metrics.completionTime < pattern.avgCompletionTime) {
      pattern.assistancePreference = pattern.assistancePreference === 'minimal' ? 'delayed' : 'immediate';
    }

    this.behaviorCache.set(cacheKey, pattern);
  }

  // Private helper methods
  private static async getUserBehaviorPattern(userId: string, entityType: CRMEntityType): Promise<UserBehaviorPattern> {
    const cacheKey = `${userId}-${entityType}`;
    if (this.behaviorCache.has(cacheKey)) {
      return this.behaviorCache.get(cacheKey)!;
    }

    // Use localStorage for now until database tables are created
    const storageKey = `user_pattern_${userId}_${entityType}`;
    const cached = localStorage.getItem(storageKey);
    
    if (cached) {
      try {
        const pattern = JSON.parse(cached);
        this.behaviorCache.set(cacheKey, pattern);
        return pattern;
      } catch (error) {
        console.error('Error parsing cached pattern:', error);
      }
    }

    // Default pattern for new users
    return {
      userId,
      entityType,
      preferredFieldOrder: this.getDefaultFieldOrder(entityType),
      avgCompletionTime: 300,
      commonErrors: [],
      assistancePreference: 'delayed',
      optimalWorkingHours: [9, 10, 11, 14, 15, 16],
      deviceType: 'desktop',
      experienceLevel: 'intermediate'
    };
  }

  private static optimizeFieldOrder(pattern: UserBehaviorPattern, entityType: CRMEntityType): string[] {
    const baseOrder = this.getDefaultFieldOrder(entityType);
    const optimized = [...pattern.preferredFieldOrder];
    
    // Add any missing fields from base order
    baseOrder.forEach(field => {
      if (!optimized.includes(field)) {
        optimized.push(field);
      }
    });

    return optimized;
  }

  private static identifyAssistanceFields(pattern: UserBehaviorPattern, insights: OrganizationInsights): string[] {
    const problemFields = pattern.commonErrors
      .filter(error => error.frequency > 0.2)
      .map(error => error.field);
    
    const orgBottlenecks = insights.topBottlenecks
      .filter(bottleneck => bottleneck.avgStuckTime > 60)
      .map(bottleneck => bottleneck.field);

    return [...new Set([...problemFields, ...orgBottlenecks])];
  }

  private static findSimplificationOpportunities(pattern: UserBehaviorPattern, entityType: CRMEntityType) {
    const opportunities = [];
    
    // Check for frequently skipped optional fields
    const defaultOrder = this.getDefaultFieldOrder(entityType);
    const skippedFields = defaultOrder.filter(field => !pattern.preferredFieldOrder.includes(field));
    
    skippedFields.forEach(field => {
      opportunities.push({
        field,
        suggestion: `Consider making ${field} optional or providing smart defaults`,
        impact: 'medium' as const
      });
    });

    return opportunities;
  }

  private static predictCompletionTime(pattern: UserBehaviorPattern, currentFormData: any): number {
    const fieldsCompleted = Object.keys(currentFormData).filter(key => currentFormData[key]).length;
    const totalFields = pattern.preferredFieldOrder.length;
    const progress = fieldsCompleted / totalFields;
    
    return Math.round(pattern.avgCompletionTime * (1 - progress));
  }

  private static assessRiskFactors(pattern: UserBehaviorPattern, currentFormData: any, insights: OrganizationInsights) {
    const risks = [];
    
    // High error rate risk
    const errorProne = pattern.commonErrors.some(error => error.frequency > 0.4);
    if (errorProne) {
      risks.push({
        type: 'error' as const,
        probability: 0.7,
      });
    }

    // Abandonment risk based on org data
    const entityConversionRate = insights.conversionRates[pattern.entityType] || 0.8;
    if (entityConversionRate < 0.6) {
      risks.push({
        type: 'abandonment' as const,
        probability: 1 - entityConversionRate,
      });
    }

    return risks;
  }

  private static async flushMetrics() {
    try {
      const metricsToSave = this.metricsQueue.splice(0);
      
      // Store in localStorage for now
      const storageKey = 'workflow_metrics';
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existing.push(...metricsToSave);
      localStorage.setItem(storageKey, JSON.stringify(existing.slice(-1000))); // Keep last 1000
    } catch (error) {
      console.error('Error flushing metrics:', error);
    }
  }

  private static getDefaultFieldOrder(entityType: CRMEntityType): string[] {
    const fieldOrders = {
      contacts: ['name', 'email', 'phone', 'company', 'title', 'notes'],
      deals: ['name', 'value', 'stage', 'close_date', 'contact_id', 'description'],
      accounts: ['name', 'industry', 'size', 'website', 'phone', 'address'],
      tasks: ['title', 'description', 'due_date', 'priority', 'assigned_to'],
      activities: ['type', 'subject', 'description', 'date', 'contact_id']
    };
    return fieldOrders[entityType] || [];
  }

  private static identifyBottlenecks(metrics: any[]) {
    // Analyze metrics to find common bottlenecks
    return metrics
      .filter(m => m.completion_time > 600) // Over 10 minutes
      .reduce((acc: any[], metric) => {
        const existing = acc.find(b => b.field === metric.stuck_field);
        if (existing) {
          existing.avgStuckTime = (existing.avgStuckTime + metric.completion_time) / 2;
          existing.affectedUsers++;
        } else {
          acc.push({
            entityType: metric.entity_type,
            field: metric.stuck_field || 'unknown',
            avgStuckTime: metric.completion_time,
            affectedUsers: 1
          });
        }
        return acc;
      }, [])
      .sort((a, b) => b.affectedUsers - a.affectedUsers)
      .slice(0, 5);
  }

  private static calculateConversionRates(metrics: any[]) {
    const rates: Record<CRMEntityType, number> = {
      contacts: 0.85,
      deals: 0.75,
      accounts: 0.80,
      tasks: 0.90,
      activities: 0.88
    };

    // Calculate actual rates from metrics
    Object.keys(rates).forEach(entityType => {
      const entityMetrics = metrics.filter(m => m.entity_type === entityType);
      if (entityMetrics.length > 0) {
        const completed = entityMetrics.filter(m => m.abandonment_rate < 0.1).length;
        rates[entityType as CRMEntityType] = completed / entityMetrics.length;
      }
    });

    return rates;
  }

  private static analyzePeakHours(metrics: any[]) {
    const hourCounts = new Array(24).fill(0);
    metrics.forEach(metric => {
      const hour = new Date(metric.created_at).getHours();
      hourCounts[hour]++;
    });
    
    return hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(item => item.hour);
  }

  private static analyzeAssistanceEffectiveness(metrics: any[]) {
    return [
      { type: 'predictive_suggestions', successRate: 0.78 },
      { type: 'conversational_assistance', successRate: 0.85 },
      { type: 'bulk_operations', successRate: 0.92 },
      { type: 'field_validation', successRate: 0.70 }
    ];
  }

  private static generateTrainingRecommendations(metrics: any[]) {
    return [
      {
        topic: 'Advanced Form Navigation',
        priority: 'medium' as const,
        affectedUsers: metrics.filter(m => m.completion_time > 900).map(m => m.user_id)
      },
      {
        topic: 'Data Quality Best Practices',
        priority: 'high' as const,
        affectedUsers: metrics.filter(m => m.error_count > 3).map(m => m.user_id)
      }
    ];
  }

  private static getDefaultInsights(organizationId: string): OrganizationInsights {
    return {
      organizationId,
      topBottlenecks: [],
      conversionRates: {
        contacts: 0.85,
        deals: 0.75,
        accounts: 0.80,
        tasks: 0.90,
        activities: 0.88
      },
      peakUsageHours: [9, 10, 11, 14, 15, 16],
      mostEffectiveAssistanceTypes: [
        { type: 'conversational_assistance', successRate: 0.85 },
        { type: 'predictive_suggestions', successRate: 0.78 }
      ],
      recommendedTraining: []
    };
  }
}