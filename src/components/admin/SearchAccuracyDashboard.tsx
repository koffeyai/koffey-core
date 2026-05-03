import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSearchAccuracyMetrics, useFailingQueries, SearchAccuracyMetrics, FailingQuery } from '@/hooks/useSearchAccuracyMetrics';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { 
  Search, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  MousePointerClick,
  TrendingUp,
  Activity,
  Loader2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type TimeRange = '24h' | '7d' | '30d';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(142.1 76.2% 36.3%)',
  'hsl(47.9 95.8% 53.1%)',
  'hsl(280 65% 60%)',
  'hsl(200 80% 50%)',
];

interface MetricCardProps {
  title: string;
  value: string | number;
  target?: string;
  status: 'good' | 'warning' | 'error' | 'neutral';
  icon: React.ReactNode;
  description?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, target, status, icon, description }) => {
  const statusColors = {
    good: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400',
    neutral: 'text-muted-foreground'
  };

  const statusBg = {
    good: 'bg-green-500/10',
    warning: 'bg-amber-500/10',
    error: 'bg-red-500/10',
    neutral: 'bg-muted'
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn('text-3xl font-bold', statusColors[status])}>{value}</p>
            {target && (
              <p className="text-xs text-muted-foreground">{target}</p>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className={cn('p-3 rounded-full', statusBg[status])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SearchAccuracyDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const { organizationId } = useOrganizationAccess();

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useSearchAccuracyMetrics(
    organizationId,
    timeRange
  );

  const { data: failingQueries, isLoading: failingLoading, refetch: refetchFailing } = useFailingQueries(
    organizationId,
    timeRange,
    15
  );

  const handleRefresh = () => {
    refetchMetrics();
    refetchFailing();
  };

  // Prepare intent distribution data for pie chart
  const intentChartData = metrics?.intent_distribution 
    ? Object.entries(metrics.intent_distribution).map(([name, value]) => ({
        name: name.replace(/_/g, ' ').replace(/search|list/gi, '').trim() || name,
        value: value as number
      }))
    : [];

  const getZeroResultStatus = (rate: number): 'good' | 'warning' | 'error' => {
    if (rate < 5) return 'good';
    if (rate < 10) return 'warning';
    return 'error';
  };

  const getTimeStatus = (ms: number): 'good' | 'warning' | 'error' => {
    if (ms < 500) return 'good';
    if (ms < 1000) return 'warning';
    return 'error';
  };

  const getRefinementStatus = (rate: number): 'good' | 'warning' | 'error' => {
    if (rate < 10) return 'good';
    if (rate < 20) return 'warning';
    return 'error';
  };

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Please select an organization to view search accuracy metrics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            Search Accuracy Dashboard
          </h2>
          <p className="text-muted-foreground">
            Monitor AI chat search quality and identify issues
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7 days</TabsTrigger>
              <TabsTrigger value="30d">30 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Health Status Banner */}
      {metrics && (
        <Card className={cn(
          'border-l-4',
          metrics.is_healthy ? 'border-l-green-500 bg-green-500/5' : 'border-l-red-500 bg-red-500/5'
        )}>
          <CardContent className="py-4 flex items-center gap-3">
            {metrics.is_healthy ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-600">
                  Search is healthy — zero-result rate is below 5%
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-600">
                  Search needs attention — {metrics.zero_result_rate?.toFixed(1)}% of queries return no results
                </span>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metric Cards */}
      {metricsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Zero-Result Rate"
            value={`${metrics.zero_result_rate?.toFixed(1) || 0}%`}
            target="Target: < 5%"
            status={getZeroResultStatus(metrics.zero_result_rate || 0)}
            icon={<XCircle className={cn('h-5 w-5', getZeroResultStatus(metrics.zero_result_rate || 0) === 'good' ? 'text-green-600' : 'text-red-600')} />}
            description={`${metrics.zero_result_count || 0} of ${metrics.total || 0} queries`}
          />
          <MetricCard
            title="Avg Response Time"
            value={`${metrics.avg_time_ms || 0}ms`}
            target="Target: < 500ms"
            status={getTimeStatus(metrics.avg_time_ms || 0)}
            icon={<Clock className={cn('h-5 w-5', getTimeStatus(metrics.avg_time_ms || 0) === 'good' ? 'text-green-600' : 'text-amber-600')} />}
          />
          <MetricCard
            title="Refinement Rate"
            value={`${metrics.refinement_rate?.toFixed(1) || 0}%`}
            target="Target: < 10%"
            status={getRefinementStatus(metrics.refinement_rate || 0)}
            icon={<RefreshCw className={cn('h-5 w-5', getRefinementStatus(metrics.refinement_rate || 0) === 'good' ? 'text-green-600' : 'text-amber-600')} />}
            description={`${metrics.refinement_count || 0} refinements`}
          />
          <MetricCard
            title="Click-Through Rate"
            value={`${metrics.click_through_rate?.toFixed(1) || 0}%`}
            status="neutral"
            icon={<MousePointerClick className="h-5 w-5 text-blue-600" />}
            description="Users clicking on results"
          />
        </div>
      ) : null}

      {/* Charts and Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Intent Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Intent Distribution
            </CardTitle>
            <CardDescription>
              Breakdown of search intents in the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {intentChartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={intentChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {intentChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [value, 'Queries']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No data available for the selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failing Queries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Failing Queries
            </CardTitle>
            <CardDescription>
              Recent queries that returned no results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {failingLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : failingQueries && failingQueries.length > 0 ? (
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead className="text-right">Attempt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failingQueries.map((query) => (
                      <TableRow key={query.id}>
                        <TableCell className="font-mono text-sm max-w-[200px] truncate">
                          {query.search_query}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {query.intent}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {query.time_to_result_ms}ms
                        </TableCell>
                        <TableCell className="text-right">
                          {query.refinement_attempt > 1 ? (
                            <Badge variant="secondary" className="text-xs">
                              #{query.refinement_attempt}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">1</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>No failing queries in this period!</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      {metrics && metrics.total > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Total queries analyzed: <strong className="text-foreground">{metrics.total}</strong>
              </span>
              <span>
                Avg match score: <strong className="text-foreground">{(metrics.avg_match_score || 0).toFixed(2)}</strong>
              </span>
              <span>
                Data range: <strong className="text-foreground">{timeRange === '24h' ? 'Last 24 hours' : timeRange === '7d' ? 'Last 7 days' : 'Last 30 days'}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SearchAccuracyDashboard;
