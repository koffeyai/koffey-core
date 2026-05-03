import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { loadPendingOrgSetup, clearPendingOrgSetup } from '@/lib/pendingOrgSetup';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // First, exchange the one-time code (if present) for a session
        const code = searchParams.get('code');
        if (code) {
          try {
            await supabase.auth.exchangeCodeForSession(code);
          } catch (ex) {
            logger.error('Failed to exchange code for session', { error: ex });
          }
        }

        // Then, check for an active session
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          logger.error('Auth callback getSession error', { error });
          navigate('/auth?error=callback_failed');
          return;
        }

        if (session) {
          // If this callback originated from an invite flow, redeem the invite
          const isInvited = searchParams.get('invited') === 'true';
          const inviteParam = searchParams.get('invite') || searchParams.get('code') || searchParams.get('inviteCode');

          if (isInvited && inviteParam) {
            try {
              const { data: inviteData, error: inviteError } = await supabase.functions.invoke('validate-invite', {
                body: {
                  inviteCode: inviteParam,
                  userId: session.user.id,
                  userEmail: session.user.email
                }
              });

              if (inviteError) {
                logger.error('Error redeeming invite (invoke error)', { error: inviteError });
              } else if (inviteData?.success) {
                // Send invited users to set password page before entering app
                const orgParam = encodeURIComponent(inviteData.organizationName || '');
                navigate(`/set-password?org=${orgParam}`);
                return;
              }
            } catch (err) {
              logger.error('Error redeeming invite (exception)', { error: err });
            }
          }

          // Check if user signed up with a pending org that was never created
          const pendingOrg = loadPendingOrgSetup();
          if (pendingOrg) {
            try {
              const { error: orgError } = await supabase.functions.invoke('create-org-with-user', {
                body: {
                  userId: session.user.id,
                  orgName: pendingOrg.orgName,
                  domain: pendingOrg.domain || session.user.email?.split('@')[1] || '',
                },
              });
              if (orgError) {
                logger.error('Failed to create pending org after email confirmation', { error: orgError });
              } else {
                logger.info('Created pending org after email confirmation', { orgName: pendingOrg.orgName });
              }
            } catch (err) {
              logger.error('Exception creating pending org after email confirmation', { error: err });
            } finally {
              clearPendingOrgSetup();
            }
          }

          // Default: go to app
          navigate('/app');
        } else {
          // No session, redirect to auth
          navigate('/auth');
        }
      } catch (error) {
        logger.error('Auth callback error (outer)', { error });
        navigate('/auth?error=callback_failed');
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold">Completing Sign In...</h2>
        <p className="text-gray-600 mt-2">Please wait while we verify your account</p>
      </div>
    </div>
  );
};

export default AuthCallback;