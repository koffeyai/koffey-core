import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, UserCheck, UserX, Download, Calendar } from "lucide-react";
import { toast } from "sonner";

interface UserAnalytics {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
  organization_count: number;
  primary_organization_name: string | null;
  is_active: boolean;
}

interface SegmentStats {
  segment_type: string;
  segment_value: string;
  user_count: number;
}

export const UserAnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState<UserAnalytics[]>([]);
  const [segmentStats, setSegmentStats] = useState<SegmentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<"all" | "active" | "inactive" | "admins" | "orphaned">("all");

  useEffect(() => {
    loadUserAnalytics();
  }, []);

  const loadUserAnalytics = async () => {
    try {
      const [analyticsResult, segmentResult] = await Promise.all([
        supabase.rpc('get_user_analytics_overview'),
        supabase.rpc('get_user_segment_stats')
      ]);
      
      if (analyticsResult.error) {
        console.error('Error loading user analytics:', analyticsResult.error);
        toast.error("Failed to load user analytics");
        return;
      }

      if (segmentResult.error) {
        console.error('Error loading segment stats:', segmentResult.error);
        toast.error("Failed to load segment statistics");
        return;
      }

      setAnalytics((analyticsResult.data as UserAnalytics[]) || []);
      setSegmentStats((segmentResult.data as SegmentStats[]) || []);
    } catch (err) {
      console.error('Error:', err);
      toast.error("Failed to load user analytics");
    } finally {
      setLoading(false);
    }
  };

  const exportUserData = async () => {
    try {
      const csvContent = [
        ['Email', 'Name', 'Role', 'Organization Count', 'Primary Organization', 'Signup Date', 'Last Login', 'Status'].join(','),
        ...filteredUsers.map(user => [
          user.email,
          user.full_name || '',
          user.role,
          user.organization_count,
          user.primary_organization_name || '',
          new Date(user.created_at).toLocaleDateString(),
          user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never',
          user.is_active ? 'Active' : 'Inactive'
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success("User data exported successfully");
    } catch (err) {
      console.error('Export error:', err);
      toast.error("Failed to export user data");
    }
  };

  const filteredUsers = analytics.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (user.primary_organization_name && user.primary_organization_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    switch (selectedSegment) {
      case "active":
        return matchesSearch && user.is_active;
      case "inactive":
        return matchesSearch && !user.is_active;
      case "admins":
        return matchesSearch && user.role === 'admin';
      case "orphaned":
        return matchesSearch && user.organization_count === 0;
      default:
        return matchesSearch;
    }
  });

  // Calculate summary stats from segment data
  const getStatValue = (segmentType: string, segmentValue: string): number => {
    const stat = segmentStats.find(s => s.segment_type === segmentType && s.segment_value === segmentValue);
    return stat?.user_count || 0;
  };

  const totalUsers = analytics.length;
  const activeUsers = analytics.filter(u => u.is_active).length;
  const inactiveUsers = totalUsers - activeUsers;
  const admins = analytics.filter(u => u.role === 'admin').length;
  const members = analytics.filter(u => u.role === 'member').length;
  const orphanedUsers = analytics.filter(u => u.organization_count === 0).length;
  const multiOrgUsers = analytics.filter(u => u.organization_count > 1).length;

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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{inactiveUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{admins}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Orphaned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{orphanedUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Multi-Org</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{multiOrgUsers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>User Analytics & Segmentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users, organizations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Button onClick={exportUserData} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedSegment === "all" ? "default" : "outline"}
              onClick={() => setSelectedSegment("all")}
              size="sm"
            >
              All ({totalUsers})
            </Button>
            <Button
              variant={selectedSegment === "active" ? "default" : "outline"}
              onClick={() => setSelectedSegment("active")}
              size="sm"
            >
              <UserCheck className="h-4 w-4 mr-1" />
              Active ({activeUsers})
            </Button>
            <Button
              variant={selectedSegment === "inactive" ? "default" : "outline"}
              onClick={() => setSelectedSegment("inactive")}
              size="sm"
            >
              <UserX className="h-4 w-4 mr-1" />
              Inactive ({inactiveUsers})
            </Button>
            <Button
              variant={selectedSegment === "admins" ? "default" : "outline"}
              onClick={() => setSelectedSegment("admins")}
              size="sm"
            >
              Admins ({admins})
            </Button>
            <Button
              variant={selectedSegment === "orphaned" ? "default" : "outline"}
              onClick={() => setSelectedSegment("orphaned")}
              size="sm"
            >
              Orphaned ({orphanedUsers})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Organizations</TableHead>
                  <TableHead>Signup Date</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{user.email}</div>
                          {user.full_name && (
                            <div className="text-sm text-muted-foreground">{user.full_name}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">{user.organization_count} org{user.organization_count !== 1 ? 's' : ''}</span>
                        </div>
                        {user.primary_organization_name && (
                          <div className="text-xs text-muted-foreground">
                            {user.primary_organization_name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.last_sign_in_at ? (
                        <div>{new Date(user.last_sign_in_at).toLocaleDateString()}</div>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};