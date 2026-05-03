import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Building, Trash2, Eye, Settings, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface OrganizationWithMetrics {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  company_size: string | null;
  created_at: string;
  is_demo: boolean;
  member_count: number;
  admin_count: number;
  is_orphaned: boolean;
  last_activity: string | null;
}

export const OrganizationAdminManager = () => {
  const [organizations, setOrganizations] = useState<OrganizationWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "orphaned" | "demo">("all");
  const [selectedOrganization, setSelectedOrganization] = useState<OrganizationWithMetrics | null>(null);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_organization_overview');
      
      if (error) {
        console.error('Error loading organizations:', error);
        toast.error("Failed to load organizations");
        return;
      }

      setOrganizations((data as OrganizationWithMetrics[]) || []);
    } catch (err) {
      console.error('Error:', err);
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  const deleteOrphanedOrganizations = async () => {
    try {
      const { error } = await supabase.rpc('cleanup_orphaned_organizations');
      
      if (error) {
        console.error('Error deleting orphaned organizations:', error);
        toast.error("Failed to delete orphaned organizations");
        return;
      }

      toast.success("Orphaned organizations deleted successfully");
      loadOrganizations();
    } catch (err) {
      console.error('Error:', err);
      toast.error("Failed to delete orphaned organizations");
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (org.domain && org.domain.toLowerCase().includes(searchTerm.toLowerCase()));
    
    switch (selectedFilter) {
      case "orphaned":
        return matchesSearch && org.is_orphaned;
      case "demo":
        return matchesSearch && org.is_demo;
      default:
        return matchesSearch;
    }
  });

  const orphanedCount = organizations.filter(org => org.is_orphaned).length;
  const demoCount = organizations.filter(org => org.is_demo).length;
  const totalMembers = organizations.reduce((sum, org) => sum + org.member_count, 0);

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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizations.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMembers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Orphaned Orgs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{orphanedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Demo Orgs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{demoCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={selectedFilter === "all" ? "default" : "outline"}
                onClick={() => setSelectedFilter("all")}
                size="sm"
              >
                All ({organizations.length})
              </Button>
              <Button
                variant={selectedFilter === "orphaned" ? "default" : "outline"}
                onClick={() => setSelectedFilter("orphaned")}
                size="sm"
              >
                Orphaned ({orphanedCount})
              </Button>
              <Button
                variant={selectedFilter === "demo" ? "default" : "outline"}
                onClick={() => setSelectedFilter("demo")}
                size="sm"
              >
                Demo ({demoCount})
              </Button>
            </div>
          </div>

          {orphanedCount > 0 && (
            <div className="flex items-center gap-4 p-4 bg-destructive/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Orphaned Organizations Detected</p>
                <p className="text-sm text-muted-foreground">
                  {orphanedCount} organizations have no active members and can be safely deleted.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clean Up
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Orphaned Organizations</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {orphanedCount} organizations that have no active members. 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteOrphanedOrganizations}>
                      Delete Organizations
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organizations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Organizations ({filteredOrganizations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrganizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{org.name}</div>
                          {org.is_orphaned && (
                            <Badge variant="destructive" className="text-xs">
                              Orphaned
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {org.domain ? (
                        <code className="text-sm bg-muted px-1 rounded">{org.domain}</code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{org.industry || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{org.member_count}</span>
                        {org.admin_count > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {org.admin_count} admin{org.admin_count > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {org.is_demo ? (
                        <Badge variant="outline">Demo</Badge>
                      ) : (
                        <Badge variant="default">Production</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(org.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedOrganization(org)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedOrganization(org)}>
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrganization} onOpenChange={(open) => !open && setSelectedOrganization(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Organization Details</DialogTitle>
          </DialogHeader>
          {selectedOrganization && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{selectedOrganization.name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">{selectedOrganization.id}</div>
                  </div>
                  <Badge variant={selectedOrganization.is_demo ? 'outline' : 'default'}>
                    {selectedOrganization.is_demo ? 'Demo' : 'Production'}
                  </Badge>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Domain</dt>
                  <dd>{selectedOrganization.domain || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Industry</dt>
                  <dd>{selectedOrganization.industry || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Company size</dt>
                  <dd>{selectedOrganization.company_size || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{new Date(selectedOrganization.created_at).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Members</dt>
                  <dd>{selectedOrganization.member_count}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Admins</dt>
                  <dd>{selectedOrganization.admin_count}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last activity</dt>
                  <dd>{selectedOrganization.last_activity ? new Date(selectedOrganization.last_activity).toLocaleString() : 'No activity recorded'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Health</dt>
                  <dd>{selectedOrganization.is_orphaned ? 'Orphaned' : 'Active membership'}</dd>
                </div>
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
