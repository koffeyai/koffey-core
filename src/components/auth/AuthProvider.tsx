import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, safeSingle, checkRateLimit } from '@/lib/database';
import { logAuth, logError } from '@/lib/logger';
import { authSecurity, sanitizeAuthError } from '@/lib/authSecurity';
import type { User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { useInactivityTimeout } from '@/hooks/useInactivityTimeout';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string, fullName: string, firstName?: string, lastName?: string) => Promise<{ error?: any; needsVerification?: boolean; userExists?: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerReady, setProviderReady] = useState(false);
  const [authStateReady, setAuthStateReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const initTimeout: NodeJS.Timeout = setTimeout(() => {
      if (mounted && loading) {
        logAuth('Auth initialization timeout - proceeding without auth');
        setLoading(false);
        setAuthStateReady(true);
        setError('Authentication service is taking longer than expected');
      }
    }, 3000);

    try {
      const { search, pathname, origin } = window.location;
      const params = new URLSearchParams(search);
      const selfHandledRoutes = ['/auth/callback', '/set-password', '/forgot-password'];
      const shouldIntercept = !selfHandledRoutes.includes(pathname);
      if ((params.get('code') || params.get('access_token') || params.get('code_challenge')) && shouldIntercept) {
        window.location.replace(`${origin}/auth/callback${search}`);
        return () => {
          mounted = false;
          clearTimeout(initTimeout);
        };
      }
    } catch (redirectError) {
      logError('Failed auth callback redirect check', { redirectError });
    }
    
    logAuth('AuthProvider initializing');
    
    // Provider is ready immediately — context is available synchronously
    setProviderReady(true);
    
    // Get initial session with better error handling and debugging
    const initializeAuth = async () => {
      try {
        logAuth('🔍 Getting initial session', { timestamp: new Date().toISOString() });
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session fetch timeout')), 4000)
        );
        
        const { data: { session }, error } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any;
        
        if (error) {
          logError('❌ Auth initialization error', { errorCode: error.code });
          setError(`Authentication error: ${error.message}`);
        }
        
        if (mounted) {
          if (session) {
            const sessionDebug = {
              userId: session.user.id,
              email: session.user.email,
              expiresAt: new Date(session.expires_at! * 1000).toISOString(),
              expiresIn: `${session.expires_in}s`,
              tokenAge: `${Math.floor((session.expires_at! * 1000 - Date.now()) / 1000)}s remaining`,
            };
            logAuth('✅ Initial session loaded and active', sessionDebug);
          } else {
            logAuth('ℹ️ No active session found on initialization');
          }
          
          setUser(session?.user ?? null);
          setSession(session);

          if (session?.user) {
            setTimeout(() => {
              loadProfile(session.user.id);
            }, 100);
          }
          
          clearTimeout(initTimeout);
          setLoading(false);
          setAuthStateReady(true);
        }
      } catch (error: any) {
        logError('❌ Error during auth initialization', { 
          errorName: error.name,
          hasMessage: !!error.message 
        });
        if (mounted) {
          setError(`Failed to initialize: ${error.message}`);
          clearTimeout(initTimeout);
          setLoading(false);
          setAuthStateReady(true);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        try {

          setUser(session?.user ?? null);
          setSession(session);
          setError(null); // Clear any previous errors
          
          // Load profile in background, don't block auth state update
          if (session?.user) {
            setTimeout(() => {
              loadProfile(session.user.id);
            }, 100);
          } else {
            setProfile(null);
          }
          
          if (loading) {
            clearTimeout(initTimeout);
            setLoading(false);
            setAuthStateReady(true);
          }
        } catch (error: any) {
          logError('Error handling auth state change', { 
            errorName: error.name,
            hasMessage: !!error.message 
          });
          if (mounted) {
            setError(`Auth state error: ${error.message}`);
            if (loading) {
              clearTimeout(initTimeout);
              setLoading(false);
              setAuthStateReady(true);
            }
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      logAuth('Loading profile for user', { hasUserId: !!userId });
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId);

      const data = await safeSingle(query, { 
        timeout: 3000,
        errorMessage: 'Failed to load user profile',
        logContext: 'auth_profile_load'
      });

      logAuth('Profile loaded', { hasProfile: !!data });
      setProfile(data);
    } catch (error: any) {
      logError('Error loading profile', { 
        errorName: error.name,
        hasMessage: !!error.message 
      });
      // Don't set error state for profile loading failures
    }
  };

  const signUp = async (email: string, password: string, fullName: string, firstName?: string, lastName?: string) => {
    const identifier = email.toLowerCase();
    const redirectUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    try {
      // Check rate limiting with new security framework
      const rateLimitCheck = await authSecurity.checkRateLimit(identifier, 'signup');
      if (!rateLimitCheck.allowed) {
        return {
          error: { message: `Too many signup attempts. Try again in ${Math.ceil(rateLimitCheck.retryAfter! / 60000)} minutes` }
        };
      }

      // Apply progressive delay for repeated attempts
      await authSecurity.applyProgressiveDelay(identifier, 'signup');

      logAuth('Starting signup process', { 
        emailDomain: email.split('@')[1],
        hasFullName: !!fullName,
        hasFirstName: !!firstName,
        hasLastName: !!lastName
      });
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) {
        // Record failed attempt
        authSecurity.recordAttempt(identifier, 'signup', false);
        
        const sanitized = sanitizeAuthError(error);
        logAuth('Signup attempt failed', {
          emailDomain: email.split('@')[1],
          errorCode: sanitized.code
        });
        
        // Handle existing user scenarios
        if (error.message?.includes('User already registered') || 
            error.message?.includes('already registered') ||
            error.status === 422) {
          return { 
            error: null, 
            userExists: true, 
            needsVerification: true 
          };
        }
        
        return { error: { message: sanitized.message } };
      }

      // Record successful attempt
      authSecurity.recordAttempt(identifier, 'signup', true);
      
      logAuth('Signup successful', {
        emailDomain: email.split('@')[1],
        needsVerification: !data.user?.email_confirmed_at
      });

      return { 
        error: null, 
        needsVerification: !data.user?.email_confirmed_at,
        userExists: false
      };

    } catch (error: any) {
      authSecurity.recordAttempt(identifier, 'signup', false);
      logError('Signup process error', {
        emailDomain: email.split('@')[1],
        errorName: error.name
      });
      
      if (error.name === 'NetworkError' || !navigator.onLine) {
        return { 
          error: { message: 'Network error. Please check your connection and try again.' }
        };
      }
      
      return { error: { message: 'Signup failed. Please try again.' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    const identifier = email.toLowerCase();
    
    try {
      // Check rate limiting
      const rateLimitCheck = await authSecurity.checkRateLimit(identifier, 'login');
      if (!rateLimitCheck.allowed) {
        throw new Error(`Too many attempts. Try again in ${Math.ceil(rateLimitCheck.retryAfter! / 60000)} minutes`);
      }

      // Apply progressive delay for repeated attempts
      await authSecurity.applyProgressiveDelay(identifier, 'login');

      logAuth('Starting sign in', { 
        emailDomain: email.split('@')[1] 
      });

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Record failed attempt
        authSecurity.recordAttempt(identifier, 'login', false);
        
        const sanitized = sanitizeAuthError(error);
        logAuth('Sign in failed', {
          emailDomain: email.split('@')[1],
          errorCode: sanitized.code
        });
        
        throw new Error(sanitized.message);
      }

      // Record successful attempt
      authSecurity.recordAttempt(identifier, 'login', true);
      
      logAuth('Sign in successful', {
        emailDomain: email.split('@')[1]
      });

    } catch (error: any) {
      logError('Sign in error', { 
        emailDomain: email.split('@')[1],
        errorName: error.name 
      });
      throw error;
    }
  };

  const signOut = async () => {
    try {
      logAuth('Signing out user');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      logAuth('Sign out successful');
    } catch (error: any) {
      logError('Sign out error', { 
        errorName: error.name 
      });
      throw error;
    }
  };

  // Session inactivity timeout (45m idle, 3m warning)
  // Validates session server-side before logout to prevent false logouts
  const { toast } = useToast();
  useInactivityTimeout({
    isEnabled: !!user,
    timeoutMs: 45 * 60 * 1000, // 45 minutes - under 1hr JWT expiry
    warningMs: 3 * 60 * 1000,  // 3 minute warning
    onWarning: () => {
      logAuth('Inactivity warning triggered');
      toast({
        title: 'Session expiring soon',
        description: 'You will be signed out in 3 minutes due to inactivity.',
      });
    },
    onTimeout: async () => {
      logAuth('Inactivity timeout - signing out');
      try {
        await signOut();
      } finally {
        toast({
          title: 'Signed out due to inactivity',
          description: 'Please sign in again to continue.',
          variant: 'destructive',
        });
      }
    },
    onNetworkError: () => {
      toast({
        title: 'Connection issue',
        description: 'Unable to verify session. Please check your internet connection.',
      });
    },
  });

  const value = {
    user,
    session,
    profile,
    loading: loading || !authStateReady,
    error,
    signUp,
    signIn,
    signOut,
  };

  // Don't render children until provider and auth state are ready
  if (!providerReady || !authStateReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-muted rounded mb-4"></div>
            <div className="h-4 w-48 bg-muted rounded"></div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Initializing authentication...
          </p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
