import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreateOrganizationDialog } from "@/components/platform-admin/organizations/CreateOrganizationDialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Building2, Globe } from "lucide-react";
import { useState } from "react";

export default function PlatformAdminOrganizations() {
  const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
  const { data: orgs, refetch, isLoading } = useQuery({
    queryKey: ['admin-all-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
          <p className="text-muted-foreground">Manage customer tenants and access.</p>
        </div>
        <CreateOrganizationDialog onOrgCreated={refetch} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Organizations ({orgs?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : orgs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No organizations found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : orgs?.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{org.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {org.domain ? (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {org.domain}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={org.is_active ? "default" : "secondary"}>
                      {org.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(org.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(org)}>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!selectedOrg} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage Organization</DialogTitle>
          </DialogHeader>
          {selectedOrg && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4">
                <div className="font-medium">{selectedOrg.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-1">{selectedOrg.id}</div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Domain</dt>
                  <dd>{selectedOrg.domain || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{selectedOrg.is_active ? 'Active' : 'Inactive'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{format(new Date(selectedOrg.created_at), 'MMM d, yyyy')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{selectedOrg.is_demo ? 'Demo' : 'Production'}</dd>
                </div>
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
