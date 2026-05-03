/**
 * Authentication cleanup hook to prevent memory leaks and race conditions
 */
import { useEffect, useRef } from 'react';
import { logAuth } from '@/lib/logger';

export const useAuthCleanup = () => {
  const mountedRef = useRef(true);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const subscriptionsRef = useRef<any[]>([]);

  // Safe async operation wrapper
  const safeAsync = <T extends any[]>(
    asyncFn: (...args: T) => Promise<void>,
    errorMessage: string = 'Async operation failed'
  ) => {
    return async (...args: T) => {
      if (!mountedRef.current) {
        logAuth('Skipping async operation - component unmounted');
        return;
      }

      try {
        await asyncFn(...args);
      } catch (error) {
        if (mountedRef.current) {
          logAuth(errorMessage, { error });
        }
      }
    };
  };

  // Safe timeout wrapper
  const safeTimeout = (callback: () => void, delay: number): NodeJS.Timeout => {
    const timeout = setTimeout(() => {
      if (mountedRef.current) {
        callback();
      }
    }, delay);

    timeoutsRef.current.push(timeout);
    return timeout;
  };

  // Subscription tracker
  const trackSubscription = (subscription: any) => {
    subscriptionsRef.current.push(subscription);
    return subscription;
  };

  // Cleanup function
  const cleanup = () => {
    mountedRef.current = false;
    
    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current = [];

    // Unsubscribe from all subscriptions
    subscriptionsRef.current.forEach(subscription => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    });
    subscriptionsRef.current = [];

    logAuth('Auth cleanup completed');
  };

  useEffect(() => {
    return cleanup;
  }, []);

  return {
    isMounted: () => mountedRef.current,
    safeAsync,
    safeTimeout,
    trackSubscription,
    cleanup
  };
};