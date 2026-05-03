
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Settings, Plus, Edit, Trash2 } from 'lucide-react';
import { RoleBuilder } from './RoleBuilder';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface CustomRole {
  id: string;
  name: string;
  description: string;
  base_role: string;
  permissions: any;
  is_active: boolean;
  created_at: string;
  created_by: string;
}

interface RoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  is_active: boolean;
  effective_date: string;
  expiration_date: string | null;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
  custom_roles: {
    name: string;
  } | null;
}

interface RawRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  is_active: boolean;
  effective_date: string;
  expiration_date: string | null;
  profiles: Array<{
    full_name: string | null;
    email: string;
  }> | null;
  custom_roles: Array<{
    name: string;
  }> | null;
}

export const RoleManagement = () => {
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadCustomRoles(), loadAssignments()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomRoles = async () => {
    const { data, error } = await supabase
      .from('custom_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading custom roles:', error);
      throw error;
    }
    setCustomRoles(data || []);
  };

  const loadAssignments = async () => {
    const { data, error } = await supabase
      .from('user_role_assignments')
      .select(`
        id,
        user_id,
        role_id,
        is_active,
        effective_date,
        expiration_date,
        created_at,
        profiles!user_role_assignments_user_id_fkey (
          full_name,
          email
        ),
        custom_roles!user_role_assignments_role_id_fkey (
          name
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading role assignments:', error);
      throw error;
    }
    
    // Type the data correctly and filter out any null relationships
    const typedData = ((data || []) as RawRoleAssignment[])
      .map((assignment) => ({
        id: assignment.id,
        user_id: assignment.user_id,
        role_id: assignment.role_id,
        is_active: assignment.is_active,
        effective_date: assignment.effective_date,
        expiration_date: assignment.expiration_date,
        profiles: assignment.profiles?.[0] || null,
        custom_roles: assignment.custom_roles?.[0] || null,
      }))
      .filter((assignment) => assignment.profiles && assignment.custom_roles);

    setAssignments(typedData);
  };

  const toggleRoleStatus = async (roleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('custom_roles')
        .update({ is_active: !isActive })
        .eq('id', roleId);

      if (error) throw error;

      toast({
        title: "Role updated",
        description: `Role has been ${!isActive ? 'activated' : 'deactivated'}`,
      });

      loadCustomRoles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to delete this role? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      toast({
        title: "Role deleted",
        description: "The custom role has been permanently deleted",
      });

      loadCustomRoles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getPermissionCount = (permissions: any) => {
    let count = 0;
    Object.values(permissions || {}).forEach((category: any) => {
      if (typeof category === 'object') {
        count += Object.values(category).filter(Boolean).length;
      }
    });
    return count;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Role Management</h1>
          <p className="text-slate-600">Manage custom roles and user assignments</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="gap-2">
            <Users className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="builder" className="gap-2">
            <Plus className="w-4 h-4" />
            Role Builder
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <Settings className="w-4 h-4" />
            Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Total Custom Roles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{customRoles.length}</div>
                <p className="text-sm text-slate-600">
                  {customRoles.filter(r => r.is_active).length} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Active Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{assignments.length}</div>
                <p className="text-sm text-slate-600">
                  Users with custom roles
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Role Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">3</div>
                <p className="text-sm text-slate-600">
                  Pre-built templates
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Custom Roles</CardTitle>
              <CardDescription>
                Manage your organization's custom roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {customRoles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium">{role.name}</h3>
                        <Badge variant={role.is_active ? "default" : "secondary"}>
                          {role.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">
                          {role.base_role}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{role.description}</p>
                      <div className="text-xs text-slate-500">
                        {getPermissionCount(role.permissions)} permissions configured
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleRoleStatus(role.id, role.is_active)}
                      >
                        {role.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteRole(role.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {customRoles.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No custom roles created yet. Use the Role Builder to create your first custom role.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="builder">
          <RoleBuilder />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Role Assignments</CardTitle>
              <CardDescription>
                View and manage user role assignments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">
                        {assignment.profiles?.full_name || assignment.profiles?.email || 'Unknown User'}
                      </div>
                      <div className="text-sm text-slate-600">{assignment.profiles?.email}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Assigned: {new Date(assignment.effective_date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge>{assignment.custom_roles?.name || 'Unknown Role'}</Badge>
                      {assignment.expiration_date && (
                        <div className="text-xs text-slate-500 mt-1">
                          Expires: {new Date(assignment.expiration_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {assignments.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    No role assignments found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
