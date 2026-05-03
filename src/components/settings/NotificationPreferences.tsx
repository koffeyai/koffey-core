import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import {
  Bell,
  Mail,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Calendar,
  CheckSquare,
  Save,
} from 'lucide-react';

interface NotificationSettings {
  deal_at_risk: boolean;
  stale_deal: boolean;
  task_due: boolean;
  meeting_prep: boolean;
  daily_briefing: boolean;
  weekly_report: boolean;
  deal_won: boolean;
  new_lead: boolean;
  delivery_channel: 'in_app' | 'email' | 'both';
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const DEFAULTS: NotificationSettings = {
  deal_at_risk: true,
  stale_deal: true,
  task_due: true,
  meeting_prep: true,
  daily_briefing: true,
  weekly_report: true,
  deal_won: true,
  new_lead: true,
  delivery_channel: 'in_app',
  quiet_hours_start: '20:00',
  quiet_hours_end: '08:00',
};

const NotificationPreferences: React.FC = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`koffey_notif_prefs_${user.id}`);
      if (saved) {
        setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
      }
    }
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      localStorage.setItem(`koffey_notif_prefs_${user.id}`, JSON.stringify(settings));

      // Also try to save to DB if table exists
      if (organizationId) {
        await supabase
          .from('user_preferences')
          .upsert({
            user_id: user.id,
            organization_id: organizationId,
            preference_key: 'notification_settings',
            preference_value: settings,
          }, { onConflict: 'user_id,preference_key' })
          .select();
      }

      toast.success('Notification preferences saved');
    } catch (err) {
      // Silently handle if table doesn't exist - localStorage is the primary store
      toast.success('Notification preferences saved');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const notificationTypes = [
    { key: 'deal_at_risk' as const, label: 'Deal at Risk', desc: 'When a deal shows warning signs', icon: AlertTriangle },
    { key: 'stale_deal' as const, label: 'Stale Deal', desc: 'When a deal has no activity for 7+ days', icon: TrendingUp },
    { key: 'task_due' as const, label: 'Task Due', desc: 'When a task is approaching its due date', icon: CheckSquare },
    { key: 'meeting_prep' as const, label: 'Meeting Prep', desc: '15 minutes before a scheduled meeting', icon: Calendar },
    { key: 'daily_briefing' as const, label: 'Daily Briefing', desc: 'Morning summary of your day', icon: Mail },
    { key: 'weekly_report' as const, label: 'Weekly Report', desc: 'End-of-week pipeline summary', icon: TrendingUp },
    { key: 'deal_won' as const, label: 'Deal Won', desc: 'When a deal is closed-won', icon: TrendingUp },
    { key: 'new_lead' as const, label: 'New Lead', desc: 'When a new lead is assigned to you', icon: MessageSquare },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Preferences</h1>
          <p className="text-muted-foreground">Choose what alerts you receive and how</p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Delivery Channel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Delivery Channel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.delivery_channel}
            onValueChange={(v: any) => setSettings(prev => ({ ...prev, delivery_channel: v }))}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_app">In-app only</SelectItem>
              <SelectItem value="email">Email only</SelectItem>
              <SelectItem value="both">In-app + Email</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Notification Types */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Types</CardTitle>
          <CardDescription>Toggle which notifications you want to receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationTypes.map(nt => {
            const Icon = nt.icon;
            return (
              <div key={nt.key} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="font-medium">{nt.label}</Label>
                    <p className="text-xs text-muted-foreground">{nt.desc}</p>
                  </div>
                </div>
                <Switch
                  checked={settings[nt.key] as boolean}
                  onCheckedChange={() => toggle(nt.key)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Quiet Hours</CardTitle>
          <CardDescription>Pause non-urgent notifications during these hours</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <Label>From</Label>
              <input
                type="time"
                value={settings.quiet_hours_start}
                onChange={(e) => setSettings(prev => ({ ...prev, quiet_hours_start: e.target.value }))}
                className="block mt-1 px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <Label>To</Label>
              <input
                type="time"
                value={settings.quiet_hours_end}
                onChange={(e) => setSettings(prev => ({ ...prev, quiet_hours_end: e.target.value }))}
                className="block mt-1 px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationPreferences;
