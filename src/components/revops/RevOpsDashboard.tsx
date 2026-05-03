import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRevOpsDashboard } from '@/hooks/useRevOpsDashboard';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Target,
  Users,
  DollarSign,
  Activity,
  AlertCircle,
  RefreshCw,
  Zap,
  BarChart3,
  Clock,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RevOpsDashboardProps {
  className?: string;
}

const RevOpsDashboard: React.FC<RevOpsDashboardProps> = ({ className = '' }) => {
  const {
    dataQuality,
    pipelineHealth,
    leadScores,
    insights,
    loading,
    error,
    lastUpdated,
    refreshAll,
    isInitialLoading,
    hasData,
    storeCounts
  } = useRevOpsDashboard();

  if (isInitialLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="text-lg font-medium">Loading RevOps Intelligence...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !hasData) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>RevOps Analytics Error</AlertTitle>
          <AlertDescription>
            {error}. Please try refreshing or contact support if the issue persists.
          </AlertDescription>
        </Alert>
        <Button onClick={refreshAll} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry Analysis
        </Button>
      </div>
    );
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
      case 'healthy':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining':
      case 'critical':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'at_risk':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RevOps Intelligence</h1>
          <p className="text-muted-foreground">
            Real-time sales operations analytics and recommendations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button 
            onClick={refreshAll} 
            variant="outline" 
            size="sm"
            disabled={loading.dataQuality || loading.pipelineHealth}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(loading.dataQuality || loading.pipelineHealth) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && hasData && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Data Quality Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dataQuality?.overall_score || 0}%
            </div>
            <Badge variant={dataQuality?.grade === 'Excellent' ? 'default' : 'secondary'} className="mt-1">
              {dataQuality?.grade || 'Loading...'}
            </Badge>
            {dataQuality && (
              <Progress 
                value={dataQuality.overall_score} 
                className="mt-2" 
              />
            )}
          </CardContent>
        </Card>

        {/* Pipeline Health */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Health</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pipelineHealth?.overview.health_indicators.health_score || 0}%
            </div>
            <div className="flex items-center space-x-1 mt-1">
              {insights && getTrendIcon(insights.pipeline_health_trend)}
              <span className="text-sm capitalize">
                {insights?.pipeline_health_trend || 'Loading...'}
              </span>
            </div>
            {pipelineHealth && (
              <Progress 
                value={pipelineHealth.overview.health_indicators.health_score} 
                className="mt-2"
              />
            )}
          </CardContent>
        </Card>

        {/* Active Pipeline Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${pipelineHealth?.overview.active_pipeline.total_value?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {storeCounts.deals ?? pipelineHealth?.overview.active_pipeline.deal_count ?? 0} active deals
            </p>
            <p className="text-xs text-muted-foreground">
              Win Rate: {pipelineHealth?.overview.win_rate || 0}%
            </p>
          </CardContent>
        </Card>

        {/* Lead Quality */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lead Quality</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {leadScores.filter(s => ['A+', 'A', 'B+'].includes(s.score_grade)).length}
            </div>
            <p className="text-xs text-muted-foreground">
              High-quality leads (A/B+ grade)
            </p>
            <div className="flex items-center space-x-1 mt-1">
              {insights && getTrendIcon(insights.lead_quality_trend)}
              <span className="text-sm capitalize">
                {insights?.lead_quality_trend || 'Loading...'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="quality">Data Quality</TabsTrigger>
          <TabsTrigger value="leads">Lead Scoring</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Immediate Actions */}
          {insights?.recommended_actions && insights.recommended_actions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Recommended Actions
                </CardTitle>
                <CardDescription>
                  Prioritized actions to improve your RevOps performance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.recommended_actions.slice(0, 3).map((action, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <div className="flex-shrink-0 mt-1">
                      {action.urgency === 'immediate' && <AlertCircle className="h-4 w-4 text-red-500" />}
                      {action.urgency === 'this_week' && <Clock className="h-4 w-4 text-yellow-500" />}
                      {action.urgency === 'this_month' && <Activity className="h-4 w-4 text-blue-500" />}
                    </div>
                    <div className="flex-grow">
                      <p className="font-medium">{action.action}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {action.category.replace('_', ' ')}
                        </Badge>
                        <Badge variant={getPriorityColor(action.expected_impact) as any} className="text-xs">
                          {action.expected_impact} impact
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {action.urgency.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Data Quality Priorities */}
          {insights?.data_quality_priority && insights.data_quality_priority.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Data Quality Priorities</CardTitle>
                <CardDescription>
                  Areas that need attention to improve data quality
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {insights.data_quality_priority.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{item.area}</p>
                        <p className="text-sm text-muted-foreground">{item.impact}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getPriorityColor(item.priority) as any}>
                          {item.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {item.estimated_effort} effort
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          {pipelineHealth && (
            <>
              {/* Pipeline Health Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Overdue Deals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {pipelineHealth.overview.health_indicators.overdue_deals}
                    </div>
                    <p className="text-xs text-muted-foreground">Require immediate attention</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Closing Soon</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">
                      {pipelineHealth.overview.health_indicators.closing_soon}
                    </div>
                    <p className="text-xs text-muted-foreground">Next 30 days</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Missing Amounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                      {pipelineHealth.overview.health_indicators.missing_amounts}
                    </div>
                    <p className="text-xs text-muted-foreground">Need qualification</p>
                  </CardContent>
                </Card>
              </div>

              {/* Pipeline Stages */}
              {pipelineHealth.funnel && pipelineHealth.funnel.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Pipeline by Stage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {pipelineHealth.funnel.map((stage, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{stage.stage}</span>
                              <span className="text-sm text-muted-foreground">
                                {stage.deal_count} deals • ${stage.stage_value.toLocaleString()}
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full"
                                style={{
                                  width: `${Math.max(5, (stage.deal_count / Math.max(...pipelineHealth.funnel.map(f => f.deal_count))) * 100)}%`
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Data Quality Tab */}
        <TabsContent value="quality" className="space-y-4">
          {dataQuality && (
            <>
              {/* Quality Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Contacts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storeCounts.contacts ?? dataQuality.contacts.total_contacts}</div>
                    <p className="text-xs text-muted-foreground">
                      {dataQuality.contacts.quality_indicators.completeness_rate}% complete
                    </p>
                    <Progress value={dataQuality.contacts.quality_indicators.completeness_rate} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Deals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storeCounts.deals ?? dataQuality.deals.total_deals}</div>
                    <p className="text-xs text-muted-foreground">
                      Win Rate: {dataQuality.deals.pipeline_health.win_rate}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storeCounts.accounts ?? dataQuality.accounts.total_accounts}</div>
                    <p className="text-xs text-muted-foreground">
                      {dataQuality.accounts.account_intelligence.complete_accounts} enriched
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* Lead Scoring Tab */}
        <TabsContent value="leads" className="space-y-4">
          {/* Lead Score Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Lead Score Distribution</CardTitle>
              <CardDescription>Quality distribution of your lead database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'].map(grade => {
                  const count = leadScores.filter(s => s.score_grade === grade).length;
                  const percentage = leadScores.length > 0 ? (count / leadScores.length * 100) : 0;
                  
                  return (
                    <div key={grade} className="text-center p-3 border rounded">
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs font-medium">{grade}</div>
                      <div className="text-xs text-muted-foreground">{Math.round(percentage)}%</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RevOpsDashboard;