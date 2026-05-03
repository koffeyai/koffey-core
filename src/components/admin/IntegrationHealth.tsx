import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  MessageCircle,
  Mail,
  Plug,
  Clock,
} from 'lucide-react';

interface IntegrationStatus {
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  lastSync: string | null;
  errorCount: number;
  status: 'healthy' | 'warning' | 'error' | 'disconnected';
  details: string;
}

const IntegrationHealth: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organizationId) loadHealth();
  }, [organizationId]);

  const loadHealth = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const results: IntegrationStatus[] = [];

      // Google Calendar — check google_tokens for calendar scope
      const { data: { session } } = await supabase.auth.getSession();
      const { data: gTokens } = session?.user ? await supabase
        .from('google_tokens')
        .select('updated_at, scopes')
        .eq('user_id', session.user.id)
        .maybeSingle() : { data: null };

      const calScopes: string[] = gTokens?.scopes || [];
      const hasCalendar = calScopes.some(s => s.includes('calendar'));

      results.push({
        name: 'Google Calendar',
        icon: <Calendar className="h-5 w-5" />,
        connected: hasCalendar,
        lastSync: gTokens?.updated_at || null,
        errorCount: 0,
        status: hasCalendar ? 'healthy' : 'disconnected',
        details: hasCalendar ? `Connected (last updated: ${new Date(gTokens!.updated_at).toLocaleString()})` : 'Not connected',
      });

      // WhatsApp — check messaging_sessions table for active sessions
      const { count: waCount } = await supabase
        .from('messaging_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('channel', 'whatsapp')
        .limit(1);
      const waConnected = (waCount || 0) > 0;

      results.push({
        name: 'WhatsApp',
        icon: <MessageCircle className="h-5 w-5" />,
        connected: waConnected,
        lastSync: null,
        errorCount: 0,
        status: waConnected ? 'healthy' : 'disconnected',
        details: waConnected ? 'Connected via Twilio' : 'Not configured',
      });

      // Email — check gmail scope in google_tokens + email_sync_state
      const hasGmail = calScopes.some(s => s.includes('gmail'));
      let emailSyncActive = false;
      if (hasGmail && session?.user) {
        const { data: syncState } = await supabase
          .from('email_sync_state')
          .select('sync_status')
          .eq('user_id', session.user.id)
          .eq('sync_status', 'active')
          .maybeSingle();
        emailSyncActive = !!syncState;
      }

      results.push({
        name: 'Email',
        icon: <Mail className="h-5 w-5" />,
        connected: hasGmail,
        lastSync: null,
        errorCount: 0,
        status: hasGmail ? (emailSyncActive ? 'healthy' : 'warning') : 'disconnected',
        details: hasGmail ? (emailSyncActive ? 'Gmail sync active' : 'Gmail connected, sync not started') : 'Not configured — enable in Settings → Features',
      });

      // Web Tracking — placeholder (not yet built)
      results.push({
        name: 'Web Tracking',
        icon: <Plug className="h-5 w-5" />,
        connected: false,
        lastSync: null,
        errorCount: 0,
        status: 'disconnected',
        details: 'Not yet available',
      });

      setIntegrations(results);
    } catch (err) {
      console.error('Failed to load integration health:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <XCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      healthy: 'default',
      warning: 'secondary',
      error: 'destructive',
      disconnected: 'outline',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Checking integrations...</span>
      </div>
    );
  }

  const connectedCount = integrations.filter(i => i.connected).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integration Health</h1>
          <p className="text-muted-foreground">
            {connectedCount} of {integrations.length} integrations connected
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadHealth}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => (
          <Card key={integration.name}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">{integration.icon}</div>
                  <div>
                    <h3 className="font-semibold">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground">{integration.details}</p>
                    {integration.lastSync && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Last sync: {new Date(integration.lastSync).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(integration.status)}
                  {getStatusBadge(integration.status)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default IntegrationHealth;
