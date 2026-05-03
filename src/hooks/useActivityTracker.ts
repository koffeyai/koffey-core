import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

export const useActivityTracker = () => {
  const { user, session } = useAuth();

  useEffect(() => {
    if (session && user) {
      // Log user activity when they first login/session established
      const logActivity = async () => {
        try {
          await supabase.rpc('log_user_activity', {
            p_user_id: user.id,
            p_activity_type: 'login',
            p_metadata: {
              session_id: session.access_token.substring(0, 10),
              user_agent: navigator.userAgent,
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          console.error('Error logging user activity:', error);
        }
      };

      logActivity();
    }
  }, [session, user]);

  const logCustomActivity = async (activityType: string, metadata: any = {}) => {
    if (!user) return;

    try {
      await supabase.rpc('log_user_activity', {
        p_user_id: user.id,
        p_activity_type: activityType,
        p_metadata: metadata
      });
    } catch (error) {
      console.error('Error logging custom activity:', error);
    }
  };

  return { logCustomActivity };
};