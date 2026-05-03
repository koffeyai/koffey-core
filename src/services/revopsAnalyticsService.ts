import { supabase } from '@/integrations/supabase/client';

export interface LeadScore {
  contact_id: string;
  organization_id: string;
  demographic_score: number;
  behavioral_score: number;
  company_score: number;
  total_score: number;
  score_grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';
  score_breakdown: {
    industry_boost: number;
    title_boost: number;
    activity_count: number;
    recent_activity_count: number;
    calculated_at: number;
  };
  last_calculated_at: string;
}

export interface DataQualityMetrics {
  overall_score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Improvement';
  contacts: {
    total_contacts: number;
    completion_rates: Record<string, number>;
    quality_indicators: {
      complete_contacts: number;
      completeness_rate: number;
      recent_additions: number;
      stale_contacts: number;
      stale_percentage: number;
    };
  };
  deals: {
    total_deals: number;
    completion_rates: Record<string, number>;
    pipeline_health: {
      avg_deal_size: number;
      missing_amounts: number;
      missing_close_dates: number;
      overdue_deals: number;
      win_rate: number;
    };
  };
  accounts: {
    total_accounts: number;
    completion_rates: Record<string, number>;
    account_intelligence: {
      complete_accounts: number;
      enrichment_opportunity: number;
    };
  };
  duplicates: Array<{
    type: string;
    duplicate_sets: number;
    total_duplicates: number;
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    impact: string;
  }>;
  analyzed_at: number;
}

export interface PipelineHealth {
  overview: {
    total_deals: number;
    active_pipeline: {
      deal_count: number;
      total_value: number;
      avg_deal_size: number;
    };
    health_indicators: {
      overdue_deals: number;
      closing_soon: number;
      missing_amounts: number;
      health_score: number;
    };
    win_rate: number;
  };
  velocity: {
    stage_metrics: Array<{
      stage: string;
      deals_count: number;
      avg_days: number;
      min_days: number;
      max_days: number;
    }>;
    conversion_metrics: Array<{
      from_stage: string;
      to_stage: string;
      conversion_rate: number;
    }>;
    analyzed_at: number;
  };
  funnel: Array<{
    stage: string;
    deal_count: number;
    stage_value: number;
    avg_deal_size: number;
  }>;
  risks: {
    stale_deals: number;
    unqualified_deals: number;
    no_contact_deals: number;
    stuck_prospects: number;
    risk_score: 'Low' | 'Medium' | 'High';
  };
  generated_at: number;
}

export interface LeadScoringResult {
  demographic_score: number;
  behavioral_score: number;
  company_score: number;
  total_score: number;
  score_grade: string;
  industry_boost: number;
  breakdown: {
    has_email: boolean;
    has_phone: boolean;
    decision_maker_title: boolean;
    high_value_industry: boolean;
    activity_count: number;
    recent_engagement: boolean;
  };
}

