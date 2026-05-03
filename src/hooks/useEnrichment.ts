/**
 * useEnrichment - React hook for lead enrichment
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { getEnrichmentService, EnrichmentResult } from '@/services/enrichment';
import { 
  QualificationStage, 
  BudgetStatus, 
  AuthorityLevel, 
  NeedUrgency, 
  TimelineStatus,
  STAGE_LABELS,
  STAGE_COLORS,
  BUDGET_LABELS,
  AUTHORITY_LABELS,
  NEED_LABELS,
  TIMELINE_LABELS
} from '@/services/enrichment/types';
import { toast } from 'sonner';

interface UseEnrichmentReturn {
  enrichContact: (contactId: string, forceRefresh?: boolean) => Promise<void>;
  enrichEmail: (email: string) => Promise<EnrichmentResult | null>;
  isEnriching: boolean;
  lastResult: EnrichmentResult | null;
  error: string | null;
}

/**
 * Hook for enriching leads/contacts
 */
export function useEnrichment(): UseEnrichmentReturn {
  const { organizationId } = useOrganizationAccess();
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<EnrichmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enrichContactMutation = useMutation({
    mutationFn: async ({ contactId, forceRefresh }: { contactId: string; forceRefresh?: boolean }) => {
      if (!organizationId) throw new Error('No organization selected');
      
      const service = getEnrichmentService(organizationId);
      await service.initialize();
      return service.enrichContact(contactId, forceRefresh);
    },
    onSuccess: (result) => {
      setLastResult(result.result);
      setError(null);
      
      if (result.success) {
        toast.success('Contact enriched successfully', {
          description: `Fit score: ${result.result.fit_score}/100`
        });
        // Invalidate contacts cache
        queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      } else {
        toast.error('Enrichment failed', {
          description: result.result.error || 'No data found'
        });
      }
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Enrichment failed', { description: message });
    }
  });

  const enrichEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!organizationId) throw new Error('No organization selected');
      
      const service = getEnrichmentService(organizationId);
      await service.initialize();
      return service.enrichEmail(email);
    },
    onSuccess: (result) => {
      setLastResult(result);
      setError(null);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    }
  });

  const enrichContact = useCallback(async (contactId: string, forceRefresh = false) => {
    await enrichContactMutation.mutateAsync({ contactId, forceRefresh });
  }, [enrichContactMutation]);

  const enrichEmail = useCallback(async (email: string): Promise<EnrichmentResult | null> => {
    try {
      return await enrichEmailMutation.mutateAsync(email);
    } catch {
      return null;
    }
  }, [enrichEmailMutation]);

  return {
    enrichContact,
    enrichEmail,
    isEnriching: enrichContactMutation.isPending || enrichEmailMutation.isPending,
    lastResult,
    error
  };
}

/**
 * Display helper for lead scores
 */
export interface LeadScoreDisplay {
  stageLabel: string;
  stageColor: string;
  fitScore: number;
  fitScoreColor: string;
  intentScore: number;
  engagementScore: number;
  bantScore: number;
  bantScoreColor: string;
  overallScore: number;
  overallScoreColor: string;
  
  // BANT breakdown
  budgetLabel: string;
  authorityLabel: string;
  needLabel: string;
  timelineLabel: string;
  
  // Progress indicators
  bantProgress: {
    budget: number;
    authority: number;
    need: number;
    timeline: number;
  };
}

/**
 * Hook to get formatted display data for lead scores
 */
export function useLeadScoreDisplay(contact: Record<string, unknown> | null): LeadScoreDisplay | null {
  return useMemo(() => {
    if (!contact) return null;

    const qualificationStage = (contact.qualification_stage as QualificationStage) || 'captured';
    const fitScore = (contact.fit_score as number) || 0;
    const intentScore = (contact.intent_score as number) || 0;
    const engagementScore = (contact.engagement_score as number) || 0;
    const bantScore = (contact.bant_score as number) || 0;
    const overallScore = (contact.overall_lead_score as number) || 0;

    const budgetStatus = (contact.budget_status as BudgetStatus) || 'unknown';
    const authorityLevel = (contact.authority_level as AuthorityLevel) || 'unknown';
    const needUrgency = (contact.need_urgency as NeedUrgency) || 'unknown';
    const timelineStatus = (contact.timeline_status as TimelineStatus) || 'unknown';

    // Calculate BANT progress (0-100 for each component based on max points)
    const bantProgress = {
      budget: getBudgetPoints(budgetStatus) / 30 * 100,
      authority: getAuthorityPoints(authorityLevel) / 25 * 100,
      need: getNeedPoints(needUrgency) / 25 * 100,
      timeline: getTimelinePoints(timelineStatus) / 20 * 100
    };

    return {
      stageLabel: STAGE_LABELS[qualificationStage],
      stageColor: STAGE_COLORS[qualificationStage],
      fitScore,
      fitScoreColor: getScoreColor(fitScore),
      intentScore,
      engagementScore,
      bantScore,
      bantScoreColor: getScoreColor(bantScore),
      overallScore,
      overallScoreColor: getScoreColor(overallScore),
      budgetLabel: BUDGET_LABELS[budgetStatus],
      authorityLabel: AUTHORITY_LABELS[authorityLevel],
      needLabel: NEED_LABELS[needUrgency],
      timelineLabel: TIMELINE_LABELS[timelineStatus],
      bantProgress
    };
  }, [contact]);
}

// Score to color mapping
function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-muted-foreground';
}

// BANT point calculations (matching database function)
function getBudgetPoints(status: BudgetStatus): number {
  const points: Record<BudgetStatus, number> = {
    unknown: 0,
    no_budget: 5,
    budget_pending: 15,
    budget_allocated: 25,
    budget_approved: 30
  };
  return points[status] || 0;
}

function getAuthorityPoints(level: AuthorityLevel): number {
  const points: Record<AuthorityLevel, number> = {
    unknown: 0,
    influencer: 10,
    recommender: 15,
    decision_maker: 22,
    economic_buyer: 25
  };
  return points[level] || 0;
}

function getNeedPoints(urgency: NeedUrgency): number {
  const points: Record<NeedUrgency, number> = {
    unknown: 0,
    no_pain: 3,
    nice_to_have: 10,
    important: 18,
    critical: 23,
    hair_on_fire: 25
  };
  return points[urgency] || 0;
}

function getTimelinePoints(status: TimelineStatus): number {
  const points: Record<TimelineStatus, number> = {
    unknown: 0,
    no_timeline: 3,
    next_year: 8,
    this_quarter: 14,
    this_month: 18,
    immediate: 20
  };
  return points[status] || 0;
}
