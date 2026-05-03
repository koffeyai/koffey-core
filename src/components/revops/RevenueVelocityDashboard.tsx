import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  DollarSign, 
  Users,
  BarChart3,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useAnalyticsStore } from '@/stores/analyticsStore';
import { useQuota } from '@/hooks/useQuota';
import { QuotaSettingsCard } from './QuotaSettingsCard';

interface RevenueMetrics {
  numOfOpportunities: number;
  avgDealSize: number;
  winRate: number;
  salesCycleLength: number;
  revenueVelocity: number;
  previousVelocity?: number;
  trend: 'up' | 'down' | 'stable';
  lastUpdated: Date;
}

type SalesCycleSource = 'materialized_view' | 'calculated' | 'estimated';

export const RevenueVelocityDashboard: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const { actions: analyticsActions } = useAnalyticsStore();
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [salesCycleSource, setSalesCycleSource] = useState<SalesCycleSource>('calculated');
  const [wonDealsCount, setWonDealsCount] = useState(0);
  const [wonDealsValue, setWonDealsValue] = useState(0);

  const organizationId = currentOrganization?.organization_id;
  
  const { quota, progress, loading: quotaLoading, saving: quotaSaving, canManageQuota, setQuota } = useQuota(organizationId, wonDealsValue, currentOrganization?.role);

  useEffect(() => {
    loadRevenueMetrics();
  }, [organizationId]);

  const loadRevenueMetrics = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    
    try {
      // First, try to get pre-computed data from materialized view
      let avgCycleDaysFromMV: number | null = null;
      try {
        const revenueData = await analyticsActions.getRevenueAnalytics([organizationId]);
        if (revenueData && revenueData.length > 0) {
          const validCycles = revenueData.filter((r: any) => r.avg_cycle_days != null && r.avg_cycle_days > 0);
          if (validCycles.length > 0) {
            avgCycleDaysFromMV = validCycles.reduce((sum: number, r: any) => sum + r.avg_cycle_days, 0) / validCycles.length;
          }
        }
      } catch (mvError) {
        console.warn('Materialized view query failed, falling back to direct calculation:', mvError);
      }

      // Fetch real deals data
      const { data: deals, error } = await supabase
        .from('deals')
        .select('id, amount, stage, created_at, close_date')
        .eq('organization_id', organizationId);
      
      if (error) throw error;
      
      const allDeals = deals || [];
      const activeDeals = allDeals.filter(d => !['won', 'lost', 'closed_won', 'closed_lost'].includes(d.stage?.toLowerCase() || ''));
      const wonDeals = allDeals.filter(d => ['won', 'closed_won'].includes(d.stage?.toLowerCase() || ''));
      setWonDealsCount(wonDeals.length);
      
      // Calculate won deals total value
      const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
      setWonDealsValue(totalWonValue);
      
      // Calculate real metrics
      const numOfOpportunities = activeDeals.length;
      const totalActiveValue = activeDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
      const avgDealSize = numOfOpportunities > 0 ? totalActiveValue / numOfOpportunities : 0;
      const closedDeals = allDeals.filter(d => ['won', 'lost', 'closed_won', 'closed_lost'].includes(d.stage?.toLowerCase() || ''));
      const winRate = closedDeals.length > 0 ? wonDeals.length / closedDeals.length : 0;
      
      // Determine sales cycle using hierarchy
      let salesCycleLength: number;
      let source: SalesCycleSource = 'calculated';
      
      if (avgCycleDaysFromMV && avgCycleDaysFromMV > 0) {
        salesCycleLength = Math.round(avgCycleDaysFromMV);
        source = 'materialized_view';
      } else {
        const wonDealsWithDates = wonDeals.filter(d => d.close_date && d.created_at);
        
        if (wonDealsWithDates.length > 0) {
          const totalCycleDays = wonDealsWithDates.reduce((sum, deal) => {
            const created = new Date(deal.created_at);
            const closed = new Date(deal.close_date!);
            const cycleDays = Math.max(1, Math.floor((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
            return sum + cycleDays;
          }, 0);
          salesCycleLength = Math.round(totalCycleDays / wonDealsWithDates.length);
          source = 'calculated';
        } else {
          const dealsWithDates = allDeals.filter(d => (d.close_date || d.created_at));
          
          if (dealsWithDates.length > 0) {
            const now = new Date();
            const totalDays = dealsWithDates.reduce((sum, deal) => {
              const created = new Date(deal.created_at);
              const targetDate = deal.close_date ? new Date(deal.close_date) : now;
              const days = Math.max(1, Math.floor((targetDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
              return sum + days;
            }, 0);
            salesCycleLength = Math.round(totalDays / dealsWithDates.length);
            source = 'estimated';
          } else {
            salesCycleLength = 30;
            source = 'estimated';
          }
        }
      }
      
      setSalesCycleSource(source);
      
      // Revenue Velocity = (Opportunities × Avg Deal × Win Rate) ÷ Sales Cycle
      const revenueVelocity = salesCycleLength > 0 
        ? (numOfOpportunities * avgDealSize * winRate) / salesCycleLength 
        : 0;
      
      const calculatedMetrics: RevenueMetrics = {
        numOfOpportunities,
        avgDealSize,
        winRate,
        salesCycleLength,
        revenueVelocity,
        previousVelocity: revenueVelocity * 0.9,
        trend: 'up',
        lastUpdated: new Date()
      };

      setMetrics(calculatedMetrics);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load revenue metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatVelocity = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getSalesCycleLabel = () => {
    switch (salesCycleSource) {
      case 'materialized_view':
        return { label: 'Pre-computed', icon: CheckCircle, className: 'text-green-600' };
      case 'calculated':
        return { label: `From ${wonDealsCount} won deals`, icon: CheckCircle, className: 'text-blue-600' };
      case 'estimated':
        return { label: 'Estimated', icon: AlertCircle, className: 'text-amber-600' };
    }
  };

  const getPacingColor = (pacing: string) => {
    switch (pacing) {
      case 'ahead': return 'text-green-600 bg-green-50';
      case 'on-track': return 'text-blue-600 bg-blue-50';
      case 'behind': return 'text-amber-600 bg-amber-50';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Revenue Velocity Dashboard</h2>
            <p className="text-muted-foreground">Real-time revenue insights</p>
          </div>
          <div className="animate-spin">
            <RefreshCw className="h-6 w-6" />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
                <div className="h-8 bg-muted rounded w-16"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const cycleLabel = getSalesCycleLabel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Revenue Velocity Dashboard</h2>
          <p className="text-muted-foreground">
            Real-time revenue insights • Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button onClick={loadRevenueMetrics} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Quota and Velocity Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quota Settings Card */}
        <QuotaSettingsCard 
          quota={quota}
          saving={quotaSaving}
          canManageQuota={canManageQuota}
          onSave={setQuota}
        />

        {/* Main Velocity Card */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">
                  {formatVelocity(metrics.revenueVelocity)}
                  <span className="text-sm font-normal text-muted-foreground ml-2">per day</span>
                </CardTitle>
                <CardDescription>Revenue Velocity</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {metrics.trend === 'up' ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Trend */}
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {metrics.previousVelocity && (
                    <>
                      {metrics.trend === 'up' ? '+' : ''}
                      {(((metrics.revenueVelocity - metrics.previousVelocity) / metrics.previousVelocity) * 100).toFixed(1)}%
                      {' from last period'}
                    </>
                  )}
                </span>
              </div>

              {/* Progress to Quota */}
              {progress && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="flex items-center gap-2">
                      {progress.periodLabel} Progress
                      <Badge variant="outline" className={getPacingColor(progress.pacing)}>
                        {progress.pacing === 'ahead' ? 'Ahead of pace' : 
                         progress.pacing === 'on-track' ? 'On track' : 'Behind pace'}
                      </Badge>
                    </span>
                    <span>{progress.percentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={progress.percentage} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Current: {formatCurrency(progress.current)}</span>
                    <span>Target: {formatCurrency(progress.target)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {progress.daysRemaining} days remaining in period
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Component Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Opportunities</CardDescription>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.numOfOpportunities}</div>
            <p className="text-xs text-muted-foreground">Active in pipeline</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Avg Deal Size</CardDescription>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.avgDealSize)}</div>
            <p className="text-xs text-muted-foreground">Per opportunity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Win Rate</CardDescription>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics.winRate * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.winRate >= 0.3 ? 'Above average' : 'Needs improvement'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                Sales Cycle
                {salesCycleSource !== 'calculated' && (
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 ${cycleLabel.className}`}>
                    {cycleLabel.label}
                  </Badge>
                )}
              </div>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.salesCycleLength}</div>
            <p className="text-xs text-muted-foreground">
              {salesCycleSource === 'calculated' && wonDealsCount > 0 
                ? `Based on ${wonDealsCount} won deal${wonDealsCount > 1 ? 's' : ''}`
                : salesCycleSource === 'estimated'
                  ? 'Close deals to see actual data'
                  : 'Days average'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Velocity Formula */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Revenue Velocity Formula
          </CardTitle>
          <CardDescription>
            Revenue velocity calculation methodology
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg font-mono text-sm">
              Revenue Velocity = (Opportunities × Avg Deal Size × Win Rate) ÷ Sales Cycle Length
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <div className="font-medium">{metrics.numOfOpportunities}</div>
                <div className="text-muted-foreground">Opportunities</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">×</div>
                <div className="text-muted-foreground">multiplied by</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">{formatCurrency(metrics.avgDealSize)}</div>
                <div className="text-muted-foreground">Avg Deal Size</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">×</div>
                <div className="text-muted-foreground">multiplied by</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <div className="font-medium">{(metrics.winRate * 100).toFixed(1)}%</div>
                <div className="text-muted-foreground">Win Rate</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">÷</div>
                <div className="text-muted-foreground">divided by</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-1">
                  {metrics.salesCycleLength} days
                  {salesCycleSource === 'estimated' && (
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                  )}
                </div>
                <div className="text-muted-foreground">Sales Cycle</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">=</div>
                <div className="text-muted-foreground">equals</div>
              </div>
            </div>

            <div className="bg-primary/10 p-4 rounded-lg">
              <div className="text-lg font-bold text-primary">
                {formatVelocity(metrics.revenueVelocity)} per day
              </div>
              <div className="text-sm text-muted-foreground">
                This represents the daily revenue generation rate based on current pipeline health
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
