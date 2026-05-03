
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { launchChatWith } from '@/stores/unifiedChatStore';
import { SavedArtifactsLibrary } from '@/components/analytics/SavedArtifactsLibrary';

interface AnalyticsDashboardProps {
  query?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ query }) => {
  const { user } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganizationAccess();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    totalDeals: 0,
    pipelineValue: 0,
    winRate: 0,
    avgDealSize: 0,
    dealsByStage: [] as Array<{ stage: string; count: number; value: number }>,
    monthlyRevenue: [] as Array<{ month: string; revenue: number }>
  });

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  useEffect(() => {
    if (!user || orgLoading) return;
    
    if (!currentOrganization) {
      setLoading(false);
      return;
    }

    fetchAnalytics();
  }, [user, currentOrganization, orgLoading]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch all deals for the organization
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('*')
        .eq('organization_id', currentOrganization!.organization_id);

      if (dealsError) throw dealsError;

      // Calculate metrics
      // Normalize stage for comparison — DB uses underscores (closed_won), some code uses hyphens
      const isClosedWon = (stage: string) => /^closed[_-]?won$/i.test(stage || '');
      const isClosedLost = (stage: string) => /^closed[_-]?lost$/i.test(stage || '');
      const isClosed = (stage: string) => isClosedWon(stage) || isClosedLost(stage);

      const totalDeals = deals.length;
      const pipelineValue = deals
        .filter(deal => !isClosed(deal.stage))
        .reduce((sum, deal) => sum + (deal.amount || 0), 0);

      const closedDeals = deals.filter(deal => isClosed(deal.stage));
      const wonDeals = deals.filter(deal => isClosedWon(deal.stage));
      const winRate = closedDeals.length > 0 ? (wonDeals.length / closedDeals.length) * 100 : 0;
      
      const avgDealSize = totalDeals > 0 ? deals.reduce((sum, deal) => sum + (deal.amount || 0), 0) / totalDeals : 0;

      // Group deals by stage
      const stageGroups = deals.reduce((acc, deal) => {
        const stage = deal.stage || 'unknown';
        if (!acc[stage]) {
          acc[stage] = { count: 0, value: 0 };
        }
        acc[stage].count++;
        acc[stage].value += deal.amount || 0;
        return acc;
      }, {} as Record<string, { count: number; value: number }>);

      // Format stage labels for display
      const formatStageLabel = (raw: string): string => {
        const mapped: Record<string, string> = {
          'prospecting': 'Prospecting',
          'qualification': 'Qualified',
          'qualified': 'Qualified',
          'proposal': 'Proposal',
          'negotiation': 'Negotiation',
          'closed_won': 'Closed Won',
          'closed-won': 'Closed Won',
          'closed_lost': 'Closed Lost',
          'closed-lost': 'Closed Lost',
        };
        return mapped[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1).replace(/[_-]/g, ' ');
      };

      const dealsByStage = (Object.entries(stageGroups) as Array<[string, { count: number; value: number }]>).map(([stage, data]) => ({
        stage: formatStageLabel(stage),
        count: data.count,
        value: data.value
      }));

      // Group monthly revenue (closed-won deals)
      const monthlyRevenue = wonDeals.reduce((acc, deal) => {
        const date = new Date(deal.close_date || deal.created_at);
        const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
        if (!acc[monthKey]) {
          acc[monthKey] = 0;
        }
        acc[monthKey] += deal.amount || 0;
        return acc;
      }, {} as Record<string, number>);

      const monthlyRevenueArray = (Object.entries(monthlyRevenue) as Array<[string, number]>).map(([month, revenue]) => ({
        month,
        revenue
      }));

      setAnalytics({
        totalDeals,
        pipelineValue,
        winRate,
        avgDealSize,
        dealsByStage,
        monthlyRevenue: monthlyRevenueArray
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!currentOrganization) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Sales Analytics</h2>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please join an organization to view analytics.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Sales Analytics</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const buildAnalyticsPageContext = () => ({
    type: 'analytics_dashboard',
    pageType: 'analytics_dashboard',
    title: 'Sales Analytics',
    generatedAt: new Date().toISOString(),
    summaryMetrics: {
      totalDeals: analytics.totalDeals,
      activePipelineValue: analytics.pipelineValue,
      winRate: Number(analytics.winRate.toFixed(1)),
      averageDealSize: Math.round(analytics.avgDealSize),
    },
    charts: {
      dealsByStage: analytics.dealsByStage.slice(0, 12),
      monthlyRevenue: analytics.monthlyRevenue.slice(0, 12),
    },
    sourceTables: ['deals'],
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sales Analytics</h2>
        <div className="flex items-center gap-2">
          {query && (
            <div className="text-sm text-muted-foreground">
              Query: <span className="font-medium">{query}</span>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => launchChatWith(
              'Review the current Sales Analytics view using CRM data and tell me what to pay attention to.',
              buildAnalyticsPageContext()
            )}
          >
            Explain this view
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalDeals}</div>
            {analytics.totalDeals === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No deals yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.pipelineValue)}</div>
            {analytics.pipelineValue === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No active pipeline</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.winRate.toFixed(1)}%</div>
            {analytics.winRate === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No closed deals</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Deal Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.avgDealSize)}</div>
            {analytics.avgDealSize === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No deals</p>
            )}
          </CardContent>
        </Card>
      </div>

      <SavedArtifactsLibrary />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Deals by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.dealsByStage.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.dealsByStage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p>No deals to display</p>
                  <p className="text-sm">Add deals to see stage distribution</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.monthlyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'Revenue']} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-2))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p>No revenue data</p>
                  <p className="text-sm">Close some deals to see monthly revenue</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.dealsByStage.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.dealsByStage}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ stage, count }) => `${stage}: ${count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analytics.dealsByStage.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p>No pipeline data</p>
                <p className="text-sm">Add deals to see pipeline distribution</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
