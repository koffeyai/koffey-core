import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import {
  BarChart3,
  FileText,
  Download,
  RefreshCw,
  Plus,
  Play,
  Table,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface ReportConfig {
  name: string;
  entity: string;
  groupBy: string;
  metrics: string[];
  filters: { field: string; op: string; value: string }[];
  dateRange: string;
}

const ENTITIES = [
  { value: 'deals', label: 'Deals' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'activities', label: 'Activities' },
  { value: 'accounts', label: 'Accounts' },
];

const GROUP_BY: Record<string, { value: string; label: string }[]> = {
  deals: [
    { value: 'stage', label: 'Stage' },
    { value: 'lead_source', label: 'Lead Source' },
    { value: 'assigned_to', label: 'Owner' },
    { value: 'forecast_category', label: 'Forecast Category' },
  ],
  contacts: [
    { value: 'status', label: 'Status' },
    { value: 'company', label: 'Company' },
  ],
  activities: [
    { value: 'type', label: 'Type' },
    { value: 'user_id', label: 'User' },
  ],
  accounts: [
    { value: 'industry', label: 'Industry' },
  ],
};

const ReportBuilder: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [config, setConfig] = useState<ReportConfig>({
    name: '',
    entity: 'deals',
    groupBy: 'stage',
    metrics: ['count'],
    filters: [],
    dateRange: 'this_quarter',
  });
  const [results, setResults] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [savedReports, setSavedReports] = useState<ReportConfig[]>(() => {
    const saved = localStorage.getItem('koffey_saved_reports');
    return saved ? JSON.parse(saved) : [];
  });

  const runReport = async (reportConfig: ReportConfig = config) => {
    if (!organizationId) return;
    setRunning(true);
    try {
      let query = supabase
        .from(reportConfig.entity)
        .select('*')
        .eq('organization_id', organizationId);

      // Apply date range
      const now = new Date();
      let startDate: Date | null = null;
      switch (reportConfig.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'this_week':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'this_month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'this_quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'this_year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
      }

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query.limit(1000);
      if (error) throw error;

      // Group results
      const groups: Record<string, any[]> = {};
      (data || []).forEach(row => {
        const key = String(row[reportConfig.groupBy] || 'Unknown');
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });

      const reportResults = Object.entries(groups).map(([group, rows]) => {
        const result: any = { group, count: rows.length };
        if (reportConfig.entity === 'deals') {
          result.total_amount = rows.reduce((s, r) => s + (r.amount || 0), 0);
          result.avg_amount = result.total_amount / result.count;
          result.avg_probability = rows.reduce((s, r) => s + (r.probability || 0), 0) / result.count;
        }
        return result;
      });

      reportResults.sort((a, b) => b.count - a.count);
      setResults(reportResults);
    } catch (err) {
      console.error('Report failed:', err);
      toast.error('Failed to generate report');
    } finally {
      setRunning(false);
    }
  };

  const saveReport = () => {
    if (!config.name) {
      toast.error('Please name your report');
      return;
    }
    const updated = [...savedReports, config];
    setSavedReports(updated);
    localStorage.setItem('koffey_saved_reports', JSON.stringify(updated));
    toast.success('Report saved');
  };

  const runSavedReport = (report: ReportConfig) => {
    setConfig(report);
    void runReport(report);
  };

  const exportCSV = () => {
    if (results.length === 0) return;
    const headers = Object.keys(results[0]);
    const csv = [
      headers.join(','),
      ...results.map(r => headers.map(h => `"${r[h]}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name || 'report'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report Builder</h1>
          <p className="text-muted-foreground">Create custom reports from your CRM data</p>
        </div>
      </div>

      <Tabs defaultValue="build">
        <TabsList>
          <TabsTrigger value="build">Build Report</TabsTrigger>
          <TabsTrigger value="saved">Saved ({savedReports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="build" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Report Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Report name"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Entity</label>
                  <Select value={config.entity} onValueChange={(v) => setConfig({ ...config, entity: v, groupBy: GROUP_BY[v]?.[0]?.value || '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENTITIES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Group By</label>
                  <Select value={config.groupBy} onValueChange={(v) => setConfig({ ...config, groupBy: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(GROUP_BY[config.entity] || []).map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Date Range</label>
                  <Select value={config.dateRange} onValueChange={(v) => setConfig({ ...config, dateRange: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="this_week">This Week</SelectItem>
                      <SelectItem value="this_month">This Month</SelectItem>
                      <SelectItem value="this_quarter">This Quarter</SelectItem>
                      <SelectItem value="this_year">This Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => runReport()} disabled={running}>
                  {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Run Report
                </Button>
                <Button variant="outline" onClick={saveReport}>
                  <Plus className="h-4 w-4 mr-2" />
                  Save
                </Button>
                {results.length > 0 && (
                  <Button variant="outline" onClick={exportCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Table className="h-5 w-5" />
                  Results ({results.length} groups)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {Object.keys(results[0]).map(k => (
                        <th key={k} className="text-left p-2 font-medium">
                          {k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={i} className="border-b">
                        {Object.entries(row).map(([k, v], j) => (
                          <td key={j} className="p-2">
                            {typeof v === 'number'
                              ? k.includes('amount') ? `$${v.toLocaleString()}` : v.toLocaleString(undefined, { maximumFractionDigits: 1 })
                              : String(v)
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="saved" className="space-y-4">
          {savedReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No saved reports"
              description="Build a report and save it for quick access later."
            />
          ) : (
            <div className="space-y-3">
              {savedReports.map((report, i) => (
                <Card key={i} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => runSavedReport(report)}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{report.name}</span>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{report.entity}</Badge>
                          <Badge variant="secondary">by {report.groupBy}</Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          runSavedReport(report);
                        }}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportBuilder;
