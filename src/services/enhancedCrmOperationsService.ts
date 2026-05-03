import { supabase } from '@/integrations/supabase/client';
import { revopsAnalyticsService } from './revopsAnalyticsService';

export interface CrmOperationResult {
  success: boolean;
  operation_type: string;
  results: Record<string, any>;
  execution_time_ms: number;
  items_processed: number;
  errors?: string[];
}

export interface DuplicateDetectionResult {
  total_contacts_scanned: number;
  duplicate_sets_found: number;
  total_duplicates: number;
  confidence_threshold: number;
  merge_suggestions: Array<{
    primary_contact_id: string;
    duplicate_contact_ids: string[];
    confidence_score: number;
    merge_fields: string[];
    reason: string;
  }>;
  reviewed_at: number;
}

export interface DataQualityIssue {
  type: 'missing_email' | 'missing_phone' | 'invalid_format' | 'stale_data' | 'incomplete_deal';
  severity: 'high' | 'medium' | 'low';
  entity_type: 'contact' | 'deal' | 'account';
  entity_id: string;
  field: string;
  current_value?: string;
  suggested_fix?: string;
  impact_description: string;
}

class EnhancedCrmOperationsService {
  // Duplicate Detection with ML-like scoring
  async detectDuplicates(
    organizationId: string,
    confidenceThreshold: number = 0.8,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<DuplicateDetectionResult> {
    const startTime = Date.now();
    
    try {
      onProgress?.('Scanning contacts...', 10);
      
      // Fetch all contacts for analysis
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) throw error;

      onProgress?.('Analyzing duplicates...', 30);
      
      const duplicateGroups = this.findDuplicateGroups(contacts || [], confidenceThreshold);
      
      onProgress?.('Generating merge suggestions...', 70);
      
      const mergeSuggestions = duplicateGroups.map(group => {
        const primary = group.contacts[0]; // Highest confidence contact
        const duplicates = group.contacts.slice(1);
        
        return {
          primary_contact_id: primary.id,
          duplicate_contact_ids: duplicates.map(c => c.id),
          confidence_score: group.confidence,
          merge_fields: this.determineMergeFields(primary, duplicates),
          reason: group.reason
        };
      });

      onProgress?.('Finalizing results...', 90);

      const result: DuplicateDetectionResult = {
        total_contacts_scanned: contacts?.length || 0,
        duplicate_sets_found: duplicateGroups.length,
        total_duplicates: duplicateGroups.reduce((sum, group) => sum + group.contacts.length - 1, 0),
        confidence_threshold: confidenceThreshold,
        merge_suggestions: mergeSuggestions,
        reviewed_at: Date.now()
      };

      onProgress?.('Complete', 100);
      
      return result;
    } catch (error) {
      console.error('Duplicate detection failed:', error);
      throw error;
    }
  }

  // Advanced Data Quality Scan
  async scanDataQuality(
    organizationId: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<{
    overall_score: number;
    issues_found: DataQualityIssue[];
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      action: string;
      impact: string;
      estimated_time: string;
    }>;
    scan_summary: {
      contacts_scanned: number;
      deals_scanned: number;
      accounts_scanned: number;
      critical_issues: number;
      auto_fixable_issues: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      onProgress?.('Scanning contacts...', 20);
      const contactIssues = await this.scanContactQuality(organizationId);
      
      onProgress?.('Scanning deals...', 50);
      const dealIssues = await this.scanDealQuality(organizationId);
      
      onProgress?.('Scanning accounts...', 70);
      const accountIssues = await this.scanAccountQuality(organizationId);
      
      onProgress?.('Analyzing patterns...', 85);
      
      const allIssues = [...contactIssues.issues, ...dealIssues.issues, ...accountIssues.issues];
      const criticalIssues = allIssues.filter(i => i.severity === 'high').length;
      const autoFixableIssues = allIssues.filter(i => i.suggested_fix).length;
      
      // Calculate overall score
      const totalEntities = contactIssues.scanned + dealIssues.scanned + accountIssues.scanned;
      const issueWeight = allIssues.reduce((sum, issue) => {
        return sum + (issue.severity === 'high' ? 3 : issue.severity === 'medium' ? 2 : 1);
      }, 0);
      
      const maxPossibleWeight = totalEntities * 3; // If all had high severity issues
      const overallScore = Math.max(0, Math.round(100 - (issueWeight / maxPossibleWeight) * 100));

      onProgress?.('Generating recommendations...', 95);
      const recommendations = this.generateDataQualityRecommendations(allIssues);

      onProgress?.('Complete', 100);

      return {
        overall_score: overallScore,
        issues_found: allIssues,
        recommendations,
        scan_summary: {
          contacts_scanned: contactIssues.scanned,
          deals_scanned: dealIssues.scanned,
          accounts_scanned: accountIssues.scanned,
          critical_issues: criticalIssues,
          auto_fixable_issues: autoFixableIssues
        }
      };
    } catch (error) {
      console.error('Data quality scan failed:', error);
      throw error;
    }
  }

