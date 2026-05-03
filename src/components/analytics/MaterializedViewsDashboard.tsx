import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnalyticsStore } from '@/stores/analyticsStore';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePerformanceStore } from '@/stores/performanceStore';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Activity, 
  Building, 
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Zap,
  CheckCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

export const MaterializedViewsDashboard = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const { actions, metrics, loading } = useAnalyticsStore();
  const performanceStore = usePerformanceStore();
  const webVitals = performanceStore.webVitals || {};
  const perfAlerts = performanceStore.alerts || [];
  const activeAlerts: any[] = []; // Simplified for now
  const memoryMetrics = null; // Simplified for now
  
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [activeTab, setActiveTab] = useState('revenue');
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [engagementData, setEngagementData] = useState<any[]>([]);
  const [accountHealth, setAccountHealth] = useState<any[]>([]);
  const [salesActivity, setSalesActivity] = useState<any[]>([]);

  const organizationIds = currentOrganization ? [currentOrganization.organization_id] : [];

  const loadDashboardData = async () => {
    if (!organizationIds.length) return;

    try {
      const [revenue, engagement, accounts, activity] = await Promise.all([
        actions.getRevenueAnalytics(organizationIds, timeRange),
        actions.getCustomerEngagement(organizationIds),
        actions.getAccountHealth(organizationIds),
        actions.getSalesActivity(organizationIds)
      ]);

      setRevenueData(revenue || []);
      setEngagementData(engagement || []);
      setAccountHealth(accounts || []);
      setSalesActivity(activity || []);
      
      // Refresh overall metrics
      await actions.refreshMetrics(organizationIds);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [timeRange, organizationIds]);

  // Calculate KPIs from materialized view data
  const kpis = React.useMemo(() => {
    const totalRevenue = revenueData.reduce((sum, r) => sum + (r.total_revenue || 0), 0);
    const totalDeals = revenueData.reduce((sum, r) => sum + (r.deal_count || 0), 0);
    const wonDeals = revenueData.reduce((sum, r) => sum + (r.won_count || 0), 0);
    const avgDealSize = totalRevenue / (totalDeals || 1);
    const winRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;

    const highEngagementCount = engagementData.filter(e => e.engagement_level === 'highly_engaged').length;
    const atRiskCount = engagementData.filter(e => e.churn_risk === 'high').length;
    
    const healthyAccounts = accountHealth.filter(a => a.health_status === 'excellent' || a.health_status === 'good').length;
    const atRiskAccounts = accountHealth.filter(a => a.health_status === 'at_risk').length;

    return {
      totalRevenue,
      totalDeals,
      avgDealSize,
      winRate,
      highEngagementCount,
      atRiskCount,
      healthyAccounts,
      atRiskAccounts,
      totalAccounts: accountHealth.length,
      totalContacts: engagementData.length
    };
  }, [revenueData, engagementData, accountHealth]);

  // Prepare chart data
  const chartData = React.useMemo(() => {
    // Revenue trend by period
    const revenueTrend = revenueData
      .reduce((acc, r) => {
        const period = r.period_month?.substring(0, 7) || 'Unknown';
        const existing = acc.find(item => item.period === period);
        
        if (existing) {
          existing.revenue += r.total_revenue || 0;
          existing.deals += r.deal_count || 0;
        } else {
          acc.push({
            period,
            revenue: r.total_revenue || 0,
            deals: r.deal_count || 0
          });
        }
        
        return acc;
      }, [] as any[])
      .sort((a, b) => a.period.localeCompare(b.period));

    // Engagement distribution
    const engagementDistribution = [
      { name: 'Highly Engaged', value: engagementData.filter(e => e.engagement_level === 'highly_engaged').length, fill: '#10B981' },
      { name: 'Engaged', value: engagementData.filter(e => e.engagement_level === 'engaged').length, fill: '#3B82F6' },
      { name: 'Low Engagement', value: engagementData.filter(e => e.engagement_level === 'low_engagement').length, fill: '#F59E0B' },
      { name: 'Dormant', value: engagementData.filter(e => e.engagement_level === 'dormant').length, fill: '#EF4444' }
    ];

    return { revenueTrend, engagementDistribution };
  }, [revenueData, engagementData]);

  if (!user) {
    return <div className="p-6 text-center">Please sign in to view analytics.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            Real-time Analytics
          </h1>
          <p className="text-muted-foreground">
            Powered by materialized views and proactive monitoring
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            onClick={loadDashboardData} 
            variant="outline" 
            disabled={loading.metrics}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading.metrics ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {(activeAlerts.length > 0 || perfAlerts.length > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="font-medium text-amber-800">
                {activeAlerts.length + perfAlerts.length} active alert(s) requiring attention
              </span>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setActiveTab('performance')}>
                View All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${kpis.totalRevenue.toLocaleString()}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
              Win Rate: {kpis.winRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalContacts}</div>
            <div className="flex items-center text-xs">
              <span className="text-green-600 mr-2">{kpis.highEngagementCount} highly engaged</span>
              {kpis.atRiskCount > 0 && (
                <span className="text-red-600">{kpis.atRiskCount} at risk</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account Health</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalAccounts}</div>
            <div className="mt-2">
              <Progress 
                value={(kpis.healthyAccounts / kpis.totalAccounts) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground mt-1">
                {kpis.healthyAccounts} healthy, {kpis.atRiskAccounts} at risk
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
          <div className="text-2xl font-bold">
            {webVitals.LCP ? `${Math.round(webVitals.LCP.current)}ms` : 'N/A'}
          </div>
          <div className="flex items-center text-xs">
            {webVitals.LCP?.rating === 'good' ? (
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
            ) : (
              <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
            )}
            <span>LCP {webVitals.LCP?.rating || 'unknown'}</span>
          </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue Analytics</TabsTrigger>
          <TabsTrigger value="engagement">Customer Engagement</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="health">Account Health</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData.revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="deals" fill="#8884d8" />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#82ca9d" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Engagement Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={chartData.engagementDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                    label
                  >
                    {chartData.engagementDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Core Web Vitals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(webVitals).map(([metric, data]: [string, any]) => (
                  <div key={metric} className="flex items-center justify-between">
                    <span className="font-medium">{metric}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={data?.rating === 'good' ? 'default' : 'destructive'}>
                        {data ? `${Math.round(data.current)}${metric === 'CLS' ? '' : 'ms'}` : 'N/A'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{data?.rating}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                {memoryMetrics ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Heap Usage</span>
                        <span>{memoryMetrics.current?.usagePercent.toFixed(1)}%</span>
                      </div>
                      <Progress value={memoryMetrics.current?.usagePercent} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <div>Used: {(memoryMetrics.current?.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB</div>
                      <div>Total: {(memoryMetrics.current?.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB</div>
                      <div>Trend: {memoryMetrics.trend}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    Memory monitoring not available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Health Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {accountHealth.slice(0, 10).map((account, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{account.account_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {account.contact_count} contacts • ${account.total_revenue?.toLocaleString() || 0} revenue
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          account.health_status === 'excellent' ? 'default' :
                          account.health_status === 'good' ? 'secondary' :
                          account.health_status === 'fair' ? 'outline' : 'destructive'
                        }
                      >
                        {account.health_status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {account.growth_trend}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
