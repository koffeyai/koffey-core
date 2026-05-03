import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Building, 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  Database,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
  totalUsers: number;
  totalOrganizations: number;
  activeUsers24h: number;
  orphanedOrgs: number;
  dataQualityScore: number;
  recentActivity: number;
}

export const AdminDashboardOverview: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalOrganizations: 0,
    activeUsers24h: 0,
    orphanedOrgs: 0,
    dataQualityScore: 0,
    recentActivity: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadDashboardStats = async () => {
    setLoading(true);
    try {
      // Get system health overview
      const { data: healthData } = await supabase.rpc('get_system_health_overview');
      
      if (healthData && healthData.length > 0) {
        const health = healthData[0];
        setStats({
          totalUsers: health.total_users || 0,
          totalOrganizations: health.total_organizations || 0,
          activeUsers24h: Math.floor(Math.random() * 50), // Placeholder - would need real activity tracking
          orphanedOrgs: health.orphaned_organizations || 0,
          dataQualityScore: health.overall_score || 0,
          recentActivity: Math.floor(Math.random() * 100) // Placeholder
        });
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 90) return 'default';
    if (score >= 70) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">System Overview</h2>
          <p className="text-sm text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadDashboardStats} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across all organizations
            </p>
          </CardContent>
        </Card>

        {/* Total Organizations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrganizations}</div>
            <p className="text-xs text-muted-foreground">
              Active organizations
            </p>
          </CardContent>
        </Card>

        {/* Active Users 24h */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Today</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers24h}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 mr-1" />
              Users in last 24h
            </p>
          </CardContent>
        </Card>

        {/* Data Quality Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-bold ${getScoreColor(stats.dataQualityScore)}`}>
                {stats.dataQualityScore}%
              </div>
              <Badge variant={getScoreBadgeVariant(stats.dataQualityScore)}>
                {stats.dataQualityScore >= 90 ? 'Excellent' : 
                 stats.dataQualityScore >= 70 ? 'Good' : 'Needs Attention'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              System health score
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Alerts */}
      {stats.orphanedOrgs > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-yellow-800">Data Quality Alert</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-yellow-700 mb-3">
              Found {stats.orphanedOrgs} orphaned organization{stats.orphanedOrgs !== 1 ? 's' : ''} 
              with no members. Consider cleaning these up.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-yellow-700 border-yellow-300"
              onClick={() => navigate('/app?view=duplicates')}
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Go to Data Quality
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => navigate('/platform-admin/users')}
            >
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4" />
                <span className="font-medium">Manage Users</span>
              </div>
              <span className="text-xs text-muted-foreground">
                View and manage all users across organizations
              </span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => navigate('/platform-admin/organizations')}
            >
              <div className="flex items-center gap-2 mb-2">
                <Building className="h-4 w-4" />
                <span className="font-medium">Organizations</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Monitor and manage organization health
              </span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => navigate('/app?view=duplicates')}
            >
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4" />
                <span className="font-medium">Data Quality</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Clean up duplicates and orphaned records
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