  // Comprehensive Pipeline Analysis
  async analyzePipeline(
    organizationId: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<{
    health_score: number;
    velocity_analysis: {
      average_days_to_close: number;
      stage_bottlenecks: Array<{
        stage: string;
        avg_days: number;
        deals_stuck: number;
        efficiency_score: number;
      }>;
      conversion_rates: Array<{
        from_stage: string;
        to_stage: string;
        rate: number;
        trend: 'improving' | 'declining' | 'stable';
      }>;
    };
    revenue_insights: {
      total_pipeline_value: number;
      weighted_pipeline_value: number;
      forecast_accuracy: number;
      at_risk_revenue: number;
    };
    actionable_recommendations: Array<{
      type: 'deal_review' | 'stage_optimization' | 'process_improvement';
      priority: 'immediate' | 'this_week' | 'this_month';
      description: string;
      expected_impact: string;
      effort_required: 'low' | 'medium' | 'high';
    }>;
  }> {
    try {
      onProgress?.('Fetching pipeline data...', 15);
      
      const { data: deals, error } = await supabase
        .from('deals')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) throw error;

      onProgress?.('Analyzing velocity...', 40);
      const velocityAnalysis = this.analyzeVelocity(deals || []);
      
      onProgress?.('Calculating revenue insights...', 65);
      const revenueInsights = this.analyzeRevenue(deals || []);
      
      onProgress?.('Generating recommendations...', 85);
      const recommendations = this.generatePipelineRecommendations(
        deals || [], 
        velocityAnalysis, 
        revenueInsights
      );

      // Calculate overall health score
      const healthScore = this.calculatePipelineHealthScore(deals || [], velocityAnalysis, revenueInsights);

      onProgress?.('Complete', 100);

      return {
        health_score: healthScore,
        velocity_analysis: velocityAnalysis,
        revenue_insights: revenueInsights,
        actionable_recommendations: recommendations
      };
    } catch (error) {
      console.error('Pipeline analysis failed:', error);
      throw error;
    }
  }

