import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface RetryState {
  attempt: number;
  isRetrying: boolean;
  maxAttempts: number;
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
  showProgress?: boolean;
}

export const useEnhancedRetry = (options: RetryOptions = {}) => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    jitter = true,
    showProgress = true
  } = options;

  const [retryState, setRetryState] = useState<RetryState>({
    attempt: 0,
    isRetrying: false,
    maxAttempts
  });

  const getRetryMessage = (attempt: number, maxAttempts: number): string => {
    if (attempt === 1) return "Optimizing connection...";
    if (attempt === 2) return "Almost there...";
    if (attempt === maxAttempts) return "Securing best route...";
    return "Retrying...";
  };

  const calculateDelay = (attempt: number): number => {
    let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    if (jitter) {
      delay += Math.random() * 1000;
    }
    
    return delay;
  };

  const retryWithBackoff = useCallback(async <T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> => {
    setRetryState(prev => ({ ...prev, isRetrying: true, attempt: 0 }));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        setRetryState(prev => ({ ...prev, attempt: attempt + 1 }));

        if (showProgress && attempt > 0) {
          const message = getRetryMessage(attempt, maxAttempts);
          console.log(`Retry ${attempt}/${maxAttempts}: ${message}`);
        }

        const result = await operation();
        
        setRetryState(prev => ({ ...prev, isRetrying: false, attempt: 0 }));
        return result;
        
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          setRetryState(prev => ({ ...prev, isRetrying: false, attempt: 0 }));
          throw error;
        }

        const delay = calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    setRetryState(prev => ({ ...prev, isRetrying: false, attempt: 0 }));
    throw new Error('Max retry attempts exceeded');
  }, [maxAttempts, baseDelay, maxDelay, jitter, showProgress]);

  const retryWithUserFeedback = useCallback(async <T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> => {
    try {
      return await retryWithBackoff(operation, context);
    } catch (error: any) {
      // Enhanced error messaging
      const isRateLimit = error.message?.includes('rate') || error.message?.includes('too many');
      
      if (isRateLimit) {
        toast({
          title: "You're moving fast!",
          description: "Let's optimize this workflow. Consider using bulk operations for better performance.",
          variant: "default"
        });
      } else {
        toast({
          title: "Connection Issue",
          description: "We're working to get you back on track. Please try again in a moment.",
          variant: "destructive"
        });
      }
      
      throw error;
    }
  }, [retryWithBackoff]);

  return {
    retryWithBackoff,
    retryWithUserFeedback,
    retryState,
    isRetrying: retryState.isRetrying
  };
};

// RetryIndicator component moved to src/components/ui/rate-limit-indicator.tsx