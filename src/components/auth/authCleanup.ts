import { supabase } from '@/integrations/supabase/client';
import { logAuth, logError } from '@/lib/logger';

export interface AuthDiagnostics {
  hasSession: boolean;
  userVerified: boolean;
  userId?: string;
  email?: string;
  lastSignIn?: string;
  createdAt?: string;
}

export const diagnoseAuthState = async (): Promise<AuthDiagnostics> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      logAuth('Error getting session', { error });
      return { hasSession: false, userVerified: false };
    }

    if (!session?.user) {
      return { hasSession: false, userVerified: false };
    }

    return {
      hasSession: true,
      userVerified: !!session.user.email_confirmed_at,
      userId: session.user.id,
      email: session.user.email,
      lastSignIn: session.user.last_sign_in_at,
      createdAt: session.user.created_at
    };
  } catch (error) {
    logError('Error diagnosing auth state', error as any);
    return { hasSession: false, userVerified: false };
  }
};

export const clearAuthSession = async () => {
  try {
    await supabase.auth.signOut();
    logAuth('Auth session cleared');
  } catch (error) {
    logError('Error clearing auth session', error as any);
  }
};

export const resendVerificationEmail = async (email: string) => {
  try {
    const redirectUrl = window.location.origin;
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    if (error) {
      if (error.message?.includes('too many requests') || error.message?.includes('rate limit')) {
        throw new Error('Please wait a moment before requesting another email.');
      }
      throw error;
    }

    return { success: true, data };
  } catch (error: any) {
    logError('Error resending verification email', error as any);
    throw error;
  }
};
