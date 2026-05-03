import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { safeSingle } from '@/lib/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Globe, Shield, Users, Mail, Save } from 'lucide-react';

interface OrganizationSettings {
  id: string;
  name: string;
  domain: string | null;
  allowed_domains: string[] | null;
  domain_aliases: string[] | null;
  auto_approve_domains: boolean;
  signup_locked: boolean;
  signup_locked_reason: string | null;
}

export const DomainManagement: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');

  useEffect(() => {
    loadOrganizationSettings();
  }, [user]);

  const loadOrganizationSettings = async () => {
    if (!user) return;

    try {
      // Get user's organization (simplified for now)
      const membership = await safeSingle(
        supabase
          .from('organization_members')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .eq('is_active', true),
        {
          errorMessage: 'Failed to verify organization membership',
          logContext: 'domain_management_auth'
        }
      );

      if (!membership || (membership as any).role !== 'admin') {
        toast({
          title: "Access denied",
          description: "You must be an organization admin to access this feature.",
          variant: "destructive"
        });
        return;
      }

      const org = await safeSingle(
        supabase
          .from('organizations')
          .select('*')
          .eq('id', (membership as any).organization_id),
        {
          errorMessage: 'Failed to load organization settings',
          logContext: 'domain_management_org_load'
        }
      );

      if (!org) {
        toast({
          title: "Error",
          description: "Failed to load organization settings.",
          variant: "destructive"
        });
        return;
      }
      
      // Map the database result to our interface, providing defaults for new fields
      const orgSettings: OrganizationSettings = {
        id: (org as any).id,
        name: (org as any).name,
        domain: (org as any).domain,
        allowed_domains: (org as any).allowed_domains || [],
        domain_aliases: (org as any).domain_aliases || [],
        auto_approve_domains: (org as any).auto_approve_domains !== false, // Default to true
        signup_locked: (org as any).signup_locked || false,
        signup_locked_reason: (org as any).signup_locked_reason || null
      };
      
      setOrganization(orgSettings);
      setPrimaryDomain(orgSettings.domain || '');
    } catch (error: any) {
      toast({
        title: "Error loading settings",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const updateOrganizationSettings = async (updates: Partial<OrganizationSettings>) => {
    if (!organization) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organization.id);

      if (error) throw error;

      setOrganization({ ...organization, ...updates });
      toast({
        title: "Settings updated",
        description: "Domain settings have been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addAllowedDomain = async () => {
    if (!organization || !newDomain.trim()) return;

    const domain = newDomain.toLowerCase().trim();
    const currentDomains = organization.allowed_domains || [];
    
    if (currentDomains.includes(domain)) {
      toast({
        title: "Domain already exists",
        description: "This domain is already in the allowed list.",
        variant: "destructive"
      });
      return;
    }

    await updateOrganizationSettings({
      allowed_domains: [...currentDomains, domain]
    });
    setNewDomain('');
  };

  const removeAllowedDomain = async (domain: string) => {
    if (!organization) return;

    const currentDomains = organization.allowed_domains || [];
    await updateOrganizationSettings({
      allowed_domains: currentDomains.filter(d => d !== domain)
    });
  };

  const addDomainAlias = async () => {
    if (!organization || !newAlias.trim()) return;

    const alias = newAlias.toLowerCase().trim();
    const currentAliases = organization.domain_aliases || [];
    
    if (currentAliases.includes(alias)) {
      toast({
        title: "Alias already exists",
        description: "This domain alias is already configured.",
        variant: "destructive"
      });
      return;
    }

    await updateOrganizationSettings({
      domain_aliases: [...currentAliases, alias]
    });
    setNewAlias('');
  };

  const removeDomainAlias = async (alias: string) => {
    if (!organization) return;

    const currentAliases = organization.domain_aliases || [];
    await updateOrganizationSettings({
      domain_aliases: currentAliases.filter(a => a !== alias)
    });
  };

  const sendBulkInvitations = async () => {
    if (!organization || !bulkEmails.trim()) return;

    setLoading(true);
    try {
      const emails = bulkEmails
        .split(/[,\n]/)
        .map(email => email.trim())
        .filter(email => email && email.includes('@'));

      if (emails.length === 0) {
        toast({
          title: "No valid emails",
          description: "Please enter valid email addresses.",
          variant: "destructive"
        });
        return;
      }

      // Note: This would use the RPC function once types are updated
      // For now, we'll show a success message
      toast({
        title: "Invitations prepared",
        description: `${emails.length} invitations would be sent (feature coming soon).`,
      });

      setBulkEmails('');
    } catch (error: any) {
      toast({
        title: "Invitation failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!organization) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Access Required</h3>
          <p className="text-muted-foreground">You need admin access to manage domain settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Globe className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Domain Management</h1>
          <p className="text-muted-foreground">Configure domain-based auto-approval and invitations</p>
        </div>
      </div>

      {/* Auto-Approval Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Auto-Approval Settings
          </CardTitle>
          <CardDescription>
            Control how users from your domains automatically join the organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Enable Domain Auto-Approval</Label>
              <p className="text-sm text-muted-foreground">
                Automatically approve users with matching email domains
              </p>
            </div>
            <Switch
              checked={organization.auto_approve_domains}
              onCheckedChange={(checked) => 
                updateOrganizationSettings({ auto_approve_domains: checked })
              }
              disabled={loading}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Lock Signup</Label>
              <p className="text-sm text-muted-foreground">
                Temporarily disable new user signups
              </p>
            </div>
            <Switch
              checked={organization.signup_locked}
              onCheckedChange={(checked) => 
                updateOrganizationSettings({ signup_locked: checked })
              }
              disabled={loading}
            />
          </div>

          {organization.signup_locked && (
            <div>
              <Label htmlFor="lock-reason">Lock Reason (Optional)</Label>
              <Input
                id="lock-reason"
                value={organization.signup_locked_reason || ''}
                onChange={(e) => 
                  updateOrganizationSettings({ signup_locked_reason: e.target.value })
                }
                placeholder="Reason for locking signups..."
                className="mt-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Primary Domain Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Primary Domain</CardTitle>
          <CardDescription>
            The main email domain for your organization (e.g., example.com)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value.toLowerCase())}
              placeholder="yourcompany.com"
            />
            <Button 
              onClick={() => updateOrganizationSettings({ domain: primaryDomain.trim() || null })}
              disabled={loading || primaryDomain === (organization.domain || '')}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
          {organization.domain && (
            <p className="text-sm text-muted-foreground">
              Current: <Badge variant="secondary">{organization.domain}</Badge>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Allowed Domains */}
      <Card>
        <CardHeader>
          <CardTitle>Allowed Domains</CardTitle>
          <CardDescription>
            Additional domains that can auto-join your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              onKeyPress={(e) => e.key === 'Enter' && addAllowedDomain()}
            />
            <Button onClick={addAllowedDomain} disabled={loading || !newDomain.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(organization.allowed_domains || []).map((domain) => (
              <Badge key={domain} variant="secondary" className="flex items-center gap-1">
                {domain}
                <button
                  onClick={() => removeAllowedDomain(domain)}
                  className="ml-1 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Domain Aliases */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Aliases</CardTitle>
          <CardDescription>
            Alternative domain names that should be treated as the same organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="subsidiary.com"
              onKeyPress={(e) => e.key === 'Enter' && addDomainAlias()}
            />
            <Button onClick={addDomainAlias} disabled={loading || !newAlias.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(organization.domain_aliases || []).map((alias) => (
              <Badge key={alias} variant="outline" className="flex items-center gap-1">
                {alias}
                <button
                  onClick={() => removeDomainAlias(alias)}
                  className="ml-1 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Bulk Invitations
          </CardTitle>
          <CardDescription>
            Send invitations to multiple users at once
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="bulk-emails">Email Addresses</Label>
            <Textarea
              id="bulk-emails"
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              placeholder="Enter email addresses separated by commas or new lines&#10;john@company.com, jane@company.com&#10;bob@company.com"
              rows={4}
              className="mt-1"
            />
          </div>

          <Button 
            onClick={sendBulkInvitations} 
            disabled={loading || !bulkEmails.trim()}
            className="w-full"
          >
            <Users className="h-4 w-4 mr-2" />
            Send Invitations
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
