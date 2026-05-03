import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Database, Users, Building } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface DataQualityIssue {
  type: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  description: string;
  action_label: string;
  can_auto_fix: boolean;
}

interface SystemHealth {
  overall_score: number;
  grade: string;
  total_organizations: number;
  total_users: number;
  orphaned_organizations: number;
  orphaned_users: number;
  duplicate_organizations: number;
  inactive_users_30d: number;
  incomplete_profiles: number;
  issues: DataQualityIssue[];
}

export const DataQualityManager = () => {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState<string | null>(null);

  useEffect(() => {
    loadSystemHealth();
  }, []);

  const loadSystemHealth = async () => {
    try {
      const { data, error } = await supabase.rpc('get_system_health_overview');
      
      if (error) {
        console.error('Error loading system health:', error);
        toast.error("Failed to load system health data");
        return;
      }

      const healthData = data as any[];
      if (healthData && healthData.length > 0) {
        const health = healthData[0];
        const parsedIssues = Array.isArray(health.issues) ? health.issues : [];
        setSystemHealth({
          ...health,
          issues: parsedIssues
        });
      } else {
        setSystemHealth(null);
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error("Failed to load system health data");
    } finally {
      setLoading(false);
    }
  };

  const fixIssue = async (issueType: string) => {
    setFixing(issueType);
    try {
      if (issueType === 'orphaned_organizations') {
        const { error } = await supabase.rpc('cleanup_orphaned_organizations');
        
        if (error) {
          console.error(`Error fixing ${issueType}:`, error);
          toast.error(`Failed to fix ${issueType.replace('_', ' ')}`);
          return;
        }
      } else {
        toast.error("Unknown issue type");
        return;
      }

      toast.success(`Successfully fixed ${issueType.replace('_', ' ')}`);
      loadSystemHealth();
    } catch (err) {
      console.error('Error:', err);
      toast.error(`Failed to fix ${issueType.replace('_', ' ')}`);
    } finally {
      setFixing(null);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'Excellent':
        return "bg-green-100 text-green-800";
      case 'Good':
        return "bg-blue-100 text-blue-800";
      case 'Fair':
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-red-100 text-red-800";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-muted rounded mb-4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!systemHealth) {
    return (
      <div className="text-center p-8">
        <p className="text-muted-foreground">No system health data available</p>
        <Button onClick={loadSystemHealth} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Health Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            System Health Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className={`text-4xl font-bold ${getScoreColor(systemHealth.overall_score)}`}>
                {systemHealth.overall_score}
              </div>
              <div className="text-sm text-muted-foreground">Overall Score</div>
              <Progress value={systemHealth.overall_score} className="mt-2" />
            </div>
            
            <div className="text-center">
              <Badge className={getGradeColor(systemHealth.grade)} variant="secondary">
                {systemHealth.grade}
              </Badge>
              <div className="text-sm text-muted-foreground mt-2">System Grade</div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Organizations:</span>
                <span className="font-medium">{systemHealth.total_organizations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Users:</span>
                <span className="font-medium">{systemHealth.total_users}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Issues Found:</span>
                <span className="font-medium text-orange-600">{systemHealth.issues.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building className="h-4 w-4" />
              Orphaned Orgs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{systemHealth.orphaned_organizations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Orphaned Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{systemHealth.orphaned_users}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{systemHealth.duplicate_organizations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{systemHealth.inactive_users_30d}</div>
            <div className="text-xs text-muted-foreground">30+ days</div>
          </CardContent>
        </Card>
      </div>

      {/* Data Quality Issues */}
      <Card>
        <CardHeader>
          <CardTitle>Data Quality Issues</CardTitle>
        </CardHeader>
        <CardContent>
          {systemHealth.issues.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Issues Found</h3>
              <p className="text-muted-foreground">Your system data quality is excellent!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {systemHealth.issues.map((issue, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getSeverityIcon(issue.severity)}
                    <div>
                      <div className="font-medium">{issue.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {issue.count} item{issue.count !== 1 ? 's' : ''} affected
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={issue.severity === 'high' ? 'destructive' : issue.severity === 'medium' ? 'default' : 'secondary'}>
                      {issue.severity}
                    </Badge>
                    
                    {issue.can_auto_fix && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={fixing === issue.type}>
                            {fixing === issue.type ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              issue.action_label
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Auto-Fix</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will automatically fix {issue.count} {issue.description.toLowerCase()}. 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => fixIssue(issue.type)}>
                              Fix Issues
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>System Maintenance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button onClick={loadSystemHealth} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Health Check
            </Button>
            
            <Button variant="outline" onClick={async () => {
              toast.info('Full system scan started...');
              try {
                // Run real duplicate detection queries
                const { data: dupContactsData, error: dupContactsError } = await supabase.rpc('find_duplicate_contacts');
                const { count: orphanDeals } = await supabase.from('deals').select('id', { count: 'exact', head: true }).is('account_id', null);
                const { count: orphanActivities } = await supabase.from('activities').select('id', { count: 'exact', head: true }).is('contact_id', null).is('deal_id', null).is('account_id', null);
                const { count: noEmailContacts } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).is('email', null);
                const dupContacts = dupContactsError ? null : dupContactsData;

                const issues = [
                  dupContacts?.length ? `${dupContacts.length} potential duplicate contacts` : null,
                  (orphanDeals || 0) > 0 ? `${orphanDeals} deals with no linked account` : null,
                  (orphanActivities || 0) > 0 ? `${orphanActivities} orphaned activities (no entity linked)` : null,
                  (noEmailContacts || 0) > 0 ? `${noEmailContacts} contacts missing email` : null,
                ].filter(Boolean);

                if (issues.length === 0) {
                  toast.success('System scan complete — no issues found');
                } else {
                  toast.warning(`Scan found ${issues.length} issue${issues.length > 1 ? 's' : ''}: ${issues.join(', ')}`);
                }
                loadSystemHealth();
              } catch (err: any) {
                toast.error(`Scan failed: ${err.message}`);
                loadSystemHealth();
              }
            }}>
              <Database className="h-4 w-4 mr-2" />
              Run Full System Scan
            </Button>

            <Button variant="outline" onClick={() => {
              const report = {
                generated_at: new Date().toISOString(),
                system_health: systemHealth,
                summary: {
                  total_issues: systemHealth.issues.length,
                  categories: systemHealth.issues.map((issue) => ({
                    name: issue.description,
                    severity: issue.severity,
                    count: issue.count,
                  })),
                },
              };
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `health-report-${new Date().toISOString().split('T')[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success('Health report downloaded');
            }}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Generate Health Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
