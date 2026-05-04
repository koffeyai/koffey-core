import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Search, 
  Plus, 
  Mail, 
  UserCheck, 
  UserX, 
  Shield, 
  MoreHorizontal,
  Filter,
  Download,
  UserPlus,
  Brain,
  X,
  Edit,
  Trash2
} from 'lucide-react';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OrganizationMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  is_active: boolean;
  profiles?: {
    full_name?: string;
    email?: string;
    territory?: string;
    department?: string;
  };
}

interface LastLoginMap {
  [userId: string]: string;
}

interface AIInsight {
  id: string;
  type: 'pattern' | 'users' | 'optimization';
  title: string;
  description: string;
  actionLabel: string;
  severity: 'info' | 'warning' | 'success';
}

export const OrganizationUserManager: React.FC = () => {
  const { user } = useAuth();
  const { organizationId } = useOrganizationAccess();
  const { toast } = useToast();
  
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastLogins, setLastLogins] = useState<LastLoginMap>({});
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [editForm, setEditForm] = useState({
    fullName: '',
    role: 'member',
    territory: '',
    department: ''
  });
  const [showAIInsights, setShowAIInsights] = useState(true);

  const getMemberInitial = (member: OrganizationMember): string => {
    const fullNameInitial = member.profiles?.full_name?.trim()?.charAt(0);
    const emailInitial = member.profiles?.email?.trim()?.charAt(0);
    return (fullNameInitial || emailInitial || 'U').toUpperCase();
  };

  const aiInsights: AIInsight[] = [
    {
      id: '1',
      type: 'pattern',
      title: 'New hire pattern detected',
      description: 'You typically assign new SDRs to the Midwest territory. Jessica Williams fits this pattern.',
      actionLabel: 'Auto-assign territory',
      severity: 'info'
    },
    {
      id: '2',
      type: 'users',
      title: 'Inactive users found',
      description: '3 users haven\'t logged in for 30+ days. Consider sending activation reminders.',
      actionLabel: 'Send reminders',
      severity: 'warning'
    },
    {
      id: '3',
      type: 'optimization',
      title: 'Role optimization available',
      description: 'Based on activity patterns, 4 users might benefit from updated permissions.',
      actionLabel: 'Review roles',
      severity: 'success'
    }
  ];

  useEffect(() => {
    if (organizationId) {
      loadMembers();
    }
  }, [organizationId]);

  // Fetch last login data for members
  const fetchLastLogins = async (memberList: OrganizationMember[]) => {
    const loginData: LastLoginMap = {};
    
    for (const member of memberList) {
      if (member.user_id) {
        try {
          const { data } = await supabase.rpc('get_user_last_login', { 
            p_user_id: member.user_id 
          });
          
          loginData[member.user_id] = data 
            ? new Date(data).toLocaleDateString() 
            : 'Never';
        } catch (error) {
          console.error(`Error fetching last login for user ${member.user_id}:`, error);
          loginData[member.user_id] = 'Never';
        }
      }
    }
    
    setLastLogins(loginData);
  };

  const loadMembers = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);

      // Get members
      const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('joined_at', { ascending: false });

      if (membersError) throw membersError;

      // Get user profiles
      const memberIds = membersData?.map(m => m.user_id) || [];
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, territory, department')
        .in('id', memberIds);

      if (profilesError) throw profilesError;

      // Combine data
      const membersWithProfiles = membersData?.map(member => ({
        ...member,
        profiles: profilesData?.find(profile => profile.id === member.user_id)
      })) || [];

      setMembers(membersWithProfiles as OrganizationMember[]);
      
      // Fetch last login data for all members
      if (membersWithProfiles && membersWithProfiles.length > 0) {
        await fetchLastLogins(membersWithProfiles as OrganizationMember[]);
      }
    } catch (error) {
      console.error('Error loading members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load organization members',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!organizationId || !inviteEmail) return;

    try {
      const { data, error } = await supabase.functions.invoke('create-org-invitation', {
        body: {
          organizationId: organizationId,
          email: inviteEmail,
          role: inviteRole
        }
      });

      if (error) throw error;

      toast({
        title: 'Invitation Sent',
        description: `Invitation sent to ${inviteEmail}`,
      });

      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('member');
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast({
        title: 'Error',
        description: 'Failed to send invitation',
        variant: 'destructive'
      });
    }
  };

  const openEditDialog = (member: OrganizationMember) => {
    setEditingMember(member);
    setEditForm({
      fullName: member.profiles?.full_name || '',
      role: member.role || 'member',
      territory: member.profiles?.territory || '',
      department: member.profiles?.department || ''
    });
  };

  const handleSaveUser = async () => {
    if (!editingMember || !organizationId) return;

    try {
      const fullName = editForm.fullName.trim();
      const territory = editForm.territory.trim();
      const department = editForm.department.trim();

      const [{ error: profileError }, { error: memberError }] = await Promise.all([
        supabase
          .from('profiles')
          .update({
            full_name: fullName || null,
            territory: territory || null,
            department: department || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingMember.user_id),
        supabase
          .from('organization_members')
          .update({ role: editForm.role })
          .eq('id', editingMember.id)
          .eq('organization_id', organizationId)
      ]);

      if (profileError) throw profileError;
      if (memberError) throw memberError;

      toast({
        title: 'User updated',
        description: `${fullName || editingMember.profiles?.email || 'User'} has been updated.`,
      });

      setEditingMember(null);
      await loadMembers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user. Check your permissions and try again.',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (member: OrganizationMember) => {
    // Mock logic for active/pending status
    const isRecent = new Date(member.joined_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (isRecent && !member.profiles?.full_name) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600">Pending</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>;
  };

  const getLastLogin = (member: OrganizationMember) => {
    return lastLogins[member.user_id] || 'Loading...';
  };

  const filteredMembers = members.filter(member => {
    const searchLower = searchTerm.toLowerCase();
    return (
      member.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      member.profiles?.email?.toLowerCase().includes(searchLower) ||
      member.role.toLowerCase().includes(searchLower) ||
      member.profiles?.territory?.toLowerCase().includes(searchLower)
    );
  });

  const totalUsers = members.length;
  const activeUsers = members.filter(m => m.is_active).length;
  const pendingUsers = members.filter(m => !m.profiles?.full_name).length;
  const adminUsers = members.filter(m => m.role === 'owner' || m.role === 'admin').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground">Manage organization users, roles, and permissions</p>
          </div>
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="sales_rep">Sales Rep</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleInviteUser} className="w-full">
                  Send Invitation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 max-w-md"
            />
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input type="checkbox" className="rounded" />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <input type="checkbox" className="rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getMemberInitial(member)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{member.profiles?.full_name || 'Pending'}</p>
                          <p className="text-xs text-muted-foreground">{member.profiles?.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{member.role.replace('_', ' ')}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{member.profiles?.territory || 'Unassigned'}</span>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(member)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{getLastLogin(member)}</span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => openEditDialog(member)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="h-4 w-4 mr-2" />
                            Send Message
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-full-name">Full Name</Label>
                <Input
                  id="edit-full-name"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div>
                <Label htmlFor="edit-role">Role</Label>
                <Select value={editForm.role} onValueChange={(role) => setEditForm(prev => ({ ...prev, role }))}>
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-territory">Territory</Label>
                <Input
                  id="edit-territory"
                  value={editForm.territory}
                  onChange={(e) => setEditForm(prev => ({ ...prev, territory: e.target.value }))}
                  placeholder="e.g. West Coast"
                />
              </div>
              <div>
                <Label htmlFor="edit-department">Department</Label>
                <Input
                  id="edit-department"
                  value={editForm.department}
                  onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="e.g. Sales"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingMember(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveUser}>
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Statistics */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{activeUsers}</p>
                <p className="text-sm text-muted-foreground">Active Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{pendingUsers}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{adminUsers}</p>
                <p className="text-sm text-muted-foreground">Admins</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Insights Panel */}
      {showAIInsights && (
        <div className="w-80">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">AI Insights</CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowAIInsights(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiInsights.map((insight) => (
                <div key={insight.id} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start space-x-2 mb-2">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      insight.severity === 'warning' ? 'bg-yellow-500' :
                      insight.severity === 'success' ? 'bg-green-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{insight.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    {insight.actionLabel}
                  </Button>
                </div>
              ))}
              
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Try saying:</p>
                <div className="space-y-1">
                  <p className="text-xs text-blue-600 cursor-pointer hover:underline">
                    "Add 5 new SDRs to the west coast team"
                  </p>
                  <p className="text-xs text-blue-600 cursor-pointer hover:underline">
                    "Review users who haven't logged in"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
