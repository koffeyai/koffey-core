import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logAuth } from '@/lib/logger';
import { markAppActivity, markAppHidden, markAppVisible } from '@/lib/appSessionFreshness';

interface InactivityOptions {
  isEnabled: boolean;
  timeoutMs?: number;
  warningMs?: number;
  onTimeout: () => void | Promise<void>;
  onWarning?: () => void;
  onNetworkError?: () => void;
}

// Checks if an error is a network error vs auth error
function isNetworkError(error: any): boolean {
  if (!navigator.onLine) return true;
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';
  
  return (
    name === 'networkerror' ||
    name === 'typeerror' || // fetch failures
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    error.status === 0 ||
    error.code === 'ECONNREFUSED'
  );
}

// Tracks user activity and triggers a timeout after inactivity
// Validates session with server before logout to prevent false logouts
export function useInactivityTimeout({
  isEnabled,
  timeoutMs = 45 * 60 * 1000, // 45 minutes default
  warningMs = 3 * 60 * 1000,  // 3 minute warning
  onTimeout,
  onWarning,
  onNetworkError,
}: InactivityOptions) {
  const warningTimerRef = useRef<number | null>(null);
  const timeoutTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isValidatingRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      window.clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    markAppActivity(lastActivityRef.current);
    clearTimers();

    // Schedule warning
    if (timeoutMs > warningMs) {
      warningTimerRef.current = window.setTimeout(() => {
        onWarning?.();
      }, timeoutMs - warningMs);
    }

    // Schedule timeout with session validation
    timeoutTimerRef.current = window.setTimeout(async () => {
      await validateAndTimeout();
    }, timeoutMs);
  }, [timeoutMs, warningMs, onWarning, clearTimers]);

  // Validates session before triggering timeout
  const validateAndTimeout = useCallback(async () => {
    if (isValidatingRef.current) return;
    isValidatingRef.current = true;

    try {
      // Check network first
      if (!navigator.onLine) {
        logAuth('Inactivity timeout skipped - offline');
        onNetworkError?.();
        isValidatingRef.current = false;
        return;
      }

      // Validate session with server
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        if (isNetworkError(error)) {
          logAuth('Inactivity timeout skipped - network error');
          onNetworkError?.();
          isValidatingRef.current = false;
          return;
        }
        // Real auth error - proceed with logout
        logAuth('Session validation failed - logging out', { errorCode: error.code });
        await onTimeout();
      } else if (!session) {
        // No session - already logged out
        logAuth('No active session found during timeout check');
        await onTimeout();
      } else {
        // Session is still valid - this shouldn't happen if timers are correct
        // but if it does, just reset timers
        logAuth('Session still valid during timeout - resetting timers');
        resetTimers();
      }
    } catch (err: any) {
      if (isNetworkError(err)) {
        logAuth('Inactivity timeout skipped - network exception');
        onNetworkError?.();
      } else {
        logAuth('Unexpected error during session validation');
        await onTimeout();
      }
    } finally {
      isValidatingRef.current = false;
    }
  }, [onTimeout, onNetworkError, resetTimers]);

  // Handles visibility change (tab switch/return)
  const handleVisibilityChange = useCallback(async () => {
    if (document.hidden) {
      markAppHidden();
      return;
    }
    if (isValidatingRef.current) return;
    markAppVisible();

    const inactiveFor = Date.now() - lastActivityRef.current;
    logAuth('Tab became visible', { inactiveForMs: inactiveFor, timeoutMs });

    if (inactiveFor >= timeoutMs) {
      isValidatingRef.current = true;

      try {
        // Check network first
        if (!navigator.onLine) {
          logAuth('Returning to tab while offline - deferring validation');
          onWarning?.();
          // Set up listener to validate when back online
          isValidatingRef.current = false;
          return;
        }

        // Validate session with server before deciding
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          if (isNetworkError(error)) {
            logAuth('Network error on tab return - showing warning');
            onNetworkError?.();
            onWarning?.();
            resetTimers();
          } else {
            logAuth('Auth error on tab return - logging out');
            await onTimeout();
          }
        } else if (!session) {
          logAuth('No session on tab return - logging out');
          await onTimeout();
        } else {
          // Session is still valid! Token was refreshed while away
          logAuth('Session still valid on tab return - continuing');
          onWarning?.(); // Gentle reminder
          resetTimers();
        }
      } catch (err: any) {
        if (isNetworkError(err)) {
          logAuth('Network exception on tab return');
          onNetworkError?.();
          onWarning?.();
          resetTimers();
        } else {
          await onTimeout();
        }
      } finally {
        isValidatingRef.current = false;
      }
    } else {
      // Not past timeout - resume timers with remaining time
      clearTimers();
      const remaining = timeoutMs - inactiveFor;
      const warnIn = Math.max(0, remaining - warningMs);

      if (remaining > warningMs) {
        warningTimerRef.current = window.setTimeout(() => onWarning?.(), warnIn);
      }
      timeoutTimerRef.current = window.setTimeout(async () => {
        await validateAndTimeout();
      }, remaining);
    }
  }, [timeoutMs, warningMs, onTimeout, onWarning, onNetworkError, clearTimers, resetTimers, validateAndTimeout]);

  useEffect(() => {
    if (!isEnabled) {
      clearTimers();
      return;
    }

    const handleActivity = () => {
      resetTimers();
    };

    // Activity events
    const events: (keyof DocumentEventMap | keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'wheel',
    ];

    events.forEach((evt) => 
      window.addEventListener(evt as any, handleActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initialize timers
    resetTimers();

    return () => {
      clearTimers();
      events.forEach((evt) => 
        window.removeEventListener(evt as any, handleActivity)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isEnabled, resetTimers, clearTimers, handleVisibilityChange]);
}
