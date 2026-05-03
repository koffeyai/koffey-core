import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Target,
  Users,
  DollarSign,
  Calendar
} from 'lucide-react';
import { DealData, DealCoachingResult, coachDeal, DimensionQuality } from '@/services/dealCoachingService';
import { toast } from '@/hooks/use-toast';

interface DealCoachingPanelProps {
  deal: DealData;
  onCoachingUpdate?: (coaching: DealCoachingResult) => void;
}

export const DealCoachingPanel: React.FC<DealCoachingPanelProps> = ({ 
  deal, 
  onCoachingUpdate 
}) => {
  const [coaching, setCoaching] = useState<DealCoachingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'anthropic' | 'groq' | 'perplexity'>('groq');

  const handleAnalyzeDeal = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await coachDeal(deal, selectedProvider);
      setCoaching(result);
      onCoachingUpdate?.(result);
      
      toast({
        title: 'Deal Analysis Complete',
        description: 'SCOUTPAD coaching recommendations generated successfully.',
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
  }, [deal, selectedProvider, onCoachingUpdate]);

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'high': return 'bg-orange-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const withQuality = useCallback((key: keyof DealCoachingResult['scoutpadAnalysis'], dimension: any) => ({
    ...dimension,
    quality: coaching?.qualityAnalytics?.dimensions?.[key],
  }), [coaching]);

  const ScoutpadDimensionCard = ({ 
    title, 
    dimension, 
    icon: Icon 
  }: { 
    title: string; 
    dimension: any; 
    icon: React.ComponentType<any> 
  }) => (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-sm">
          <Icon className="h-4 w-4 mr-2" />
          {title}
          <Badge variant="outline" className="ml-auto">
            {dimension.score}/10
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Progress value={dimension.score * 10} className="mb-3" />
        {(dimension.quality || dimension.qualityAnalytics || dimension.dimensionQuality) && (
          <div className="mb-3">
            <p className="text-xs font-medium text-blue-700 mb-1">Quality:</p>
            <div className="flex items-center gap-2">
              <Progress
                value={(((dimension.quality || dimension.qualityAnalytics || dimension.dimensionQuality) as DimensionQuality).qualityScore || 0) * 10}
                className="h-2"
              />
              <span className="text-xs text-muted-foreground">
                {((dimension.quality || dimension.qualityAnalytics || dimension.dimensionQuality) as DimensionQuality).qualityScore || 0}/10
              </span>
            </div>
          </div>
        )}
        
        {dimension.evidence.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-medium text-green-700 mb-1">Evidence:</p>
            <ul className="text-xs text-muted-foreground">
              {dimension.evidence.map((item: string, idx: number) => (
                <li key={idx} className="flex items-start">
                  <CheckCircle className="h-3 w-3 text-green-500 mr-1 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {dimension.gaps.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-medium text-orange-700 mb-1">Gaps:</p>
            <ul className="text-xs text-muted-foreground">
              {dimension.gaps.map((item: string, idx: number) => (
                <li key={idx} className="flex items-start">
                  <AlertTriangle className="h-3 w-3 text-orange-500 mr-1 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground font-medium">{dimension.impact}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Brain className="h-5 w-5 mr-2" />
              Deal Coaching Analysis
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={selectedProvider} 
                onChange={(e) => setSelectedProvider(e.target.value as any)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="groq">Groq (Fast)</option>
                <option value="openai">OpenAI GPT</option>
                <option value="anthropic">Claude</option>
                <option value="perplexity">Perplexity</option>
              </select>
              <Button onClick={handleAnalyzeDeal} disabled={isLoading} size="sm">
                {isLoading ? 'Analyzing...' : 'Analyze Deal'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        
        {/* Deal Summary */}
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 mr-2 text-green-500" />
              <span>${deal.dealSize.toLocaleString()}</span>
            </div>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-blue-500" />
              <span>{deal.closeDate}</span>
            </div>
            <div className="flex items-center">
              <Target className="h-4 w-4 mr-2 text-purple-500" />
              <span>{deal.stage}</span>
            </div>
            <div className="flex items-center">
              <Users className="h-4 w-4 mr-2 text-orange-500" />
              <span>{deal.probability || 'N/A'}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Analyzing deal with SCOUTPAD framework...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coaching Results */}
      {coaching && !isLoading && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scoutpad">SCOUTPAD</TabsTrigger>
            <TabsTrigger value="coaching">Coaching</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Deal Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{coaching.dealScore.currentProbability}%</span>
                    {getTrendIcon(coaching.dealScore.trendDirection)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {coaching.dealScore.confidenceLevel} confidence
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Risk Level</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${getRiskColor(coaching.dealScore.riskLevel)} mr-2`}></div>
                    <span className="capitalize">{coaching.dealScore.riskLevel}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Q4 Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{coaching.quarterlyForecast.closeThisQuarter}%</span>
                    {coaching.quarterlyForecast.atRisk && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {coaching.quarterlyForecast.atRisk ? 'At Risk' : 'On Track'}
                  </p>
                </CardContent>
              </Card>

              {coaching.qualityAnalytics && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">SCOUTPAD Quality</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-bold">{coaching.qualityAnalytics.overallScore}/10</span>
                      <Badge variant="outline" className="capitalize">
                        {coaching.qualityAnalytics.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {coaching.qualityAnalytics.summary}
                    </p>
                    {coaching.analysisMeta && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Depth: <span className="font-medium capitalize">{coaching.analysisMeta.depthMode}</span> •
                        Budget: ~{coaching.analysisMeta.tokenBudget.estimatedInputTokens + coaching.analysisMeta.tokenBudget.maxOutputTokens} tokens
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {coaching.qualityAnalytics?.guardrailDiagnostics && coaching.qualityAnalytics.guardrailDiagnostics.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Guardrail Diagnostics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {coaching.qualityAnalytics.guardrailDiagnostics.filter(d => d.triggered).map((diag, idx) => (
                    <div key={idx} className="rounded border p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={diag.severity === 'critical' ? 'destructive' : 'secondary'}>
                          {diag.severity}
                        </Badge>
                        <span className="text-muted-foreground">{diag.before}/10 → {diag.after}/10</span>
                      </div>
                      <p className="font-medium">{diag.reason}</p>
                      <p className="text-muted-foreground mt-1">{diag.affectedDimensions.join(', ')}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {coaching.proactiveActions && coaching.proactiveActions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Proactive Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {coaching.proactiveActions.map((action, idx) => (
                    <div key={idx} className="rounded border p-2 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={action.priority === 'critical' ? 'destructive' : 'secondary'}>
                          {action.priority}
                        </Badge>
                        <Badge variant="outline">{action.dueWindow}</Badge>
                      </div>
                      <p className="font-medium">{action.action}</p>
                      <p className="text-muted-foreground mt-1">{action.rationale}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* SCOUTPAD Tab */}
          <TabsContent value="scoutpad" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <ScoutpadDimensionCard 
                  title="Stakeholders" 
                  dimension={withQuality('stakeholders', coaching.scoutpadAnalysis.stakeholders)}
                  icon={Users}
                />
                <ScoutpadDimensionCard 
                  title="Champion" 
                  dimension={withQuality('champion', coaching.scoutpadAnalysis.champion)}
                  icon={CheckCircle}
                />
                <ScoutpadDimensionCard 
                  title="Opportunity" 
                  dimension={withQuality('opportunity', coaching.scoutpadAnalysis.opportunity)}
                  icon={Target}
                />
                <ScoutpadDimensionCard 
                  title="User Agreements" 
                  dimension={withQuality('userAgreements', coaching.scoutpadAnalysis.userAgreements)}
                  icon={CheckCircle}
                />
              </div>
              <div>
                <ScoutpadDimensionCard 
                  title="Timeline" 
                  dimension={withQuality('timeline', coaching.scoutpadAnalysis.timeline)}
                  icon={Clock}
                />
                <ScoutpadDimensionCard 
                  title="Problem" 
                  dimension={withQuality('problem', coaching.scoutpadAnalysis.problem)}
                  icon={AlertTriangle}
                />
                <ScoutpadDimensionCard 
                  title="Approval Chain" 
                  dimension={withQuality('approvalChain', coaching.scoutpadAnalysis.approvalChain)}
                  icon={Users}
                />
                <ScoutpadDimensionCard 
                  title="Decision Criteria" 
                  dimension={withQuality('decisionCriteria', coaching.scoutpadAnalysis.decisionCriteria)}
                  icon={Target}
                />
              </div>
            </div>
          </TabsContent>

          {/* Coaching Tab */}
          <TabsContent value="coaching" className="space-y-4">
            {/* Recommended Next Steps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recommended Next Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {coaching.coaching.recommendedNextSteps.map((step, idx) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={getPriorityColor(step.priority) as any}>
                          {step.priority}
                        </Badge>
                        <Badge variant="outline">
                          {step.timeframe.replace('_', ' ')}
                        </Badge>
                        <Badge variant="secondary">
                          {step.probabilityImpact}
                        </Badge>
                      </div>
                    </div>
                    <p className="font-medium text-sm mb-1">{step.action}</p>
                    <p className="text-xs text-muted-foreground">{step.reasoning}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-red-700">Risks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coaching.coaching.risks.map((risk, idx) => (
                    <div key={idx} className="border-l-4 border-red-200 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <Badge variant="outline" className="text-xs">
                          {risk.probability} probability
                        </Badge>
                      </div>
                      <p className="text-sm font-medium mb-1">{risk.risk}</p>
                      <p className="text-xs text-muted-foreground">{risk.mitigation}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-green-700">Opportunities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coaching.coaching.opportunities.map((opp, idx) => (
                    <div key={idx} className="border-l-4 border-green-200 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <Badge variant="outline" className="text-xs">
                          {opp.probability} probability
                        </Badge>
                      </div>
                      <p className="text-sm font-medium mb-1">{opp.opportunity}</p>
                      <p className="text-xs text-muted-foreground">{opp.action}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quarterly Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Key Milestones</p>
                    <ul className="space-y-1">
                      {coaching.quarterlyForecast.keyMilestones.map((milestone, idx) => (
                        <li key={idx} className="flex items-center text-sm">
                          <Clock className="h-3 w-3 mr-2 text-blue-500" />
                          {milestone}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-2">Coaching Summary</p>
                    <p className="text-sm text-muted-foreground">
                      {coaching.quarterlyForecast.coaching}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
