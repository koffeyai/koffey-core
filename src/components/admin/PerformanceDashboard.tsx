import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  TrendingDown,
  Download,
  RefreshCw,
  Zap,
  Clock,
  HardDrive
} from 'lucide-react';
import { OptimizedChart } from '@/components/analytics/OptimizedChart';
import { performanceMonitor, usePerformanceMonitoring } from '@/lib/performanceMonitor';

export const PerformanceDashboard: React.FC = () => {
  const { alerts, metrics } = usePerformanceMonitoring();
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState('1h');

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleExport = () => {
    const data = performanceMonitor.exportMetrics();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-metrics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (trend: string) => {
    switch (trend) {
      case 'improving': return 'text-green-600';
      case 'degrading': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4" />;
      case 'degrading': return <TrendingDown className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Performance Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time application performance metrics and alerts
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* ACTIVE ALERTS */}
      {alerts.length > 0 && (
        <Alert variant={alerts.some(a => a.level === 'critical') ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                {alerts.length} active performance alert{alerts.length > 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                {alerts.map(alert => (
                  <Badge key={alert.id} variant={alert.level === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.metric}: {alert.value.toFixed(1)}{alert.threshold && ` (>${alert.threshold})`}
                  </Badge>
                ))}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* WEB VITALS OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Largest Contentful Paint */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">LCP</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.LCP?.average ? `${metrics.LCP.average.toFixed(0)}ms` : '--'}
            </div>
            <div className={`flex items-center text-xs ${getStatusColor(metrics.LCP?.trend || 'stable')}`}>
              {getStatusIcon(metrics.LCP?.trend || 'stable')}
              <span className="ml-1">
                {metrics.LCP?.trend || 'No data'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* First Input Delay */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FID</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.FID?.average ? `${metrics.FID.average.toFixed(0)}ms` : '--'}
            </div>
            <div className={`flex items-center text-xs ${getStatusColor(metrics.FID?.trend || 'stable')}`}>
              {getStatusIcon(metrics.FID?.trend || 'stable')}
              <span className="ml-1">
                {metrics.FID?.trend || 'No data'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cumulative Layout Shift */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CLS</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.CLS?.average ? metrics.CLS.average.toFixed(3) : '--'}
            </div>
            <div className={`flex items-center text-xs ${getStatusColor(metrics.CLS?.trend || 'stable')}`}>
              {getStatusIcon(metrics.CLS?.trend || 'stable')}
              <span className="ml-1">
                {metrics.CLS?.trend || 'No data'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.memoryUsage?.average ? `${metrics.memoryUsage.average.toFixed(0)}MB` : '--'}
            </div>
            <div className={`flex items-center text-xs ${getStatusColor(metrics.memoryUsage?.trend || 'stable')}`}>
              {getStatusIcon(metrics.memoryUsage?.trend || 'stable')}
              <span className="ml-1">
                {metrics.memoryUsage?.trend || 'No data'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DETAILED METRICS */}
      <Tabs value={timeRange} onValueChange={setTimeRange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="1h">Last Hour</TabsTrigger>
          <TabsTrigger value="6h">Last 6 Hours</TabsTrigger>
          <TabsTrigger value="24h">Last 24 Hours</TabsTrigger>
        </TabsList>

        <TabsContent value={timeRange} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Response Time Chart */}
            <OptimizedChart
              data={performanceMonitor.getAllMetrics(timeRangeMs[timeRange as keyof typeof timeRangeMs]).filter(m => m.name === 'api_response_time')}
              title="API Response Times"
              type="line"
              xKey="timestamp"
              yKeys={['value']}
              colors={['hsl(var(--primary))']}
              height={250}
            />

            {/* Error Rate Chart */}
            <OptimizedChart
              data={performanceMonitor.getAllMetrics(timeRangeMs[timeRange as keyof typeof timeRangeMs]).filter(m => m.name === 'error_rate')}
              title="Error Rate"
              type="line"
              xKey="timestamp"
              yKeys={['value']}
              colors={['hsl(var(--destructive))']}
              height={250}
            />

            {/* Memory Usage Chart */}
            <OptimizedChart
              data={performanceMonitor.getAllMetrics(timeRangeMs[timeRange as keyof typeof timeRangeMs]).filter(m => m.name === 'memory_usage')}
              title="Memory Usage"
              type="line"
              xKey="timestamp"
              yKeys={['value']}
              colors={['hsl(var(--secondary))']}
              height={250}
            />

            {/* Bundle Size Chart */}
            <OptimizedChart
              data={performanceMonitor.getAllMetrics(timeRangeMs[timeRange as keyof typeof timeRangeMs]).filter(m => m.name === 'bundle_size')}
              title="Bundle Size"
              type="line"
              xKey="timestamp"
              yKeys={['value']}
              colors={['hsl(var(--accent))']}
              height={250}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* RECOMMENDATIONS */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.LCP?.average && metrics.LCP.average > 2500 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Largest Contentful Paint is above 2.5s. Consider optimizing images and reducing server response times.
                </AlertDescription>
              </Alert>
            )}

            {metrics.CLS?.average && metrics.CLS.average > 0.1 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cumulative Layout Shift is above 0.1. Consider setting dimensions for images and avoiding dynamic content insertion.
                </AlertDescription>
              </Alert>
            )}

            {metrics.memoryUsage?.average && metrics.memoryUsage.average > 50 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Memory usage is high. Consider implementing memory cleanup and optimizing data structures.
                </AlertDescription>
              </Alert>
            )}

            {alerts.length === 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  All performance metrics are within acceptable ranges. Great job!
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};