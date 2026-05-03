/**
 * IntegrationsSettings Component
 *
 * Manages Google Calendar and Drive connections with re-sync functionality.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Calendar,
  HardDrive,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Users,
  Building2,
  Clock,
  ExternalLink,
  Zap,
  Radio,
  AlertCircle
} from 'lucide-react';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import {
  connectCalendar,
  connectGoogleDrive,
  checkGoogleCalendarConnection,
  checkGoogleDriveConnection,
  describeGoogleOAuthError,
  getGoogleOAuthStatus,
} from '@/components/auth/GoogleAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';

interface ConnectionStatus {
  calendar: { connected: boolean; scopes: string[] };
  drive: { connected: boolean; scopes: string[] };
}

interface SyncStats {
  lastSynced: string | null;
  syncCount: number;
}

interface WatchStatus {
  hasActiveWatch: boolean;
  watch?: {
    channelId: string;
    calendarId: string;
    expiration: string;
    lastNotification: string | null;
    notificationCount: number;
  };
}

interface DeploymentGoogleStatus {
  configured: boolean;
  missing: string[];
  redirectUri?: string;
}

export function IntegrationsSettings() {
  const [userId, setUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionStatus>({
    calendar: { connected: false, scopes: [] },
    drive: { connected: false, scopes: [] }
  });
  const [syncStats, setSyncStats] = useState<SyncStats>({ lastSynced: null, syncCount: 0 });
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ hasActiveWatch: false });
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentGoogleStatus | null>(null);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  const [isCheckingConnections, setIsCheckingConnections] = useState(true);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    syncCalendar,
    isLoading: isSyncing,
    result: syncResult,
    error: syncError,
    progress,
    reset: resetSync
  } = useCalendarSync();

  const checkConnections = async () => {
    setIsCheckingConnections(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUserId(session.user.id);

      // Check connections in parallel
      const [calendarStatus, driveStatus] = await Promise.all([
        checkGoogleCalendarConnection(),
        checkGoogleDriveConnection()
      ]);

      setConnections({
        calendar: calendarStatus,
        drive: driveStatus
      });

      // Sync stats default (columns not yet in profiles table)
      setSyncStats({
        lastSynced: null,
        syncCount: 0
      });

      // Check watch status for real-time sync
      if (calendarStatus.connected) {
        try {
          const { data: watchData } = await supabase.functions.invoke('google-calendar-watch', {
            body: {}
          });
          if (watchData) {
            setWatchStatus(watchData);
          }
        } catch (e) {
          console.log('Watch status check failed (may not be deployed yet)');
        }
      }
    }

    setIsCheckingConnections(false);
  };

  // Check connections on mount
  useEffect(() => {
    checkConnections();
  }, []);

  useEffect(() => {
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

    checkDeploymentStatus();
  }, []);

  // Update stats after sync
  useEffect(() => {
    if (syncResult?.success) {
      setSyncStats(prev => ({
        lastSynced: new Date().toISOString(),
        syncCount: prev.syncCount + 1
      }));

      toast({
        title: 'Calendar synced',
        description: `Found ${syncResult.contactsCreated + syncResult.contactsMatched} contacts and ${syncResult.accountsCreated + syncResult.accountsMatched} companies.`
      });
    }
  }, [syncResult, toast]);

  // Show error toast
  useEffect(() => {
    if (syncError) {
      toast({
        title: 'Sync failed',
        description: syncError,
        variant: 'destructive'
      });
    }
  }, [syncError, toast]);

  useEffect(() => {
    const googleConnected = searchParams.get('google_connected');
    const googleError = searchParams.get('google_error');
    const googleMissing = searchParams.get('google_missing');
    const googleDetail = searchParams.get('google_detail');

    if (googleError) {
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
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('google_connected');
      newParams.delete('google_missing');
      newParams.delete('google_detail');
      newParams.delete('scopes');
      setSearchParams(newParams, { replace: true });
      checkConnections();

      toast({
        title: 'Google connected!',
        description: 'Your integration is now active.',
      });
    }
  }, [searchParams, setSearchParams, toast]);

  const handleConnectCalendar = async () => {
    if (!userId) return;
    try {
      await connectCalendar({ id: userId }, '/settings');
    } catch (connectError) {
      toast({
        title: 'Google connection failed',
        description: connectError instanceof Error ? connectError.message : 'Failed to start Google Calendar connection.',
        variant: 'destructive',
      });
    }
  };

  const handleConnectDrive = async () => {
    if (!userId) return;
    try {
      await connectGoogleDrive({ id: userId }, '/settings');
    } catch (connectError) {
      toast({
        title: 'Google connection failed',
        description: connectError instanceof Error ? connectError.message : 'Failed to start Google Drive connection.',
        variant: 'destructive',
      });
    }
  };

  const handleResync = async () => {
    resetSync();
    await syncCalendar({ daysBack: 30, completeOnboarding: false });
  };

  const handleToggleRealtimeSync = async (enabled: boolean) => {
    setIsTogglingWatch(true);
    try {
      if (enabled) {
        // Start watching
        const { data, error } = await supabase.functions.invoke('google-calendar-watch', {
          body: { action: 'start', calendarId: 'primary' }
        });

        if (error) throw error;

        if (data.success) {
          setWatchStatus({ hasActiveWatch: true, watch: data });
          toast({
            title: 'Real-time sync enabled',
            description: 'Calendar changes will now sync automatically to your CRM.'
          });
        } else {
          throw new Error(data.error || 'Failed to enable real-time sync');
        }
      } else {
        // Stop watching
        const { error } = await supabase.functions.invoke('google-calendar-watch', {
          body: { action: 'stop', channelId: watchStatus.watch?.channelId }
        });

        if (error) throw error;

        setWatchStatus({ hasActiveWatch: false });
        toast({
          title: 'Real-time sync disabled',
          description: 'Calendar changes will no longer sync automatically.'
        });
      }
    } catch (error) {
      console.error('Failed to toggle real-time sync:', error);
      toast({
        title: 'Failed to toggle real-time sync',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsTogglingWatch(false);
    }
  };

  const formatLastSynced = (date: string | null): string => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  if (isCheckingConnections) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {deploymentStatus && !deploymentStatus.configured && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Google integrations are not enabled for this deployment yet</AlertTitle>
          <AlertDescription>
            <p>
              An operator needs to add {deploymentStatus.missing.join(' and ')} to the environment and rerun `npm run setup`
              before end users can connect Google Calendar or Drive.
            </p>
            {deploymentStatus.redirectUri && (
              <p className="mt-2 break-all">
                Google redirect URI: {deploymentStatus.redirectUri}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Google Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Calendar</CardTitle>
                <CardDescription>
                  Import contacts and activities from your calendar
                </CardDescription>
              </div>
            </div>
            <Badge variant={connections.calendar.connected ? 'default' : 'secondary'}>
              {connections.calendar.connected ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Not connected</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connections.calendar.connected ? (
            <>
              {/* Sync Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Last synced</div>
                  <div className="font-medium">{formatLastSynced(syncStats.lastSynced)}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Total syncs</div>
                  <div className="font-medium">{syncStats.syncCount}</div>
                </div>
              </div>

              {/* Real-time Sync Toggle */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    {watchStatus.hasActiveWatch ? (
                      <Radio className="h-4 w-4 text-purple-600 animate-pulse" />
                    ) : (
                      <Zap className="h-4 w-4 text-purple-600" />
                    )}
                  </div>
                  <div>
                    <Label htmlFor="realtime-sync" className="font-medium cursor-pointer">
                      Real-time sync
                    </Label>
                    <p className="text-xs text-gray-500">
                      {watchStatus.hasActiveWatch
                        ? `Active - ${watchStatus.watch?.notificationCount || 0} updates received`
                        : 'Auto-sync calendar changes to CRM'}
                    </p>
                  </div>
                </div>
                <Switch
                  id="realtime-sync"
                  checked={watchStatus.hasActiveWatch}
                  onCheckedChange={handleToggleRealtimeSync}
                  disabled={isTogglingWatch}
                />
              </div>

              {/* Sync Progress */}
              {isSyncing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {progress.message}
                  </div>
                  <Progress value={
                    progress.stage === 'connecting' ? 20 :
                    progress.stage === 'fetching' ? 40 :
                    progress.stage === 'processing' ? 70 :
                    progress.stage === 'complete' ? 100 : 0
                  } />
                </div>
              )}

              {/* Sync Results */}
              {syncResult?.success && !isSyncing && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <Users className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-blue-600">
                      {syncResult.contactsCreated + syncResult.contactsMatched}
                    </div>
                    <div className="text-xs text-gray-600">Contacts</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <Building2 className="h-4 w-4 text-green-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-green-600">
                      {syncResult.accountsCreated + syncResult.accountsMatched}
                    </div>
                    <div className="text-xs text-gray-600">Companies</div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg text-center">
                    <Clock className="h-4 w-4 text-purple-600 mx-auto mb-1" />
                    <div className="text-lg font-bold text-purple-600">
                      {syncResult.activitiesCreated}
                    </div>
                    <div className="text-xs text-gray-600">Activities</div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  onClick={handleResync}
                  disabled={isSyncing}
                  className="flex-1"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isSyncing ? 'Syncing...' : 'Re-sync Calendar'}
                </Button>
              </div>

              <p className="text-xs text-gray-400">
                Syncing imports contacts from meeting attendees, creates companies from email domains,
                and logs your meetings as activities.
              </p>
            </>
          ) : (
            <Button
              onClick={handleConnectCalendar}
              className="w-full"
              disabled={Boolean(deploymentStatus && !deploymentStatus.configured)}
            >
              <Calendar className="h-4 w-4 mr-2" />
              {deploymentStatus && !deploymentStatus.configured ? 'Google setup required' : 'Connect Google Calendar'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Google Drive */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <HardDrive className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Drive</CardTitle>
                <CardDescription>
                  Export presentations from Slide Studio to Drive
                </CardDescription>
              </div>
            </div>
            <Badge variant={connections.drive.connected ? 'default' : 'secondary'}>
              {connections.drive.connected ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Not connected</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {connections.drive.connected ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 rounded-lg flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-medium text-green-800">Drive connected</div>
                  <div className="text-sm text-green-600">
                    Presentations from Slide Studio can be exported to your Drive
                  </div>
                </div>
              </div>
              <Button variant="outline" asChild>
                <a href="/slides" className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Go to Slide Studio
                </a>
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnectDrive}
              className="w-full"
              disabled={Boolean(deploymentStatus && !deploymentStatus.configured)}
            >
              <HardDrive className="h-4 w-4 mr-2" />
              {deploymentStatus && !deploymentStatus.configured ? 'Google setup required' : 'Connect Google Drive'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
