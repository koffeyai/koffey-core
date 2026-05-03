
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Plus, Save, Copy, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface RoleTemplate {
  id: string;
  name: string;
  category: string;
  permissions_template: any;
  description: string;
}

interface CustomRole {
  id?: string;
  name: string;
  description: string;
  base_role: string;
  permissions: any;
  territory_scope: any;
  product_scope: any;
  vertical_scope: any;
}

export const RoleBuilder = () => {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [currentRole, setCurrentRole] = useState<CustomRole>({
    name: '',
    description: '',
    base_role: 'user',
    permissions: {},
    territory_scope: {},
    product_scope: {},
    vertical_scope: {}
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('role_templates')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadFromTemplate = (template: RoleTemplate) => {
    setCurrentRole({
      name: `${template.name} Copy`,
      description: template.description,
      base_role: 'user',
      permissions: template.permissions_template,
      territory_scope: {},
      product_scope: {},
      vertical_scope: {}
    });
    toast({
      title: "Template loaded",
      description: `Loaded permissions from ${template.name}`,
    });
  };

  const saveRole = async () => {
    if (!currentRole.name.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('custom_roles')
        .insert([{
          name: currentRole.name,
          description: currentRole.description,
          base_role: currentRole.base_role,
          permissions: currentRole.permissions,
          territory_scope: currentRole.territory_scope,
          product_scope: currentRole.product_scope,
          vertical_scope: currentRole.vertical_scope
        }]);

      if (error) throw error;

      toast({
        title: "Role created",
        description: `Custom role "${currentRole.name}" has been created successfully.`,
      });

      // Reset form
      setCurrentRole({
        name: '',
        description: '',
        base_role: 'user',
        permissions: {},
        territory_scope: {},
        product_scope: {},
        vertical_scope: {}
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePermission = (category: string, permission: string, value: any) => {
    setCurrentRole(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [category]: {
          ...prev.permissions[category],
          [permission]: value
        }
      }
    }));
  };

  const permissionCategories = [
    {
      id: 'data_access',
      title: 'Data Access',
      description: 'Control what data this role can access',
      permissions: [
        { id: 'all_territories', label: 'All Territories', type: 'boolean' },
        { id: 'assigned_accounts_only', label: 'Assigned Accounts Only', type: 'boolean' },
        { id: 'deal_size_minimum', label: 'Minimum Deal Size', type: 'number' },
        { id: 'industry_filter', label: 'Industry Access', type: 'boolean' },
        { id: 'strategic_accounts', label: 'Strategic Accounts', type: 'boolean' }
      ]
    },
    {
      id: 'reporting',
      title: 'Reporting',
      description: 'Define reporting and analytics capabilities',
      permissions: [
        { id: 'personal_pipeline', label: 'Personal Pipeline', type: 'boolean' },
        { id: 'team_activity', label: 'Team Activity', type: 'boolean' },
        { id: 'revenue_reports', label: 'Revenue Reports', type: 'boolean' },
        { id: 'competitive_analysis', label: 'Competitive Analysis', type: 'boolean' },
        { id: 'forecast_input', label: 'Forecast Input', type: 'boolean' }
      ]
    },
    {
      id: 'actions',
      title: 'Actions',
      description: 'Specify what actions this role can perform',
      permissions: [
        { id: 'create_opportunities', label: 'Create Opportunities', type: 'boolean' },
        { id: 'modify_account_data', label: 'Modify Account Data', type: 'boolean' },
        { id: 'approve_discounts', label: 'Approve Discounts', type: 'boolean' },
        { id: 'reassign_leads', label: 'Reassign Leads', type: 'boolean' },
        { id: 'territory_management', label: 'Territory Management', type: 'boolean' }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Custom Role Builder</h2>
          <p className="text-slate-600">Create and customize roles with specific permissions and scope</p>
        </div>
        <Button onClick={saveRole} disabled={loading} className="gap-2">
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save Role'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Role Templates</CardTitle>
            <CardDescription>
              Start with pre-built role templates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                   onClick={() => loadFromTemplate(template)}>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-sm">{template.name}</h4>
                  <Badge variant="secondary" className="text-xs">
                    {template.category}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">{template.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Role Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Role Configuration</CardTitle>
            <CardDescription>
              Define the role details and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
                <TabsTrigger value="scope">Scope</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="roleName">Role Name</Label>
                    <Input
                      id="roleName"
                      value={currentRole.name}
                      onChange={(e) => setCurrentRole(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Senior Enterprise AE"
                    />
                  </div>
                  <div>
                    <Label htmlFor="roleDescription">Description</Label>
                    <Textarea
                      id="roleDescription"
                      value={currentRole.description}
                      onChange={(e) => setCurrentRole(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe the purpose and responsibilities of this role"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="baseRole">Base Role</Label>
                    <Select value={currentRole.base_role} onValueChange={(value) => 
                      setCurrentRole(prev => ({ ...prev, base_role: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="permissions" className="space-y-6">
                {permissionCategories.map((category) => (
                  <div key={category.id} className="space-y-3">
                    <div>
                      <h4 className="font-medium text-slate-900">{category.title}</h4>
                      <p className="text-sm text-slate-600">{category.description}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {category.permissions.map((permission) => (
                        <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <Label htmlFor={`${category.id}-${permission.id}`} className="text-sm">
                            {permission.label}
                          </Label>
                          {permission.type === 'boolean' ? (
                            <Switch
                              id={`${category.id}-${permission.id}`}
                              checked={currentRole.permissions[category.id]?.[permission.id] || false}
                              onCheckedChange={(checked) => updatePermission(category.id, permission.id, checked)}
                            />
                          ) : (
                            <Input
                              id={`${category.id}-${permission.id}`}
                              type="number"
                              className="w-24"
                              value={currentRole.permissions[category.id]?.[permission.id] || ''}
                              onChange={(e) => updatePermission(category.id, permission.id, parseInt(e.target.value) || 0)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <Separator />
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="scope" className="space-y-4">
                <div className="text-sm text-slate-600 mb-4">
                  Define the territorial, product, and vertical scope for this role. This will be combined with assignment-specific scopes.
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Territory Scope</Label>
                    <p className="text-xs text-slate-500 mb-2">Territories this role has access to</p>
                    <div className="p-3 border rounded-lg bg-slate-50">
                      <p className="text-sm text-slate-600">Territory scope will be configured during role assignment</p>
                    </div>
                  </div>
                  <div>
                    <Label>Product Scope</Label>
                    <p className="text-xs text-slate-500 mb-2">Products this role can work with</p>
                    <div className="p-3 border rounded-lg bg-slate-50">
                      <p className="text-sm text-slate-600">Product scope will be configured during role assignment</p>
                    </div>
                  </div>
                  <div>
                    <Label>Vertical Scope</Label>
                    <p className="text-xs text-slate-500 mb-2">Industry verticals this role covers</p>
                    <div className="p-3 border rounded-lg bg-slate-50">
                      <p className="text-sm text-slate-600">Vertical scope will be configured during role assignment</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
