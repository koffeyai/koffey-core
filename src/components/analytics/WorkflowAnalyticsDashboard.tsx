import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Users, 
  AlertTriangle, 
  CheckCircle,
  BarChart3,
  Target,
  Brain,
  Zap
} from 'lucide-react';
import { WorkflowOptimizationService } from '@/services/workflowOptimizationService';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { openChatPanelPrompt } from '@/lib/appNavigation';

type CRMEntityType = 'contacts' | 'deals' | 'accounts' | 'tasks' | 'activities';

interface WorkflowAnalyticsDashboardProps {
  className?: string;
}

export const WorkflowAnalyticsDashboard: React.FC<WorkflowAnalyticsDashboardProps> = ({ 
  className = "" 
}) => {
  const { organizationId } = useOrganizationAccess();
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'conversion' | 'efficiency' | 'bottlenecks'>('conversion');

  useEffect(() => {
    if (organizationId) {
      loadWorkflowInsights();
    }
  }, [organizationId]);

  const loadWorkflowInsights = async () => {
    try {
      setLoading(true);
      const data = await WorkflowOptimizationService.getOrganizationInsights(organizationId!);
      setInsights(data);
    } catch (error) {
      console.error('Error loading workflow insights:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-1/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!insights) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            No workflow data available yet. Start using forms to see analytics.
          </div>
        </CardContent>
      </Card>
    );
  }

  const conversionData = Object.entries(insights.conversionRates).map(([entity, rate]) => {
    const numRate = Number(rate);
    return {
      entity: entity as CRMEntityType,
      rate: numRate,
      trend: numRate > 0.8 ? 'up' : numRate > 0.6 ? 'stable' : 'down'
    };
  });

  const avgConversionRate = conversionData.reduce((sum, item) => sum + item.rate, 0) / conversionData.length;

  const requestOptimization = (bottleneck: any) => {
    openChatPanelPrompt(
      `Create a workflow optimization plan for the ${bottleneck.entityType} field "${bottleneck.field}". It has an average stuck time of ${Math.round(bottleneck.avgStuckTime / 60)} minutes and affects ${bottleneck.affectedUsers} users. Recommend the smallest production-safe CRM change.`,
      { source: 'workflow_analytics', type: 'bottleneck_optimization', bottleneck }
    );
  };

  const scheduleTraining = (training: any) => {
    openChatPanelPrompt(
      `Help me schedule or draft enablement for "${training.topic}". Priority: ${training.priority}. ${training.affectedUsers.length} users could benefit. Suggest the training format, agenda, and follow-up action.`,
      { source: 'workflow_analytics', type: 'training_recommendation', training }
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(avgConversionRate * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              +2.1% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bottlenecks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.topBottlenecks.length}</div>
            <p className="text-xs text-muted-foreground">
              Fields causing delays
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peak Usage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {insights.peakUsageHours[0]}:00-{insights.peakUsageHours[0] + 1}:00
            </div>
            <p className="text-xs text-muted-foreground">
              Most active hour
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Assistance Rate</CardTitle>
            <Brain className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(insights.mostEffectiveAssistanceTypes[0]?.successRate * 100 || 0).toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Success rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="conversion">Conversion Rates</TabsTrigger>
          <TabsTrigger value="efficiency">Efficiency</TabsTrigger>
          <TabsTrigger value="bottlenecks">Bottlenecks</TabsTrigger>
        </TabsList>

        <TabsContent value="conversion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Form Conversion by Entity Type</CardTitle>
              <CardDescription>
                Percentage of forms completed successfully
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversionData.map(({ entity, rate, trend }) => (
                <div key={entity} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Badge variant="outline" className="capitalize">
                      {entity}
                    </Badge>
                    {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                    {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                  </div>
                  <div className="flex items-center space-x-3">
                    <Progress value={rate * 100} className="w-32" />
                    <span className="text-sm font-medium w-12">
                      {(rate * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="efficiency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Assistance Effectiveness</CardTitle>
              <CardDescription>
                Success rates by assistance type
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.mostEffectiveAssistanceTypes.map((assistance: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm capitalize">
                      {assistance.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Progress value={assistance.successRate * 100} className="w-32" />
                    <span className="text-sm font-medium w-12">
                      {(assistance.successRate * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Peak Usage Hours</CardTitle>
              <CardDescription>
                When your team is most active
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 gap-2">
                {insights.peakUsageHours.slice(0, 6).map((hour: number, index: number) => (
                  <div key={index} className="text-center p-2 bg-primary/10 rounded">
                    <div className="text-sm font-medium">{hour}:00</div>
                    <div className="text-xs text-muted-foreground">Peak</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bottlenecks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Form Bottlenecks</CardTitle>
              <CardDescription>
                Fields where users typically get stuck
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.topBottlenecks.length > 0 ? (
                insights.topBottlenecks.map((bottleneck: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Badge variant="destructive" className="capitalize">
                          {bottleneck.entityType}
                        </Badge>
                        <span className="font-medium">{bottleneck.field}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Avg stuck time: {Math.round(bottleneck.avgStuckTime / 60)}min • 
                        {bottleneck.affectedUsers} users affected
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => requestOptimization(bottleneck)}>
                      Optimize
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                  <p>No major bottlenecks detected! Your forms are running smoothly.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {insights.recommendedTraining.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Training Recommendations</CardTitle>
                <CardDescription>
                  Suggested training topics based on user patterns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.recommendedTraining.map((training: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Badge 
                          variant={training.priority === 'high' ? 'destructive' : 'secondary'}
                        >
                          {training.priority}
                        </Badge>
                        <span className="font-medium">{training.topic}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {training.affectedUsers.length} users could benefit
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => scheduleTraining(training)}>
                      Schedule
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
