import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { OrganizationUserManager } from '@/components/organization/OrganizationUserManager';
import { DomainManagement } from '@/components/admin/DomainManagement';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import {
  Settings,
  Building2,
  Bell,
  Palette,
  Sliders,
  ArrowLeft,
  Crown,
  Globe,
  Users,
  Zap,
  Key,
  CheckCircle2
} from 'lucide-react';
import { MessagingSetup } from '@/components/settings/MessagingSetup';
import { GoogleIntegrationsCard } from '@/components/settings/GoogleIntegrationsCard';
import { useNavigate } from 'react-router-dom';

interface SettingsInterfaceProps {
  onBackToChat: () => void;
}

export const SettingsInterface: React.FC<SettingsInterfaceProps> = ({ onBackToChat }) => {
  const navigate = useNavigate();
  const { memberships, currentOrganization, selectOrganization, isAdmin } = useOrganizationAccess();
  const [activeTab, setActiveTab] = useState('organization');
  const [showDomainSettings, setShowDomainSettings] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [notifications, setNotifications] = useState({ email: true, push: true, weekly: true });
  const [appearance, setAppearance] = useState({ theme: 'light', compact: false, sidebarPosition: 'left' });
  const { toast } = useToast();

  // Load preferences from DB on mount
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: prefs } = await supabase
        .from('user_notification_preferences')
        .select('email_enabled, push_enabled, weekly_report_enabled, theme, compact_mode, sidebar_position')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (prefs) {
        setNotifications({
          email: prefs.email_enabled ?? true,
          push: prefs.push_enabled ?? true,
          weekly: prefs.weekly_report_enabled ?? true,
        });
        setAppearance({
          theme: prefs.theme || 'light',
          compact: prefs.compact_mode ?? false,
          sidebarPosition: prefs.sidebar_position || 'left',
        });
      }
    })();
  }, []);

  // Persist preference changes to DB
  const savePreference = useCallback(async (updates: Record<string, any>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    // Upsert — create row if it doesn't exist
    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert({ user_id: session.user.id, ...updates }, { onConflict: 'user_id' });
    if (error) console.warn('[settings] Failed to save preference:', error.message);
  }, []);

  const handlePasswordUpdate = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords don't match",
        variant: "destructive"
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive"
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Password updated successfully"
        });
        setIsPasswordDialogOpen(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update password",
        variant: "destructive"
      });
    } finally {
      setPasswordLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={onBackToChat}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to CRM
            </Button>
            <div className="flex items-center space-x-2">
              <Settings className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-sm text-muted-foreground">Configure your CRM experience and preferences</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="organization" className="flex items-center space-x-2">
              <Building2 className="h-4 w-4" />
              <span>Organization</span>
            </TabsTrigger>
            <TabsTrigger value="features" className="flex items-center space-x-2">
              <Zap className="h-4 w-4" />
              <span>Features</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center space-x-2">
              <Bell className="h-4 w-4" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center space-x-2">
              <Palette className="h-4 w-4" />
              <span>Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center space-x-2">
              <Sliders className="h-4 w-4" />
              <span>Advanced</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5" />
                  <span>Organization Management</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Organization */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Current Organization</h3>
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                        <h4 className="font-medium">{currentOrganization?.organization?.name}</h4>
                          {isAdmin ? (
                            <button 
                              onClick={() => setShowDomainSettings(true)}
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                              <Globe className="h-3 w-3" />
                              {currentOrganization?.organization?.domain || 'Configure domain'}
                            </button>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {currentOrganization?.organization?.domain || 'No domain configured'}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary">Current</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Domain Settings Dialog for Admins */}
                {isAdmin && (
                  <Dialog open={showDomainSettings} onOpenChange={setShowDomainSettings}>
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Globe className="h-5 w-5" />
                          Domain Settings
                        </DialogTitle>
                      </DialogHeader>
                      <DomainManagement />
                    </DialogContent>
                  </Dialog>
                )}

                {/* Your Organizations */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Your Organizations</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    You have access to {memberships.length} organization{memberships.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2">
                    {memberships.map((membership) => (
                      <Card key={membership.organization_id} className="cursor-pointer hover:bg-muted/50">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div>
                                <h4 className="font-medium">{membership.organization?.name}</h4>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {membership.role}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {membership.role === 'admin' && (
                                <Crown className="h-4 w-4 text-yellow-600" />
                              )}
                              {currentOrganization?.organization_id === membership.organization_id ? (
                                <Badge>Current</Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => selectOrganization(membership.organization_id)}
                                >
                                  Switch
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* User Management */}
                <div>
                  <h3 className="text-lg font-medium mb-3 flex items-center space-x-2">
                    <Users className="h-5 w-5" />
                    <span>User Management</span>
                  </h3>
                  <OrganizationUserManager />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            {/* Google Integrations */}
            <GoogleIntegrationsCard />
            
            {/* Messaging Setup */}
            <MessagingSetup />
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="h-5 w-5" />
                  <span>Features & Integrations</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">AI Chat Assistant</h4>
                      <p className="text-sm text-muted-foreground">Intelligent CRM operations and insights</p>
                    </div>
                    <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Real-time Collaboration</h4>
                      <p className="text-sm text-muted-foreground">Live updates and team synchronization</p>
                    </div>
                    <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Advanced Analytics</h4>
                      <p className="text-sm text-muted-foreground">RevOps dashboard and performance insights</p>
                    </div>
                    <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Bell className="h-5 w-5" />
                  <span>Notification Preferences</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Email Notifications</h4>
                      <p className="text-sm text-muted-foreground">Receive updates via email</p>
                    </div>
                    <Switch checked={notifications.email} onCheckedChange={(v) => { setNotifications(n => ({ ...n, email: v })); savePreference({ email_enabled: v }); toast({ title: v ? 'Email notifications enabled' : 'Email notifications disabled' }); }} />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Push Notifications</h4>
                      <p className="text-sm text-muted-foreground">Browser notifications for important updates</p>
                    </div>
                    <Switch checked={notifications.push} onCheckedChange={(v) => { setNotifications(n => ({ ...n, push: v })); savePreference({ push_enabled: v }); toast({ title: v ? 'Push notifications enabled' : 'Push notifications disabled' }); }} />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Weekly Reports</h4>
                      <p className="text-sm text-muted-foreground">Automated weekly performance summaries</p>
                    </div>
                    <Switch checked={notifications.weekly} onCheckedChange={(v) => { setNotifications(n => ({ ...n, weekly: v })); savePreference({ weekly_report_enabled: v }); toast({ title: v ? 'Weekly reports enabled' : 'Weekly reports disabled' }); }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Palette className="h-5 w-5" />
                  <span>Appearance & Theme</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Theme</h4>
                      <p className="text-sm text-muted-foreground">Choose your preferred color scheme</p>
                    </div>
                    <Select value={appearance.theme} onValueChange={(v) => { setAppearance(a => ({ ...a, theme: v })); savePreference({ theme: v }); toast({ title: `Theme set to ${v}` }); }}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Compact Mode</h4>
                      <p className="text-sm text-muted-foreground">Reduce spacing for more content</p>
                    </div>
                    <Switch checked={appearance.compact} onCheckedChange={(v) => { setAppearance(a => ({ ...a, compact: v })); savePreference({ compact_mode: v }); toast({ title: v ? 'Compact mode enabled' : 'Compact mode disabled' }); }} />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Sidebar Position</h4>
                      <p className="text-sm text-muted-foreground">Left or right sidebar layout</p>
                    </div>
                    <Select value={appearance.sidebarPosition} onValueChange={(v) => { setAppearance(a => ({ ...a, sidebarPosition: v })); savePreference({ sidebar_position: v }); toast({ title: `Sidebar moved to ${v}` }); }}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Sliders className="h-5 w-5" />
                  <span>Advanced Settings</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isAdmin && (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Search Accuracy</h4>
                        <p className="text-sm text-muted-foreground">Monitor AI chat search quality and fix failing queries</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: 'audit-log' } }));
                      }}>
                        View Dashboard
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Data Export</h4>
                      <p className="text-sm text-muted-foreground">Export your CRM data</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={async () => {
                      toast({ title: 'Exporting...', description: 'Preparing your CRM data for download' });
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) return;
                        const orgId = currentOrganization?.organization_id;
                        const [deals, contacts, accounts, activities] = await Promise.all([
                          supabase.from('deals').select('*').eq('organization_id', orgId),
                          supabase.from('contacts').select('*').eq('organization_id', orgId),
                          supabase.from('accounts').select('*').eq('organization_id', orgId),
                          supabase.from('activities').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(500),
                        ]);
                        const exportData = {
                          exported_at: new Date().toISOString(),
                          organization: currentOrganization?.organization?.name || 'Unknown',
                          deals: deals.data || [],
                          contacts: contacts.data || [],
                          accounts: accounts.data || [],
                          activities: activities.data || [],
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `koffey-crm-export-${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast({ title: 'Export complete', description: `${(deals.data||[]).length} deals, ${(contacts.data||[]).length} contacts, ${(accounts.data||[]).length} accounts exported` });
                      } catch (err: any) {
                        toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
                      }
                    }}>Export Data</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">API Access</h4>
                      <p className="text-sm text-muted-foreground">Manage API keys and webhooks</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={async () => {
                      const key = `kfy_${crypto.randomUUID().replace(/-/g, '').substring(0, 32)}`;
                      try {
                        await navigator.clipboard.writeText(key);
                        toast({ title: 'API Key Generated', description: `Copied to clipboard: ${key.substring(0, 12)}...` });
                      } catch {
                        toast({ title: 'API Key Generated', description: key });
                      }
                    }}>Generate Key</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Update Password</h4>
                      <p className="text-sm text-muted-foreground">Change your account password</p>
                    </div>
                    <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Key className="h-4 w-4 mr-2" />
                          Change
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Update Password</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <Input
                              id="new-password"
                              type="password"
                              placeholder="Enter new password"
                              value={passwordForm.newPassword}
                              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm New Password</Label>
                            <Input
                              id="confirm-password"
                              type="password"
                              placeholder="Confirm new password"
                              value={passwordForm.confirmPassword}
                              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            />
                          </div>
                          <div className="flex gap-2 pt-4">
                            <Button
                              onClick={handlePasswordUpdate}
                              disabled={passwordLoading || !passwordForm.newPassword || !passwordForm.confirmPassword}
                              className="flex-1"
                            >
                              {passwordLoading ? "Updating..." : "Update Password"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsPasswordDialogOpen(false);
                                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                              }}
                              disabled={passwordLoading}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Security Settings</h4>
                      <p className="text-sm text-muted-foreground">Two-factor authentication and security</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
                        if (error) throw error;
                        if (data?.totp?.qr_code) {
                          toast({ title: '2FA Enrollment Started', description: `Scan the QR code in your authenticator app. Secret: ${data.totp.secret}` });
                        }
                      } catch (err: any) {
                        toast({ title: '2FA Setup', description: err.message || 'MFA enrollment requires Supabase Pro plan', variant: 'destructive' });
                      }
                    }}>Enable 2FA</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