class RevOpsAnalyticsService {
  // Lead Scoring Operations
  async calculateLeadScore(contactId: string, organizationId: string): Promise<LeadScoringResult> {
    try {
      console.log('Calculating lead score', { contactId, organizationId });
      
      const { data, error } = await supabase.rpc('calculate_lead_score', {
        p_contact_id: contactId,
        p_organization_id: organizationId
      });

      if (error) {
        throw new Error(`Lead scoring failed: ${error.message}`);
      }

      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }

      console.log('Lead score calculated successfully', { 
        contactId, 
        score: (data as any).total_score, 
        grade: (data as any).score_grade 
      });

      return data as unknown as LeadScoringResult;
    } catch (error) {
      console.error('Lead scoring calculation failed', error);
      throw error;
    }
  }

  async getLeadScores(organizationId: string, grade?: string): Promise<LeadScore[]> {
    try {
      let query = supabase
        .from('lead_scores')
        .select(`
          contact_id,
          organization_id,
          demographic_score,
          behavioral_score,
          company_score,
          total_score,
          score_grade,
          score_breakdown,
          last_calculated_at
        `)
        .eq('organization_id', organizationId)
        .order('total_score', { ascending: false });

      if (grade) {
        query = query.eq('score_grade', grade);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch lead scores: ${error.message}`);
      }

      return (data || []) as LeadScore[];
    } catch (error) {
      console.error('Failed to fetch lead scores', error);
      throw error;
    }
  }

  // Data Quality Operations
  async analyzeDataQuality(organizationId: string): Promise<DataQualityMetrics> {
    try {
      console.log('Analyzing data quality', { organizationId });
      
      const { data, error } = await supabase.rpc('analyze_data_quality_with_recommendations', {
        p_organization_id: organizationId
      });

      if (error) {
        throw new Error(`Data quality analysis failed: ${error.message}`);
      }

      console.log('Data quality analysis completed', { 
        organizationId, 
        score: (data as any).overall_score,
        grade: (data as any).grade 
      });

      return data as unknown as DataQualityMetrics;
    } catch (error) {
      console.error('Data quality analysis failed', error);
      throw error;
    }
  }

  // Pipeline Health Operations
  async getPipelineHealth(organizationId: string): Promise<PipelineHealth> {
    try {
      console.log('Fetching pipeline health', { organizationId });
      
      const { data, error } = await supabase.rpc('get_pipeline_health_dashboard', {
        p_organization_id: organizationId
      });

      if (error) {
        throw new Error(`Pipeline health analysis failed: ${error.message}`);
      }

      console.log('Pipeline health analysis completed', { 
        organizationId,
        totalDeals: (data as any).overview.total_deals,
        healthScore: (data as any).overview.health_indicators.health_score
      });

      return data as unknown as PipelineHealth;
    } catch (error) {
      console.error('Pipeline health analysis failed', error);
      throw error;
    }
  }

  // RevOps Intelligence - Predictive Insights
  async getRevOpsInsights(organizationId: string): Promise<{
    lead_quality_trend: 'improving' | 'declining' | 'stable';
    pipeline_health_trend: 'healthy' | 'at_risk' | 'critical';
    data_quality_priority: Array<{
      area: string;
      priority: 'high' | 'medium' | 'low';
      impact: string;
      estimated_effort: 'low' | 'medium' | 'high';
    }>;
    recommended_actions: Array<{
      action: string;
      category: 'lead_scoring' | 'data_quality' | 'pipeline_management';
      urgency: 'immediate' | 'this_week' | 'this_month';
      expected_impact: 'high' | 'medium' | 'low';
    }>;
  }> {
    try {
      // This combines multiple analytics to provide actionable insights
      const [dataQuality, pipelineHealth, leadScores] = await Promise.all([
        this.analyzeDataQuality(organizationId),
        this.getPipelineHealth(organizationId),
        this.getLeadScores(organizationId)
      ]);

      // Analyze trends and generate insights
      const lead_quality_trend = this.analyzLeadQualityTrend(leadScores, dataQuality);
      const pipeline_health_trend = this.analyzePipelineHealthTrend(pipelineHealth);
      const data_quality_priority = this.prioritizeDataQualityActions(dataQuality);
      const recommended_actions = this.generateRecommendedActions(
        dataQuality, 
        pipelineHealth, 
        lead_quality_trend,
        pipeline_health_trend
      );

      return {
        lead_quality_trend,
        pipeline_health_trend,
        data_quality_priority,
        recommended_actions
      };
    } catch (error) {
      console.error('RevOps insights analysis failed', error);
      throw error;
    }
  }

  private analyzLeadQualityTrend(leadScores: LeadScore[], dataQuality: DataQualityMetrics): 'improving' | 'declining' | 'stable' {
    // Analyze lead score distribution
    const highQualityLeads = leadScores.filter(s => ['A+', 'A', 'B+'].includes(s.score_grade)).length;
    const totalLeads = leadScores.length;
    const highQualityPercentage = totalLeads > 0 ? (highQualityLeads / totalLeads) * 100 : 0;

    // Factor in data quality score
    if (dataQuality.overall_score >= 80 && highQualityPercentage >= 30) {
      return 'improving';
    } else if (dataQuality.overall_score < 60 || highQualityPercentage < 15) {
      return 'declining';
    }
    return 'stable';
  }

  private analyzePipelineHealthTrend(pipelineHealth: PipelineHealth): 'healthy' | 'at_risk' | 'critical' {
    const { health_indicators, win_rate } = pipelineHealth.overview;
    const healthScore = health_indicators.health_score;
    const overdueDeals = health_indicators.overdue_deals;
    const missingAmounts = health_indicators.missing_amounts;

    if (healthScore >= 80 && win_rate >= 20 && overdueDeals <= 2) {
      return 'healthy';
    } else if (healthScore < 60 || overdueDeals > 5 || missingAmounts > 5) {
      return 'critical';
    }
    return 'at_risk';
  }

  private prioritizeDataQualityActions(dataQuality: DataQualityMetrics) {
    const priorities = [];
    
    // Email completion priority
    if (dataQuality.contacts.completion_rates.email < 80) {
      priorities.push({
        area: 'Contact Email Collection',
        priority: 'high' as const,
        impact: 'Enables lead scoring and marketing automation',
        estimated_effort: 'medium' as const
      });
    }

    // Deal amount completion
    if (dataQuality.deals.completion_rates.amount < 70) {
      priorities.push({
        area: 'Deal Amount Qualification',
        priority: 'high' as const,
        impact: 'Critical for accurate forecasting and pipeline analysis',
        estimated_effort: 'low' as const
      });
    }

    // Stale contact cleanup
    if (dataQuality.contacts.quality_indicators.stale_percentage > 30) {
      priorities.push({
        area: 'Contact Activity Updates',
        priority: 'medium' as const,
        impact: 'Improves lead scoring accuracy and sales efficiency',
        estimated_effort: 'high' as const
      });
    }

    // Account enrichment
    if (dataQuality.accounts.completion_rates.industry < 60) {
      priorities.push({
        area: 'Account Industry Enrichment',
        priority: 'medium' as const,
        impact: 'Enhances lead scoring and market segmentation',
        estimated_effort: 'medium' as const
      });
    }

    return priorities.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private generateRecommendedActions(
    dataQuality: DataQualityMetrics,
    pipelineHealth: PipelineHealth,
    leadTrend: string,
    pipelineTrend: string
  ) {
    const actions = [];

    // Critical pipeline actions
    if (pipelineHealth.overview.health_indicators.overdue_deals > 0) {
      actions.push({
        action: `Review and update ${pipelineHealth.overview.health_indicators.overdue_deals} overdue deals`,
        category: 'pipeline_management' as const,
        urgency: 'immediate' as const,
        expected_impact: 'high' as const
      });
    }

    // Data quality actions
    if (dataQuality.overall_score < 70) {
      actions.push({
        action: 'Execute data quality improvement plan',
        category: 'data_quality' as const,
        urgency: 'this_week' as const,
        expected_impact: 'high' as const
      });
    }

    // Lead scoring actions
    if (leadTrend === 'declining') {
      actions.push({
        action: 'Refresh lead scoring rules and recalculate scores',
        category: 'lead_scoring' as const,
        urgency: 'this_week' as const,
        expected_impact: 'medium' as const
      });
    }

    return actions.sort((a, b) => {
      const urgencyOrder = { immediate: 3, this_week: 2, this_month: 1 };
      const impactOrder = { high: 3, medium: 2, low: 1 };
      
      const aScore = urgencyOrder[a.urgency] + impactOrder[a.expected_impact];
      const bScore = urgencyOrder[b.urgency] + impactOrder[b.expected_impact];
      
      return bScore - aScore;
    });
  }
}

export const revopsAnalyticsService = new RevOpsAnalyticsService();