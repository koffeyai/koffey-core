import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Users, DollarSign, Calendar, Target, Download, RefreshCw, BarChart3 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useAnalyticsSync } from '@/hooks/useAnalyticsSync';
import { analyticsDataService, type AnalyticsData } from '@/services/analyticsDataService';
import { SavedArtifactsLibrary } from '@/components/analytics/SavedArtifactsLibrary';

interface AnalyticsFilters {
  dateRange: '7d' | '30d' | '90d' | '1y';
  dealStage?: string;
  assignedTo?: string;
}

export const EnhancedAnalyticsDashboard = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AnalyticsFilters>({ dateRange: '30d' });
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();

  // Derive organization IDs from current organization
  const organizationId = currentOrganization?.organization_id ?? null;
  const userOrgIds = useMemo(() => organizationId ? [organizationId] : [], [organizationId]);
  const cacheKey = `analytics_${JSON.stringify(filters)}_${userOrgIds.join('_')}`;

  const loadAnalyticsData = useCallback(async (useCache = true) => {
    if (!user || !userOrgIds.length) return;
    
    // Simple cache check
    if (useCache) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Use cache if less than 5 minutes old
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          setAnalyticsData(data);
          setLoading(false);
          return;
        }
      }
    }

    setLoading(true);
    
    try {
      // Use the analytics service to get data
      const analytics = await analyticsDataService.getAnalyticsData(userOrgIds, currentOrganization);
      
      setAnalyticsData(analytics);
      
      // Cache the results
      localStorage.setItem(cacheKey, JSON.stringify({
        data: analytics,
        timestamp: Date.now()
      }));
      
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, [cacheKey, currentOrganization, user, userOrgIds]);

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      'Prospecting': '#8B5CF6',
      'Qualification': '#3B82F6',
      'Proposal': '#F59E0B',
      'Negotiation': '#EF4444',
      'Closed Won': '#10B981',
      'Closed Lost': '#6B7280'
    };
    return colors[stage] || '#6B7280';
  };

  const exportData = () => {
    if (!analyticsData) return;
    
    const dataStr = JSON.stringify(analyticsData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${filters.dateRange}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  useAnalyticsSync((entityTypes) => {
    const affectsAnalytics = ['deals', 'contacts', 'accounts', 'activities', 'tasks']
      .some((entityType) => entityTypes.has(entityType as any));

    if (!affectsAnalytics) return;

    localStorage.removeItem(cacheKey);
    void loadAnalyticsData(false);
  }, 500);

  const kpiCards = useMemo(() => {
    if (!analyticsData) return [];

    const formatTrend = (value: number) => {
      const prefix = value >= 0 ? '+' : '';
      return `${prefix}${value}%`;
    };
    
    return [
      {
        title: 'Total Contacts',
        value: analyticsData.totalContacts.toLocaleString(),
        icon: Users,
        trend: formatTrend(analyticsData.trends.contacts),
        positive: analyticsData.trends.contacts >= 0
      },
      {
        title: 'Active Deals',
        value: analyticsData.totalDeals.toLocaleString(),
        icon: Target,
        trend: formatTrend(analyticsData.trends.deals),
        positive: analyticsData.trends.deals >= 0
      },
      {
        title: 'Revenue',
        value: `$${analyticsData.totalRevenue.toLocaleString()}`,
        icon: DollarSign,
        trend: formatTrend(analyticsData.trends.revenue),
        positive: analyticsData.trends.revenue >= 0
      },
      {
        title: 'Win Rate',
        value: `${analyticsData.winRate.toFixed(1)}%`,
        icon: TrendingUp,
        trend: formatTrend(analyticsData.trends.activities),
        positive: analyticsData.trends.activities >= 0
      }
    ];
  }, [analyticsData]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!analyticsData) return { dealsByStage: [], topPerformers: [] };

    const dealsByStage = analyticsData.dealsByStage.map(stage => ({
      name: stage.stage,
      value: stage.count,
      fill: getStageColor(stage.stage)
    }));

    return { dealsByStage, topPerformers: analyticsData.topPerformers };
  }, [analyticsData]);

  if (!user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Please sign in to view analytics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Enhanced Analytics</h1>
          <p className="text-muted-foreground">
            Advanced insights and real-time CRM analytics
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select 
            value={filters.dateRange} 
            onValueChange={(value: '7d' | '30d' | '90d' | '1y') => 
              setFilters(prev => ({ ...prev, dateRange: value }))
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={() => loadAnalyticsData(false)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <SavedArtifactsLibrary />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                </div>
                <kpi.icon className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex items-center mt-4">
                {kpi.positive ? (
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                )}
                <span className={`text-sm font-medium ${kpi.positive ? 'text-green-500' : 'text-red-500'}`}>
                  {kpi.trend}
                </span>
                <span className="text-sm text-muted-foreground ml-1">vs last period</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {analyticsData && analyticsData.totalContacts === 0 && analyticsData.totalDeals === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No Data Yet</h3>
            <p className="text-muted-foreground mb-4">
              Start by adding contacts and deals to see your analytics come to life.
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild>
                <a href="/contacts">Add Contacts</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/deals">Create Deals</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      {analyticsData && (analyticsData.totalContacts > 0 || analyticsData.totalDeals > 0) && (
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue & Deal Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={analyticsData.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
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

          <TabsContent value="distribution" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Deals by Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={chartData.dealsByStage}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      label
                    >
                      {chartData.dealsByStage.map((entry, index) => (
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
            <Card>
              <CardHeader>
                <CardTitle>Top Performers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {chartData.topPerformers.length > 0 ? (
                    chartData.topPerformers.map((performer, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium">{index + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium">{performer.name}</p>
                            <p className="text-sm text-muted-foreground">{performer.deals} deals closed</p>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          ${performer.revenue.toLocaleString()}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No performance data available yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Cache Status */}
      <div className="text-xs text-muted-foreground text-center">
        Last updated: {lastUpdate.toLocaleTimeString()} • 
        Data cached for 5 minutes
      </div>
    </div>
  );
};
