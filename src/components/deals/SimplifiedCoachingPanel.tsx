import React, { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle,
  Zap,
  Target,
  ShieldAlert,
  Lightbulb,
  Loader2
} from 'lucide-react';
import { DealData, DealCoachingResult, StakeholderRankingsData, coachDeal } from '@/services/dealCoachingService';
import { DealGradeBadge, calculateDealGrade } from './DealGradeBadge';
import { ScoutpadBar } from './ScoutpadBar';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

interface SimplifiedCoachingPanelProps {
  deal: DealData;
  dealId?: string;
  onCoachingUpdate?: (coaching: DealCoachingResult) => void;
}

const SCOUTPAD_DIMENSIONS = [
  { key: 'stakeholders', letter: 'S', name: 'Stakeholders' },
  { key: 'champion', letter: 'C', name: 'Champion' },
  { key: 'opportunity', letter: 'O', name: 'Opportunity Fit' },
  { key: 'userAgreements', letter: 'U', name: 'User Agreements' },
  { key: 'timeline', letter: 'T', name: 'Timeline' },
  { key: 'problem', letter: 'P', name: 'Problem/Pain' },
  { key: 'approvalChain', letter: 'A', name: 'Approval Chain' },
  { key: 'decisionCriteria', letter: 'D', name: 'Decision Criteria' },
] as const;

function rows(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value as Array<Record<string, any>> : [];
}

