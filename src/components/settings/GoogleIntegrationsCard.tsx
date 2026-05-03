import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Link2, CheckCircle2, ExternalLink, Mail, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GoogleDriveIcon } from '@/components/icons/GoogleDriveIcon';
import {
  connectCalendar,
  connectGoogleDrive,
  connectEmail,
  checkGoogleDriveConnection,
  checkGoogleCalendarConnection,
  checkGmailConnection,
  describeGoogleOAuthError,
  getGoogleOAuthStatus,
} from '@/components/auth/GoogleAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';

type ConnectionState = 'loading' | 'connected' | 'disconnected' | 'needs-scope';

interface ConnectionStatus {
  calendar: ConnectionState;
  drive: ConnectionState;
  email: ConnectionState;
}

interface DeploymentGoogleStatus {
  configured: boolean;
  missing: string[];
  redirectUri?: string;
}

export const GoogleIntegrationsCard: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>({
    calendar: 'loading',
    drive: 'loading',
    email: 'loading',
  });
  const [connecting, setConnecting] = useState<'calendar' | 'drive' | 'email' | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentGoogleStatus | null>(null);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    checkConnections();
    checkDeploymentStatus();
  }, []);

  // Handle OAuth return params (google_connected / google_error)
  useEffect(() => {
    const googleConnected = searchParams.get('google_connected');
    const googleError = searchParams.get('google_error');
    const googleMissing = searchParams.get('google_missing');
    const googleDetail = searchParams.get('google_detail');

    if (googleError) {
      // Clean up URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('google_error');
      newParams.delete('google_missing');
      newParams.delete('google_detail');
      setSearchParams(newParams, { replace: true });

      toast({
        title: 'Google connection failed',
        description: describeGoogleOAuthError(googleError, googleMissing, null, googleDetail),
        variant: 'destructive',
      });
      return;
    }

    if (googleConnected === 'true') {
      // Clean up URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('google_connected');
      newParams.delete('scopes');
      newParams.delete('google_missing');
      newParams.delete('google_detail');
      setSearchParams(newParams, { replace: true });

      // Refresh connection status
      checkConnections();

      toast({
        title: 'Google connected!',
        description: 'Your integration is now active.',
      });
    }
  }, [searchParams]);

  const checkConnections = async () => {
    try {
      const [calendarResult, driveResult, emailResult] = await Promise.all([
        checkGoogleCalendarConnection(),
        checkGoogleDriveConnection(),
        checkGmailConnection(),
      ]);

      setStatus({
        calendar: calendarResult.connected ? 'connected' :
          (calendarResult.scopes.length > 0 ? 'needs-scope' : 'disconnected'),
        drive: driveResult.connected ? 'connected' :
          (driveResult.scopes.length > 0 ? 'needs-scope' : 'disconnected'),
        email: emailResult.connected ? 'connected' :
          (emailResult.scopes.length > 0 ? 'needs-scope' : 'disconnected'),
      });
    } catch (error) {
      console.error('Error checking connections:', error);
      setStatus({
        calendar: 'disconnected',
        drive: 'disconnected',
        email: 'disconnected',
      });
    }
  };

  const checkDeploymentStatus = async () => {
    const oauthStatus = await getGoogleOAuthStatus();
    if (!oauthStatus) {
      setDeploymentStatus(null);
      return;
    }

    setDeploymentStatus({
      configured: oauthStatus.configured,
      missing: oauthStatus.missing,
      redirectUri: oauthStatus.redirect_uri,
    });
  };

  const handleConnectCalendar = async () => {
    try {
      setConnecting('calendar');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: 'Not signed in',
          description: 'Please sign in to connect your Google Calendar',
          variant: 'destructive'
        });
        return;
      }
      // Pass current settings page as returnTo
      const returnTo = `${window.location.origin}${window.location.pathname}`;
      await connectCalendar({ id: session.user.id }, returnTo);
    } catch (error) {
      console.error('Error connecting calendar:', error);
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Failed to start Google Calendar connection',
        variant: 'destructive'
      });
      setConnecting(null);
    }
  };

  const handleConnectDrive = async () => {
    try {
      setConnecting('drive');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: 'Not signed in',
          description: 'Please sign in to connect your Google Drive',
          variant: 'destructive'
        });
        return;
      }
      // Pass current settings page as returnTo
      const returnTo = `${window.location.origin}${window.location.pathname}`;
      await connectGoogleDrive({ id: session.user.id }, returnTo);
    } catch (error) {
      console.error('Error connecting drive:', error);
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Failed to start Google Drive connection',
        variant: 'destructive'
      });
      setConnecting(null);
    }
  };

  const handleConnectEmail = async () => {
    try {
      setConnecting('email');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: 'Not signed in',
          description: 'Please sign in to connect your Gmail',
          variant: 'destructive'
        });
        return;
      }
      const returnTo = `${window.location.origin}${window.location.pathname}`;
      await connectEmail({ id: session.user.id }, returnTo);
    } catch (error) {
      console.error('Error connecting email:', error);
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Failed to start Gmail connection',
        variant: 'destructive'
      });
      setConnecting(null);
    }
  };

  const googleNotConfigured = Boolean(deploymentStatus && !deploymentStatus.configured);

  const renderConnectionItem = (
    type: 'calendar' | 'drive' | 'email',
    icon: React.ReactNode,
    title: string,
    description: string,
    connectionStatus: 'loading' | 'connected' | 'disconnected' | 'needs-scope',
    onConnect: () => void
  ) => {
    const isConnecting = connecting === type;

    return (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            {icon}
          </div>
          <div>
            <h4 className="font-medium">{title}</h4>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div>
          {connectionStatus === 'loading' ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking...
            </Badge>
          ) : connectionStatus === 'connected' ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : connectionStatus === 'needs-scope' ? (
            <Button
              variant="default"
              size="sm"
              onClick={onConnect}
              disabled={isConnecting || googleNotConfigured}
              className="gap-1"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Enabling...
                </>
              ) : googleNotConfigured ? (
                'Setup required'
              ) : (
                <>
                  <ExternalLink className="h-3 w-3" />
                  Enable {type === 'drive' ? 'Drive' : type === 'email' ? 'Email' : 'Calendar'}
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onConnect}
              disabled={isConnecting || googleNotConfigured}
              className="gap-1"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Connecting...
                </>
              ) : googleNotConfigured ? (
                'Setup required'
              ) : (
                <>
                  <ExternalLink className="h-3 w-3" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Link2 className="h-5 w-5" />
          <span>Google Integrations</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {deploymentStatus && !deploymentStatus.configured && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Admin setup required</AlertTitle>
            <AlertDescription>
              <p>
                This deployment has not finished configuring Google Calendar, Gmail, and Drive yet.
                An operator needs to add {deploymentStatus.missing.join(' and ')} to the environment and rerun `npm run setup`.
              </p>
              {deploymentStatus.redirectUri && (
                <p className="mt-2 break-all">
                  Google redirect URI: {deploymentStatus.redirectUri}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {renderConnectionItem(
          'calendar',
          <Calendar className="h-5 w-5 text-primary" />,
          'Google Calendar',
          'Sync your meetings and events for briefings',
          status.calendar,
          handleConnectCalendar
        )}
        {renderConnectionItem(
          'email',
          <Mail className="h-5 w-5 text-red-500" />,
          'Gmail',
          'Auto-sync emails with CRM contacts and deals',
          status.email,
          handleConnectEmail
        )}
        {renderConnectionItem(
          'drive',
          <GoogleDriveIcon className="h-5 w-5" />,
          'Google Drive',
          'Save presentations directly to your Drive',
          status.drive,
          handleConnectDrive
        )}
        <p className="text-xs text-muted-foreground pt-2">
          Your credentials are stored securely and only used for the specific features you enable.
        </p>
      </CardContent>
    </Card>
  );
};
