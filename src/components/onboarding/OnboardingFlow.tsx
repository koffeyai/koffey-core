/**
 * OnboardingFlow Component
 *
 * The "magic moment" - connects Google Calendar and populates CRM automatically.
 * Shows real-time progress as contacts, accounts, and activities are created.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Calendar,
  Users,
  Building2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sparkles,
  Clock,
  AlertCircle,
  Settings2
} from 'lucide-react';
import { useCalendarSync, SyncResult, SyncOptions } from '@/hooks/useCalendarSync';
import { connectCalendar, checkGoogleCalendarConnection, describeGoogleOAuthError, getGoogleOAuthStatus } from '@/components/auth/GoogleAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OnboardingFlowProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

type OnboardingStep = 'welcome' | 'connecting' | 'syncing' | 'complete' | 'skipped';

interface DeploymentGoogleStatus {
  configured: boolean;
  missing: string[];
}

export function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentGoogleStatus | null>(null);
  const navigate = useNavigate();
  const { syncCalendar, isLoading, result, error, progress } = useCalendarSync();
  const { toast } = useToast();

  // Check if calendar is already connected (returning from OAuth)
  useEffect(() => {
    const checkConnection = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);

        // Check URL params for OAuth return
        const params = new URLSearchParams(window.location.search);
        const googleError = params.get('google_error');
        const googleMissing = params.get('google_missing');
        const googleDetail = params.get('google_detail');
        const googleConnected = params.get('google_connected');

        if (googleError) {
          window.history.replaceState({}, '', window.location.pathname);
          setStep('welcome');
          toast({
            title: 'Google connection failed',
            description: describeGoogleOAuthError(googleError, googleMissing, null, googleDetail),
            variant: 'destructive',
          });
          return;
        }

        if (googleConnected === 'true') {
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
          setCalendarConnected(true);
          setStep('syncing');
          // Auto-start sync with onboarding completion
          syncCalendar({ daysBack: 30, completeOnboarding: true });
          return;
        }

        // Check if already connected
        const { connected } = await checkGoogleCalendarConnection();
        if (connected) {
          setCalendarConnected(true);
        }

        const oauthStatus = await getGoogleOAuthStatus();
        if (oauthStatus) {
          setDeploymentStatus({
            configured: oauthStatus.configured,
            missing: oauthStatus.missing,
          });
        }
      }
    };

    checkConnection();
  }, [syncCalendar]);

  // Update step when sync completes
  useEffect(() => {
    if (result?.success) {
      setStep('complete');
    }
  }, [result]);

  const handleConnectCalendar = async () => {
    if (!userId) return;
    setStep('connecting');

    // Redirect to OAuth with return to this page
    const returnUrl = `${window.location.origin}/onboarding`;
    try {
      await connectCalendar({ id: userId }, returnUrl);
    } catch (connectError) {
      setStep('welcome');
      toast({
        title: 'Google connection failed',
        description: connectError instanceof Error ? connectError.message : 'Failed to start Google Calendar connection.',
        variant: 'destructive',
      });
    }
  };

  const handleStartSync = async () => {
    setStep('syncing');
    await syncCalendar({ daysBack: 30, completeOnboarding: true });
  };

  const handleComplete = () => {
    onComplete?.();
    navigate('/app');
  };

  const handleSkip = () => {
    setStep('skipped');
    onSkip?.();
    navigate('/app');
  };

  const getProgressPercent = (): number => {
    switch (progress.stage) {
      case 'idle': return 0;
      case 'connecting': return 20;
      case 'fetching': return 40;
      case 'processing': return 70;
      case 'complete': return 100;
      case 'error': return 0;
      default: return 0;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-lg">
        {/* Welcome Step */}
        {step === 'welcome' && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl">Let's populate your CRM</CardTitle>
              <CardDescription className="text-base mt-2">
                Connect your Google Calendar and we'll automatically import your contacts,
                companies, and meeting history. No data entry required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span className="text-sm">Create contacts from meeting attendees</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Building2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm">Match companies from email domains</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Clock className="h-5 w-5 text-purple-600" />
                  <span className="text-sm">Log activities from your calendar</span>
                </div>
              </div>

              <div className="space-y-3">
                {deploymentStatus && !deploymentStatus.configured && (
                  <Alert>
                    <Settings2 className="h-4 w-4" />
                    <AlertTitle>Google setup still needs to be finished</AlertTitle>
                    <AlertDescription>
                      An operator needs to add {deploymentStatus.missing.join(' and ')} to the deployment and rerun `npm run setup`
                      before users can connect Google Calendar here.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleConnectCalendar}
                  className="w-full h-12 text-base"
                  size="lg"
                  disabled={Boolean(deploymentStatus && !deploymentStatus.configured)}
                >
                  <Calendar className="h-5 w-5 mr-2" />
                  {deploymentStatus && !deploymentStatus.configured ? 'Google setup required' : 'Connect Google Calendar'}
                </Button>
                <Button
                  onClick={handleSkip}
                  variant="ghost"
                  className="w-full text-gray-500"
                >
                  Skip for now
                </Button>
              </div>

              <p className="text-xs text-center text-gray-400">
                We only read your calendar. Your data stays private.
              </p>
            </CardContent>
          </>
        )}

        {/* Connecting Step */}
        {step === 'connecting' && (
          <>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
              </div>
              <CardTitle>Connecting to Google...</CardTitle>
              <CardDescription>
                Please complete the authorization on the Google sign-in page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setStep('welcome')}
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </>
        )}

        {/* Syncing Step */}
        {step === 'syncing' && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                {error ? (
                  <div className="p-4 bg-red-100 rounded-full">
                    <AlertCircle className="h-10 w-10 text-red-600" />
                  </div>
                ) : (
                  <div className="p-4 bg-blue-100 rounded-full">
                    <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                  </div>
                )}
              </div>
              <CardTitle>
                {error ? 'Sync Failed' : 'Populating your CRM...'}
              </CardTitle>
              <CardDescription>
                {error || progress.message || 'This usually takes just a few seconds.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!error && (
                <>
                  <Progress value={getProgressPercent()} className="h-2" />

                  {result && (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {result.contactsCreated + result.contactsMatched}
                        </div>
                        <div className="text-xs text-gray-600">Contacts</div>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {result.accountsCreated + result.accountsMatched}
                        </div>
                        <div className="text-xs text-gray-600">Companies</div>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {result.activitiesCreated}
                        </div>
                        <div className="text-xs text-gray-600">Activities</div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="space-y-3">
                  <Button onClick={handleStartSync} className="w-full">
                    Try Again
                  </Button>
                  <Button onClick={handleSkip} variant="outline" className="w-full">
                    Skip for now
                  </Button>
                </div>
              )}
            </CardContent>
          </>
        )}

        {/* Complete Step */}
        {step === 'complete' && result && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-green-100 rounded-full">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <CardTitle>Your CRM is ready!</CardTitle>
              <CardDescription>
                We imported {result.eventsProcessed} meetings from your calendar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">
                    {result.contactsCreated + result.contactsMatched}
                  </div>
                  <div className="text-sm text-gray-600">Contacts</div>
                  {result.contactsCreated > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      +{result.contactsCreated} new
                    </div>
                  )}
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    {result.accountsCreated + result.accountsMatched}
                  </div>
                  <div className="text-sm text-gray-600">Companies</div>
                  {result.accountsCreated > 0 && (
                    <div className="text-xs text-green-600 mt-1">
                      +{result.accountsCreated} new
                    </div>
                  )}
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="text-3xl font-bold text-purple-600">
                    {result.activitiesCreated}
                  </div>
                  <div className="text-sm text-gray-600">Activities</div>
                </div>
              </div>

              {/* Show some contact previews */}
              {result.contacts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Recent contacts:</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {result.contacts.slice(0, 5).map((contact, i) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded"
                      >
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{contact.name}</span>
                        {contact.isNew && (
                          <span className="text-xs text-green-600 ml-auto">new</span>
                        )}
                      </div>
                    ))}
                    {result.contacts.length > 5 && (
                      <div className="text-xs text-gray-400 text-center py-1">
                        +{result.contacts.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button onClick={handleComplete} className="w-full h-12 text-base" size="lg">
                Go to Dashboard
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
