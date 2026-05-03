import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCRM } from '@/hooks/useCRM';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { analyticsDataService } from '@/services/analyticsDataService';
import { getUserFirstName } from '@/lib/userDisplayName';
import { 
  LayoutDashboard, 
  Users, 
  Building, 
  DollarSign, 
  TrendingUp, 
  Calendar,
  CheckSquare,
  Zap,
  Activity,
  BarChart3
} from 'lucide-react';
import { Link } from 'react-router-dom';

const quickActions = [
  { label: 'Add Contact', href: '/contacts', icon: Users, color: 'bg-blue-500' },
  { label: 'Create Deal', href: '/deals', icon: DollarSign, color: 'bg-green-500' },
  { label: 'Schedule Activity', href: '/activities', icon: Calendar, color: 'bg-orange-500' },
  { label: 'Add Task', href: '/tasks', icon: CheckSquare, color: 'bg-purple-500' },
];

const enhancedFeatures = [
  {
    title: 'AI-Powered Analytics',
    description: 'Advanced insights and revenue predictions',
    href: '/analytics',
    icon: BarChart3,
    badge: 'Enhanced'
  },
  {
    title: 'Smart Insights',
    description: 'Personalized recommendations and alerts',
    href: '/insights', 
    icon: TrendingUp,
    badge: 'Beta'
  },
  {
    title: 'Team Collaboration',
    description: 'Real-time presence and data sync',
    href: '/collaboration',
    icon: Activity,
    badge: 'New'
  }
];

export const EnhancedDashboard = () => {
  const { user, profile } = useAuth();
  const { stats, loading } = useCRM('contacts');
  const { activeUsers, isConnected } = useRealtimeCollaboration();
  const { currentOrganization } = useOrganizationAccess();
  
  // Derive organization IDs from current organization
  const userOrgIds = currentOrganization ? [currentOrganization.organization_id] : [];
  const [performanceMetrics, setPerformanceMetrics] = useState({
    customerSatisfaction: 0,
    monthlyRevenue: '$0',
    activeDealsPipeline: 0,
    totalActivities: 0
  });

  const userName = getUserFirstName(user, profile, 'there');

  // Load performance metrics
  useEffect(() => {
    const loadPerformanceMetrics = async () => {
      if (!user || !userOrgIds.length) return;
      
      try {
        const analyticsData = await analyticsDataService.getAnalyticsData(userOrgIds, currentOrganization);
        setPerformanceMetrics(analyticsData.performanceMetrics);
      } catch (error) {
        console.error('Error loading performance metrics:', error);
      }
    };

    loadPerformanceMetrics();
  }, [user, userOrgIds, currentOrganization]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {userName}!</h1>
          <p className="text-muted-foreground">
            Here's what's happening with your CRM today
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {isConnected && (
            <Badge variant="secondary" className="gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              {activeUsers.length + 1} online
            </Badge>
          )}
          <Badge variant="outline" className="gap-1">
            <Zap className="h-3 w-3" />
            Enhanced Mode
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover-scale">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Contacts</p>
                <p className="text-2xl font-bold">{stats?.totalContacts || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <div className="mt-4">
              <Badge variant="secondary" className="text-xs">
                +12% this month
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Deals</p>
                <p className="text-2xl font-bold">{stats?.totalDeals || 0}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
            <div className="mt-4">
              <Badge variant="secondary" className="text-xs">
                +8% this week
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Activities</p>
                <p className="text-2xl font-bold">{stats?.totalActivities || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-500" />
            </div>
            <div className="mt-4">
              <Badge variant="secondary" className="text-xs">
                +5% this week
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tasks</p>
                <p className="text-2xl font-bold">{stats?.totalTasks || 0}</p>
              </div>
              <CheckSquare className="h-8 w-8 text-purple-500" />
            </div>
            <div className="mt-4">
              <Badge variant="secondary" className="text-xs">
                +3% this week
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Quick Actions</h2>
          <div className="space-y-3">
            {quickActions.map((action, index) => (
              <Link key={index} to={action.href}>
                <Card className="hover-scale cursor-pointer transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${action.color}`}>
                        <action.icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-medium">{action.label}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Enhanced Features */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Enhanced Features</h2>
          <div className="space-y-3">
            {enhancedFeatures.map((feature, index) => (
              <Link key={index} to={feature.href}>
                <Card className="hover-scale cursor-pointer transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <feature.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">{feature.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {feature.badge}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Activity</h2>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                {stats?.recentActivity?.slice(0, 5).map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                    <div>
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Performance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="thisWeek">
            <TabsList>
              <TabsTrigger value="thisWeek">This Week</TabsTrigger>
              <TabsTrigger value="thisMonth">This Month</TabsTrigger>
              <TabsTrigger value="thisQuarter">This Quarter</TabsTrigger>
            </TabsList>
            
            <TabsContent value="thisWeek" className="mt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{performanceMetrics.customerSatisfaction}%</p>
                  <p className="text-sm text-muted-foreground">Customer Satisfaction</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{performanceMetrics.monthlyRevenue}</p>
                  <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">{performanceMetrics.activeDealsPipeline}</p>
                  <p className="text-sm text-muted-foreground">Active Deals Pipeline</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">{performanceMetrics.totalActivities}</p>
                  <p className="text-sm text-muted-foreground">Total Activities</p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="thisMonth" className="mt-6">
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Monthly performance data will be available soon</p>
              </div>
            </TabsContent>
            
            <TabsContent value="thisQuarter" className="mt-6">
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Quarterly performance data will be available soon</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
