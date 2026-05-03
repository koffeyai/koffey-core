import { useEffect, useRef, useState } from 'react';
import { logDebug, logError, logSecurity } from '@/lib/logger';

interface StrictModeState {
  isMounted: boolean;
  mountCount: number;
  isStrictMode: boolean;
}

export const useStrictModeCompatible = () => {
  const [state, setState] = useState<StrictModeState>({
    isMounted: true,
    mountCount: 0,
    isStrictMode: false
  });
  const mountedRef = useRef(true);
  const mountCountRef = useRef(0);

  useEffect(() => {
    mountCountRef.current += 1;
    const isStrictMode = mountCountRef.current > 1;
    
    setState({
      isMounted: true,
      mountCount: mountCountRef.current,
      isStrictMode
    });

    if (isStrictMode && process.env.NODE_ENV === 'development') {
      logSecurity('StrictMode detected - component mounted multiple times', {
        mountCount: mountCountRef.current
      });
    }

    return () => {
      mountedRef.current = false;
      setState(prev => ({ ...prev, isMounted: false }));
    };
  }, []);

  // Safe async operation wrapper
  const safeAsync = <T extends any[]>(
    asyncFn: (...args: T) => Promise<void>,
    errorMessage: string = 'Async operation failed'
  ) => {
    return async (...args: T) => {
      if (!mountedRef.current) {
        logDebug('Skipping async operation - component unmounted');
        return;
      }

      try {
        await asyncFn(...args);
      } catch (error) {
        if (mountedRef.current) {
          logError(errorMessage, error instanceof Error ? error : { error });
        }
      }
    };
  };

  return {
    ...state,
    isMounted: () => mountedRef.current,
    safeAsync
  };
};