function asText(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function latestActivityLabel(context: Record<string, any>, fallback?: string): string | undefined {
  const latest = rows(context.recent_activities)[0];
  if (!latest) return fallback;
  const when = latest.activity_date || latest.scheduled_at || latest.created_at;
  const title = latest.title || latest.subject || latest.type || 'Activity';
  return [when, title].filter(Boolean).join(': ');
}

function mergeHolisticDealContext(base: DealData, context: Record<string, any> | null): DealData {
  if (!context) return base;

  const dealRow = context.deal || {};
  const account = context.account || {};
  const noteText = rows(context.deal_notes)
    .map((note) => asText(note.content))
    .filter(Boolean)
    .join('\n');

  return {
    ...base,
    dealSize: asNumber(dealRow.amount) ?? base.dealSize,
    closeDate: asText(dealRow.expected_close_date) || asText(dealRow.close_date) || base.closeDate,
    stage: asText(dealRow.stage) || base.stage,
    probability: asNumber(dealRow.probability) ?? base.probability,
    name: asText(dealRow.name) || base.name,
    description: asText(dealRow.description) || base.description,
    accountName: asText(account.name) || base.accountName,
    competitorInfo: asText(dealRow.competitor_name) || base.competitorInfo,
    lastActivity: latestActivityLabel(context, base.lastActivity),
    notes: [base.notes, noteText].filter(Boolean).join('\n\n') || undefined,
    holisticContext: {
      deal: dealRow,
      account,
      primaryContact: context.primary_contact || null,
      stakeholders: rows(context.stakeholders),
      recentActivities: rows(context.recent_activities),
      openTasks: rows(context.open_tasks),
      dealNotes: rows(context.deal_notes),
      dealTerms: context.deal_terms || null,
      recentEmails: rows(context.recent_email_messages),
      emailSummary: context.email_summary || null,
      emailEngagement: rows(context.email_engagement),
      contactMemory: rows(context.contact_memory),
      meta: context._meta || null,
    },
  };
}

export function SimplifiedCoachingPanel({ deal, dealId, onCoachingUpdate }: SimplifiedCoachingPanelProps) {
  const { organizationId } = useOrganizationAccess();
  const [coaching, setCoaching] = useState<DealCoachingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stakeholderWarning, setStakeholderWarning] = useState<string | null>(null);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);

  // Fetch real stakeholder data from deal_contacts before coaching
  const fetchStakeholderRankings = useCallback(async (): Promise<
    { status: 'success'; data: StakeholderRankingsData } |
    { status: 'unavailable'; reason: 'missing-deal-id' | 'query-error' | 'unexpected-error' }
  > => {
    if (!dealId) {
      return { status: 'unavailable', reason: 'missing-deal-id' };
    }

    try {
      const { data: dealContacts, error: dcError } = await supabase
        .from('deal_contacts')
        .select(`
          *,
          contact:contacts(id, first_name, last_name, full_name, email, title, company)
        `)
        .eq('deal_id', dealId);

      if (dcError || !dealContacts) {
        return { status: 'unavailable', reason: 'query-error' };
      }

      const distribution = {
        champion_influential: 0,
        champion_peripheral: 0,
        adversarial_influential: 0,
        adversarial_peripheral: 0,
      };

      let ranked = 0;
      let unranked = 0;

      dealContacts.forEach((dc: any) => {
        if (dc.quadrant && dc.quadrant in distribution) {
          distribution[dc.quadrant as keyof typeof distribution]++;
          ranked++;
        } else {
          unranked++;
        }
      });

      const contacts = dealContacts.map((dc: any) => ({
        name: dc.contact?.full_name || `${dc.contact?.first_name || ''} ${dc.contact?.last_name || ''}`.trim() || 'Unknown',
        title: dc.contact?.title || undefined,
        quadrant: dc.quadrant,
        supportScore: dc.support_axis,
        influenceScore: dc.influence_axis,
        roleInDeal: dc.role_in_deal || undefined,
      }));

      return {
        status: 'success',
        data: {
          total: dealContacts.length,
          ranked,
          unranked,
          distribution,
          contacts,
        },
      };
    } catch (err) {
      console.error('Failed to fetch stakeholder rankings:', err);
      return { status: 'unavailable', reason: 'unexpected-error' };
    }
  }, [dealId]);

  const fetchHolisticDealContext = useCallback(async (): Promise<
    { status: 'success'; data: Record<string, any> } |
    { status: 'unavailable'; reason: 'missing-context' | 'query-error' | 'unexpected-error' }
  > => {
    const contextOrgId = deal.organizationId || organizationId;
    if (!dealId || !contextOrgId) {
      return { status: 'unavailable', reason: 'missing-context' };
    }

    try {
      const { data, error } = await supabase.rpc('get_deal_context_for_llm', {
        p_deal_id: dealId,
        p_organization_id: contextOrgId,
      });

      if (error || !data) {
        return { status: 'unavailable', reason: 'query-error' };
      }

      return { status: 'success', data: data as Record<string, any> };
    } catch (err) {
      console.error('Failed to fetch holistic deal context:', err);
      return { status: 'unavailable', reason: 'unexpected-error' };
    }
  }, [deal.organizationId, dealId, organizationId]);

  const handleAnalyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStakeholderWarning(null);

    try {
      const warnings: string[] = [];
      const holisticContextResult = await fetchHolisticDealContext();

      // Enrich deal with actual stakeholder rankings from deal_contacts
      const stakeholderRankingsResult = await fetchStakeholderRankings();
      const contextEnrichedDeal = holisticContextResult.status === 'success'
        ? mergeHolisticDealContext(deal, holisticContextResult.data)
        : deal;
      const enrichedDeal: DealData = stakeholderRankingsResult.status === 'success'
        ? { ...contextEnrichedDeal, stakeholderRankings: stakeholderRankingsResult.data }
        : contextEnrichedDeal;

      if (holisticContextResult.status === 'unavailable' && holisticContextResult.reason !== 'missing-context') {
        warnings.push('Could not load full CRM/email context, so this analysis used visible deal data only.');
      }

      if (stakeholderRankingsResult.status === 'unavailable' && stakeholderRankingsResult.reason !== 'missing-deal-id') {
        warnings.push('Could not load stakeholder map data, so stakeholder-specific scoring may be less precise.');
      }

      if (warnings.length > 0) {
        setStakeholderWarning(warnings.join(' '));
      }

      const result = await coachDeal(enrichedDeal, 'groq');
      setCoaching(result);
      onCoachingUpdate?.(result);
      toast({
        title: 'Analysis Complete',
        description: 'SCOUTPAD coaching recommendations generated.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze deal';
      setError(errorMessage);
      toast({
        title: 'Analysis Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [deal, fetchHolisticDealContext, fetchStakeholderRankings, onCoachingUpdate]);

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-amber-500" />;
    }
  };

  const getRiskBadgeVariant = (level: string) => {
    switch (level) {
      case 'low': return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
      case 'medium': return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      case 'critical': return 'bg-red-500/10 text-red-700 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical': return <Zap className="h-4 w-4 text-red-500" />;
      case 'high': return <Target className="h-4 w-4 text-orange-500" />;
      default: return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  // Calculate grade from SCOUTPAD scores
  const getGradeInfo = () => {
    if (!coaching) return null;
    const scores = Object.values(coaching.scoutpadAnalysis).map(d => d.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    return calculateDealGrade(avgScore);
  };

  const gradeInfo = getGradeInfo();

  return (
    <div className="space-y-6">
      {/* Header with Analyze Button */}
      {!coaching && !isLoading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-purple-500" />
            <h3 className="text-lg font-semibold mb-2">AI Deal Analysis</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Analyze this deal using the SCOUTPAD framework to get actionable coaching insights and a deal grade.
            </p>
            <Button 
              onClick={handleAnalyze}
              size="lg"
              className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Sparkles className="h-4 w-4" />
              Analyze with AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 text-purple-500 animate-spin" />
              <p className="text-lg font-medium mb-2">Analyzing Deal...</p>
              <p className="text-muted-foreground">Running SCOUTPAD framework analysis</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {stakeholderWarning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{stakeholderWarning}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {coaching && !isLoading && gradeInfo && (
        <>
          {/* Hero Section - Grade and Key Metrics */}
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-purple-500/5 via-blue-500/5 to-transparent p-6">
              <div className="flex items-start gap-6">
                {/* Grade Circle */}
                <DealGradeBadge 
                  grade={gradeInfo.grade} 
                  score={gradeInfo.score} 
                  size="lg" 
                />

                {/* Metrics */}
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">AI Probability</p>
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold">{coaching.dealScore.currentProbability}%</span>
                        {getTrendIcon(coaching.dealScore.trendDirection)}
                        <span className="text-sm text-muted-foreground capitalize">
                          {coaching.dealScore.trendDirection}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Your Estimate</p>
                      <span className="text-2xl font-semibold text-muted-foreground">
                        {deal.probability || 'N/A'}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className={getRiskBadgeVariant(coaching.dealScore.riskLevel)}>
                      {coaching.dealScore.riskLevel.toUpperCase()} RISK
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      Q4 Close: {coaching.quarterlyForecast.closeThisQuarter}%
                      {coaching.quarterlyForecast.atRisk && (
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      )}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">{gradeInfo.summary}</p>
                </div>

                {/* Re-analyze button */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAnalyze}
                  className="shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Re-analyze
                </Button>
              </div>
            </div>
          </Card>

          {/* SCOUTPAD Analysis */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-500" />
                SCOUTPAD Analysis
              </h3>
              <div className="space-y-1">
                {SCOUTPAD_DIMENSIONS.map(({ key, letter, name }) => {
                  const dimension = coaching.scoutpadAnalysis[key as keyof typeof coaching.scoutpadAnalysis];
                  return (
                    <ScoutpadBar
                      key={key}
                      letter={letter}
                      name={name}
                      score={dimension.score}
                      evidence={dimension.evidence}
                      gaps={dimension.gaps}
                      impact={dimension.impact}
                      expanded={expandedDimension === key}
                      onToggle={() => setExpandedDimension(expandedDimension === key ? null : key)}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Priority Actions */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Priority Actions This Week
              </h3>
              <div className="space-y-3">
                {coaching.coaching.recommendedNextSteps.slice(0, 3).map((step, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    {getPriorityIcon(step.priority)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant={step.priority === 'critical' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {step.priority.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {step.timeframe.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="font-medium text-sm mb-1">{step.action}</p>
                      <p className="text-xs text-muted-foreground">{step.reasoning}</p>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 shrink-0">
                      {step.probabilityImpact}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risks and Opportunities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Risks */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-600">
                  <ShieldAlert className="h-4 w-4" />
                  Key Risks
                </h3>
                <div className="space-y-3">
                  {coaching.coaching.risks.map((risk, idx) => (
                    <div key={idx} className="border-l-2 border-red-200 pl-3">
                      <p className="text-sm font-medium text-foreground mb-1">{risk.risk}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-red-500 font-medium">Mitigation:</span> {risk.mitigation}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Opportunities */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-emerald-600">
                  <Lightbulb className="h-4 w-4" />
                  Opportunities
                </h3>
                <div className="space-y-3">
                  {coaching.coaching.opportunities.map((opp, idx) => (
                    <div key={idx} className="border-l-2 border-emerald-200 pl-3">
                      <p className="text-sm font-medium text-foreground mb-1">{opp.opportunity}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-emerald-500 font-medium">Action:</span> {opp.action}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coaching Summary */}
          <Card className="bg-gradient-to-br from-purple-500/5 to-blue-500/5">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">Coaching Summary</h3>
              <p className="text-sm text-muted-foreground">
                {coaching.quarterlyForecast.coaching}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
