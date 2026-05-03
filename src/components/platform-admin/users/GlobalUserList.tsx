import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ShieldAlert, Mail, Calendar } from "lucide-react";
import { format } from "date-fns";

interface OrgMembership {
  org_name: string;
  org_id: string;
  role: string;
  is_active: boolean;
}

interface GlobalUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_platform_admin: boolean;
  org_memberships: OrgMembership[];
}

export function GlobalUserList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<GlobalUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-global-users', search, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_all_users', {
        page_offset: page * 50,
        page_limit: 50,
        search_query: search
      });
      if (error) throw error;
      return (data || []) as unknown as GlobalUser[];
    }
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Global User Directory</CardTitle>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {user.email}
                      {user.is_platform_admin && 
                        <Badge variant="destructive" className="text-xs">ADMIN</Badge>
                      }
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{user.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.org_memberships && user.org_memberships.length > 0 ? (
                      user.org_memberships.map((m, idx) => (
                        <Badge key={idx} variant={m.is_active ? "secondary" : "outline"}>
                          {m.org_name} ({m.role})
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">No Org</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {user.last_sign_in_at ? format(new Date(user.last_sign_in_at), 'MMM d, p') : 'Never'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                    Manage
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={!users || users.length < 50}
          >
            Next
          </Button>
        </div>
      </CardContent>
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage User</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="font-medium">{selectedUser.email}</div>
                <div className="text-xs text-muted-foreground font-mono mt-1">{selectedUser.id}</div>
                <div className="text-sm text-muted-foreground mt-2">
                  Joined {format(new Date(selectedUser.created_at), 'MMM d, yyyy')} · Last login {selectedUser.last_sign_in_at ? format(new Date(selectedUser.last_sign_in_at), 'MMM d, p') : 'never'}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Organization Access</h4>
                <div className="space-y-2">
                  {selectedUser.org_memberships?.length ? selectedUser.org_memberships.map((membership) => (
                    <div key={membership.org_id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <div className="font-medium">{membership.org_name}</div>
                        <div className="text-xs text-muted-foreground">{membership.org_id}</div>
                      </div>
                      <Badge variant={membership.is_active ? 'secondary' : 'outline'}>
                        {membership.role}{membership.is_active ? '' : ' inactive'}
                      </Badge>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">No organization memberships found.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