  // Background Bulk Operations
  async executeBulkOperation(
    operationType: 'merge_duplicates' | 'fix_data_quality' | 'update_scores',
    organizationId: string,
    operationData: any,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<CrmOperationResult> {
    const startTime = Date.now();
    
    try {
      let result: any;
      let itemsProcessed = 0;

      switch (operationType) {
        case 'merge_duplicates':
          result = await this.executeMergeDuplicates(organizationId, operationData, onProgress);
          itemsProcessed = result.merges_completed;
          break;
          
        case 'fix_data_quality':
          result = await this.executeDataQualityFixes(organizationId, operationData, onProgress);
          itemsProcessed = result.fixes_applied;
          break;
          
        case 'update_scores':
          result = await this.executeScoreUpdates(organizationId, operationData, onProgress);
          itemsProcessed = result.scores_updated;
          break;
          
        default:
          throw new Error(`Unsupported bulk operation: ${operationType}`);
      }

      return {
        success: true,
        operation_type: operationType,
        results: result,
        execution_time_ms: Date.now() - startTime,
        items_processed: itemsProcessed
      };
    } catch (error) {
      console.error(`Bulk operation ${operationType} failed:`, error);
      return {
        success: false,
        operation_type: operationType,
        results: { error: error instanceof Error ? error.message : 'Unknown error' },
        execution_time_ms: Date.now() - startTime,
        items_processed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Private helper methods
  private findDuplicateGroups(contacts: any[], threshold: number) {
    const groups = [];
    const processed = new Set();

    for (const contact of contacts) {
      if (processed.has(contact.id)) continue;

      const duplicates = [contact];
      processed.add(contact.id);

      for (const other of contacts) {
        if (other.id === contact.id || processed.has(other.id)) continue;

        const similarity = this.calculateSimilarity(contact, other);
        if (similarity >= threshold) {
          duplicates.push(other);
          processed.add(other.id);
        }
      }

      if (duplicates.length > 1) {
        groups.push({
          contacts: duplicates,
          confidence: this.calculateGroupConfidence(duplicates),
          reason: this.getDuplicateReason(duplicates)
        });
      }
    }

    return groups;
  }

  private calculateSimilarity(contact1: any, contact2: any): number {
    let score = 0;
    let factors = 0;

    // Email similarity (high weight)
    if (contact1.email && contact2.email) {
      factors += 4;
      if (contact1.email.toLowerCase() === contact2.email.toLowerCase()) {
        score += 4;
      }
    }

    // Name similarity (medium weight)
    if (contact1.first_name && contact2.first_name) {
      factors += 2;
      if (this.stringSimilarity(contact1.first_name, contact2.first_name) > 0.8) {
        score += 2;
      }
    }

    if (contact1.last_name && contact2.last_name) {
      factors += 2;
      if (this.stringSimilarity(contact1.last_name, contact2.last_name) > 0.8) {
        score += 2;
      }
    }

    // Phone similarity (medium weight)
    if (contact1.phone && contact2.phone) {
      factors += 2;
      if (this.normalizePhone(contact1.phone) === this.normalizePhone(contact2.phone)) {
        score += 2;
      }
    }

    // Company similarity (low weight)
    if (contact1.company && contact2.company) {
      factors += 1;
      if (this.stringSimilarity(contact1.company, contact2.company) > 0.9) {
        score += 1;
      }
    }

    return factors > 0 ? score / factors : 0;
  }

  private stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private calculateGroupConfidence(contacts: any[]): number {
    // Calculate average similarity within the group
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        totalSimilarity += this.calculateSimilarity(contacts[i], contacts[j]);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private getDuplicateReason(contacts: any[]): string {
    if (contacts.some(c => c.email) && contacts.every(c => !c.email || c.email === contacts[0].email)) {
      return 'Same email address';
    }
    if (contacts.some(c => c.phone) && contacts.every(c => !c.phone || this.normalizePhone(c.phone) === this.normalizePhone(contacts[0].phone || ''))) {
      return 'Same phone number';
    }
    return 'Similar name and company';
  }

  private determineMergeFields(primary: any, duplicates: any[]): string[] {
    const fields = [];
    
    // Combine logic for determining which fields to merge
    const allContacts = [primary, ...duplicates];
    
    if (allContacts.some(c => c.phone && !primary.phone)) fields.push('phone');
    if (allContacts.some(c => c.title && !primary.title)) fields.push('title');
    if (allContacts.some(c => c.company && !primary.company)) fields.push('company');
    if (allContacts.some(c => c.notes && !primary.notes)) fields.push('notes');
    
    return fields;
  }

  private async scanContactQuality(organizationId: string) {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const issues: DataQualityIssue[] = [];

    contacts?.forEach(contact => {
      if (!contact.email) {
        issues.push({
          type: 'missing_email',
          severity: 'high',
          entity_type: 'contact',
          entity_id: contact.id,
          field: 'email',
          impact_description: 'Prevents lead scoring and email marketing'
        });
      }

      if (!contact.phone) {
        issues.push({
          type: 'missing_phone',
          severity: 'medium',
          entity_type: 'contact',
          entity_id: contact.id,
          field: 'phone',
          impact_description: 'Limits outreach options'
        });
      }

      // Check for stale data (no activity in 90 days)
      const lastUpdate = new Date(contact.updated_at);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      if (lastUpdate < ninetyDaysAgo) {
        issues.push({
          type: 'stale_data',
          severity: 'low',
          entity_type: 'contact',
          entity_id: contact.id,
          field: 'updated_at',
          current_value: contact.updated_at,
          impact_description: 'May contain outdated information'
        });
      }
    });

    return { issues, scanned: contacts?.length || 0 };
  }

  private async scanDealQuality(organizationId: string) {
    const { data: deals, error } = await supabase
      .from('deals')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const issues: DataQualityIssue[] = [];

    deals?.forEach(deal => {
      if (!deal.amount || deal.amount <= 0) {
        issues.push({
          type: 'incomplete_deal',
          severity: 'high',
          entity_type: 'deal',
          entity_id: deal.id,
          field: 'amount',
          impact_description: 'Prevents accurate forecasting'
        });
      }

      if (!deal.close_date) {
        issues.push({
          type: 'incomplete_deal',
          severity: 'medium',
          entity_type: 'deal',
          entity_id: deal.id,
          field: 'close_date',
          impact_description: 'Impacts pipeline planning'
        });
      }
    });

    return { issues, scanned: deals?.length || 0 };
  }

  private async scanAccountQuality(organizationId: string) {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const issues: DataQualityIssue[] = [];

    accounts?.forEach(account => {
      if (!account.industry) {
        issues.push({
          type: 'incomplete_deal', // Reusing type for simplicity
          severity: 'medium',
          entity_type: 'account',
          entity_id: account.id,
          field: 'industry',
          impact_description: 'Limits segmentation and targeting'
        });
      }
    });

    return { issues, scanned: accounts?.length || 0 };
  }

  private generateDataQualityRecommendations(issues: DataQualityIssue[]) {
    const recommendations = [];
    
    const missingEmails = issues.filter(i => i.type === 'missing_email').length;
    if (missingEmails > 0) {
      recommendations.push({
        priority: 'high' as const,
        action: `Collect email addresses for ${missingEmails} contacts`,
        impact: 'Enable lead scoring and email marketing campaigns',
        estimated_time: `${Math.ceil(missingEmails / 10)} hours`
      });
    }

    const incompleteDeal = issues.filter(i => i.type === 'incomplete_deal').length;
    if (incompleteDeal > 0) {
      recommendations.push({
        priority: 'high' as const,
        action: `Complete missing deal information for ${incompleteDeal} deals`,
        impact: 'Improve forecasting accuracy and pipeline visibility',
        estimated_time: `${Math.ceil(incompleteDeal / 5)} hours`
      });
    }

    return recommendations;
  }

  private analyzeVelocity(deals: any[]) {
    // Simplified velocity analysis
    const stageMetrics = this.calculateStageMetrics(deals);
    const conversionRates = this.calculateConversionRates(deals);
    
    return {
      average_days_to_close: this.calculateAverageCloseTime(deals),
      stage_bottlenecks: stageMetrics,
      conversion_rates: conversionRates
    };
  }

  private analyzeRevenue(deals: any[]) {
    const totalValue = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
    const weightedValue = deals.reduce((sum, deal) => 
      sum + ((deal.amount || 0) * (deal.probability || 0) / 100), 0
    );
    
    return {
      total_pipeline_value: totalValue,
      weighted_pipeline_value: weightedValue,
      forecast_accuracy: this.calculateForecastAccuracy(deals),
      at_risk_revenue: this.calculateAtRiskRevenue(deals)
    };
  }

  private calculateStageMetrics(deals: any[]) {
    // Group deals by stage and calculate metrics
    const stageGroups = deals.reduce((groups, deal) => {
      const stage = deal.stage || 'unknown';
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(deal);
      return groups;
    }, {} as Record<string, any[]>);

    return Object.entries(stageGroups).map(([stage, stageDeals]) => ({
      stage,
      avg_days: 30, // Simplified - would calculate actual days in stage
      deals_stuck: Array.isArray(stageDeals) ? stageDeals.filter(d => {
        const lastUpdate = new Date(d.updated_at);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return lastUpdate < thirtyDaysAgo;
      }).length : 0,
      efficiency_score: Math.max(0, 100 - (Array.isArray(stageDeals) ? stageDeals.length : 0) * 2) // Simplified scoring
    }));
  }

  private calculateConversionRates(deals: any[]) {
    // Simplified conversion rate calculation
    const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'];
    const rates = [];
    
    for (let i = 0; i < stages.length - 1; i++) {
      const fromStage = stages[i];
      const toStage = stages[i + 1];
      const fromCount = deals.filter(d => d.stage === fromStage).length;
      const toCount = deals.filter(d => d.stage === toStage).length;
      
      rates.push({
        from_stage: fromStage,
        to_stage: toStage,
        rate: fromCount > 0 ? (toCount / fromCount) * 100 : 0,
        trend: 'stable' as const // Would calculate actual trend
      });
    }
    
    return rates;
  }

  private calculateAverageCloseTime(deals: any[]): number {
    const closedDeals = deals.filter(d => d.stage === 'won' && d.close_date);
    if (closedDeals.length === 0) return 0;
    
    const totalDays = closedDeals.reduce((sum, deal) => {
      const created = new Date(deal.created_at);
      const closed = new Date(deal.close_date);
      return sum + Math.floor((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    
    return Math.round(totalDays / closedDeals.length);
  }

  private calculateForecastAccuracy(deals: any[]): number {
    // Simplified forecast accuracy calculation
    return 75; // Would implement actual calculation based on historical data
  }

  private calculateAtRiskRevenue(deals: any[]): number {
    return deals
      .filter(d => {
        const closeDate = new Date(d.close_date || '');
        const today = new Date();
        return closeDate < today && d.stage !== 'won' && d.stage !== 'lost';
      })
      .reduce((sum, deal) => sum + (deal.amount || 0), 0);
  }

  private generatePipelineRecommendations(deals: any[], velocity: any, revenue: any) {
    const recommendations = [];
    
    if (revenue.at_risk_revenue > 0) {
      const overdueDeals = Array.isArray(deals) ? deals.filter(d => new Date(d.close_date || '') < new Date() && d.stage !== 'won' && d.stage !== 'lost') : [];
      recommendations.push({
        type: 'deal_review' as const,
        priority: 'immediate' as const,
        description: `Review ${overdueDeals.length} overdue deals`,
        expected_impact: `Recover ${revenue.at_risk_revenue.toLocaleString()} in at-risk revenue`,
        effort_required: 'medium' as const
      });
    }
    
    return recommendations;
  }

  private calculatePipelineHealthScore(deals: any[], velocity: any, revenue: any): number {
    let score = 100;
    
    // Deduct points for at-risk revenue
    if (revenue.at_risk_revenue > 0) {
      score -= Math.min(30, (revenue.at_risk_revenue / revenue.total_pipeline_value) * 100);
    }
    
    // Deduct points for stuck deals
    const stuckDeals = velocity.stage_bottlenecks.reduce((sum: number, stage: any) => sum + stage.deals_stuck, 0);
    score -= Math.min(20, stuckDeals * 2);
    
    return Math.max(0, Math.round(score));
  }

  private async executeMergeDuplicates(organizationId: string, operationData: any, onProgress?: (stage: string, progress: number) => void) {
    const merges = operationData.merge_suggestions || [];
    let completed = 0;
    
    for (const merge of merges) {
      onProgress?.(`Merging contact ${completed + 1} of ${merges.length}`, (completed / merges.length) * 100);

      const primaryId = merge.primary_contact_id;
      const duplicateIds: string[] = merge.duplicate_contact_ids || [];
      if (!primaryId || duplicateIds.length === 0) continue;

      try {
        const { data: primary } = await supabase
          .from('contacts')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', primaryId)
          .maybeSingle();

        if (!primary) continue;

        const { data: duplicates } = await supabase
          .from('contacts')
          .select('*')
          .eq('organization_id', organizationId)
          .in('id', duplicateIds);

        // Build merged field payload by taking primary first, then filling gaps from duplicates
        const fieldsToMerge: string[] = merge.merge_fields || [];
        const mergedPayload: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const field of fieldsToMerge) {
          if (primary[field]) continue;
          const donor = (duplicates || []).find((d: any) => d[field]);
          if (donor && donor[field]) {
            mergedPayload[field] = donor[field];
          }
        }

        if (Object.keys(mergedPayload).length > 1) {
          await supabase
            .from('contacts')
            .update(mergedPayload)
            .eq('organization_id', organizationId)
            .eq('id', primaryId);
        }

        // Repoint related entities
        await Promise.all([
          supabase.from('activities').update({ contact_id: primaryId }).eq('organization_id', organizationId).in('contact_id', duplicateIds),
          supabase.from('tasks').update({ contact_id: primaryId }).eq('organization_id', organizationId).in('contact_id', duplicateIds),
          supabase.from('deals').update({ contact_id: primaryId }).eq('organization_id', organizationId).in('contact_id', duplicateIds),
          supabase.from('deal_contacts').update({ contact_id: primaryId }).eq('organization_id', organizationId).in('contact_id', duplicateIds),
        ]);

        // Delete duplicate contacts after repointing
        await supabase
          .from('contacts')
          .delete()
          .eq('organization_id', organizationId)
          .in('id', duplicateIds);

        completed++;
      } catch (error) {
        console.error('Failed to merge duplicate group:', merge, error);
      }
    }
    
    return { merges_completed: completed };
  }

  private async executeDataQualityFixes(organizationId: string, operationData: any, onProgress?: (stage: string, progress: number) => void) {
    const fixes = operationData.fixes || [];
    let applied = 0;
    
    for (const fix of fixes) {
      onProgress?.(`Applying fix ${applied + 1} of ${fixes.length}`, (applied / fixes.length) * 100);

      try {
        const entityType = String(fix.entity_type || '').toLowerCase();
        const entityId = fix.entity_id;
        const field = fix.field;
        const suggestedValue = fix.suggested_value ?? fix.suggested_fix;

        if (!entityId || !field || suggestedValue == null) continue;

        const table =
          entityType === 'contact' ? 'contacts' :
          entityType === 'deal' ? 'deals' :
          entityType === 'account' ? 'accounts' :
          null;

        if (!table) continue;

        const { error } = await supabase
          .from(table)
          .update({ [field]: suggestedValue, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId)
          .eq('id', entityId);

        if (!error) {
          applied++;
        }
      } catch (error) {
        console.error('Failed to apply data quality fix:', fix, error);
      }
    }
    
    return { fixes_applied: applied };
  }

  private async executeScoreUpdates(organizationId: string, operationData: any, onProgress?: (stage: string, progress: number) => void) {
    const contactIds = operationData.contact_ids || [];
    let updated = 0;
    
    for (const contactId of contactIds) {
      onProgress?.(`Updating score ${updated + 1} of ${contactIds.length}`, (updated / contactIds.length) * 100);
      
      try {
        await revopsAnalyticsService.calculateLeadScore(contactId, organizationId);
        updated++;
      } catch (error) {
        console.error(`Failed to update score for ${contactId}:`, error);
      }
    }
    
    return { scores_updated: updated };
  }
}

export const enhancedCrmOperationsService = new EnhancedCrmOperationsService();
