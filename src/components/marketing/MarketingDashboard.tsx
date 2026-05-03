import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Target,
  RefreshCw,
  ArrowRight,
  Globe,
  Mail,
  Megaphone,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface FunnelStage {
  label: string;
  count: number;
  pct: number;
}

interface SourceMetrics {
  source: string;
  leads: number;
  pipeline: number;
  won: number;
}

const MarketingDashboard: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [sources, setSources] = useState<SourceMetrics[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [slaMetrics, setSlaMetrics] = useState({ avg_response_hours: 0, within_sla: 0, total: 0 });

  useEffect(() => {
    if (organizationId) loadData();
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // MQL -> SQL funnel from contacts
      const { data: contacts } = await supabase
        .from('contacts')
        .select('status')
        .eq('organization_id', organizationId);

      const statusCounts: Record<string, number> = {};
      (contacts || []).forEach(c => {
        statusCounts[c.status || 'unknown'] = (statusCounts[c.status || 'unknown'] || 0) + 1;
      });
      const total = contacts?.length || 1;
      setFunnel([
        { label: 'Leads', count: statusCounts['lead'] || 0, pct: Math.round(((statusCounts['lead'] || 0) / total) * 100) },
        { label: 'MQL', count: statusCounts['mql'] || 0, pct: Math.round(((statusCounts['mql'] || 0) / total) * 100) },
        { label: 'SQL', count: statusCounts['sql'] || 0, pct: Math.round(((statusCounts['sql'] || 0) / total) * 100) },
        { label: 'Opportunity', count: statusCounts['prospect'] || 0, pct: Math.round(((statusCounts['prospect'] || 0) / total) * 100) },
        { label: 'Customer', count: statusCounts['customer'] || 0, pct: Math.round(((statusCounts['customer'] || 0) / total) * 100) },
      ]);

      // Pipeline by source (join through contacts for lead_source fallback)
      const { data: deals } = await supabase
        .from('deals')
        .select('amount, stage, lead_source, contacts(lead_source)')
        .eq('organization_id', organizationId);

      const sourceMap: Record<string, SourceMetrics> = {};
      (deals || []).forEach((d: any) => {
        const src = d.lead_source || d.contacts?.lead_source || 'Unknown';
        if (!sourceMap[src]) sourceMap[src] = { source: src, leads: 0, pipeline: 0, won: 0 };
        sourceMap[src].leads++;
        if (d.stage === 'closed_won') {
          sourceMap[src].won += d.amount || 0;
        } else if (d.stage !== 'closed_lost') {
          sourceMap[src].pipeline += d.amount || 0;
        }
      });
      setSources(Object.values(sourceMap).sort((a, b) => b.pipeline - a.pipeline));

      // Campaigns
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10);
      setCampaigns(campaignData || []);

      // Lead response SLA
      const { data: slaContacts } = await supabase
        .from('contacts')
        .select('created_at, first_activity_at')
        .eq('organization_id', organizationId)
        .not('first_activity_at', 'is', null)
        .limit(100);

      if (slaContacts && slaContacts.length > 0) {
        let totalHours = 0;
        let withinSLA = 0;
        slaContacts.forEach(c => {
          const diff = (new Date(c.first_activity_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60);
          totalHours += diff;
          if (diff <= 24) withinSLA++;
        });
        setSlaMetrics({
          avg_response_hours: Math.round(totalHours / slaContacts.length),
          within_sla: withinSLA,
          total: slaContacts.length,
        });
      }
    } catch (err) {
      console.error('Failed to load marketing data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading marketing analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing Dashboard</h1>
          <p className="text-muted-foreground">Pipeline attribution, funnel metrics, and campaign performance</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{funnel.reduce((s, f) => s + f.count, 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MQL to SQL</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {funnel[1]?.count && funnel[2]?.count
                ? `${Math.round((funnel[2].count / funnel[1].count) * 100)}%`
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">conversion rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{slaMetrics.avg_response_hours}h</div>
            <p className="text-xs text-muted-foreground">
              {slaMetrics.total > 0 ? `${Math.round((slaMetrics.within_sla / slaMetrics.total) * 100)}% within 24h SLA` : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.filter(c => c.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground">{campaigns.length} total</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="funnel" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="sources">Pipeline by Source</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        {/* Funnel Tab */}
        <TabsContent value="funnel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead-to-Customer Funnel</CardTitle>
              <CardDescription>Contact lifecycle progression</CardDescription>
            </CardHeader>
            <CardContent>
              {funnel.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No contacts yet"
                  description="Start adding contacts to see your funnel metrics."
                />
              ) : (
                <div className="space-y-4">
                  {funnel.map((stage, i) => (
                    <div key={stage.label} className="flex items-center gap-4">
                      <span className="w-24 text-sm font-medium">{stage.label}</span>
                      <div className="flex-1">
                        <Progress value={stage.pct || 0} className="h-6" />
                      </div>
                      <span className="w-16 text-right font-bold">{stage.count}</span>
                      {i < funnel.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline by Lead Source</CardTitle>
              <CardDescription>First-touch attribution</CardDescription>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No source data"
                  description="Add lead sources to deals to see attribution."
                />
              ) : (
                <div className="space-y-3">
                  {sources.map(s => (
                    <div key={s.source} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <span className="font-medium">{s.source}</span>
                        <span className="text-sm text-muted-foreground ml-2">({s.leads} deals)</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">${s.pipeline.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">pipeline</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-green-600">${s.won.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">won</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaigns</CardTitle>
              <CardDescription>Track campaign performance and ROI</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title="No campaigns yet"
                  description="Create campaigns via chat: 'create a campaign called Q1 Outbound'"
                />
              ) : (
                <div className="space-y-3">
                  {campaigns.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{c.type || 'general'}</Badge>
                          <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        {c.budget && (
                          <div className="text-sm">${Number(c.budget).toLocaleString()} budget</div>
                        )}
                        {c.start_date && (
                          <div className="text-xs text-muted-foreground">
                            {new Date(c.start_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MarketingDashboard;
