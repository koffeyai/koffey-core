/**
 * Unified Authentication Security Framework
 * Provides rate limiting, progressive delays, and secure error handling
 */

import { supabase } from '@/integrations/supabase/client';
import { logAuth, logError, logSecurity } from './logger';

interface AuthAttempt {
  identifier: string;
  timestamp: number;
  success: boolean;
  attemptType: 'login' | 'signup' | 'reset' | 'verify';
}

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
  progressiveDelay: boolean;
}

class AuthSecurityManager {
  private static readonly STORAGE_KEY = 'koffey_auth_security_state_v1';
  private static readonly MAX_PERSISTED_ATTEMPTS_PER_IDENTIFIER = 50;
  private attempts = new Map<string, AuthAttempt[]>();
  private blockedIdentifiers = new Map<string, number>();

  private rateLimits: Record<string, RateLimitConfig> = {
    login: {
      maxAttempts: 5,
      windowMs: 5 * 60 * 1000, // 5 minutes
      blockDurationMs: 15 * 60 * 1000, // 15 minutes
      progressiveDelay: true
    },
    signup: {
      maxAttempts: 3,
      windowMs: 5 * 60 * 1000, // 5 minutes
      blockDurationMs: 30 * 60 * 1000, // 30 minutes
      progressiveDelay: false
    },
    passwordReset: {
      maxAttempts: 2,
      windowMs: 10 * 60 * 1000, // 10 minutes
      blockDurationMs: 60 * 60 * 1000, // 1 hour
      progressiveDelay: false
    },
    emailVerification: {
      maxAttempts: 5,
      windowMs: 5 * 60 * 1000, // 5 minutes
      blockDurationMs: 10 * 60 * 1000, // 10 minutes
      progressiveDelay: true
    }
  };

  constructor() {
    this.loadPersistedState();
  }

  public isBlocked(identifier: string): boolean {
    const blockedUntil = this.blockedIdentifiers.get(identifier);
    if (!blockedUntil) return false;

    if (Date.now() > blockedUntil) {
      this.blockedIdentifiers.delete(identifier);
      this.persistState();
      return false;
    }

    return true;
  }

  public async checkRateLimit(
    identifier: string, 
    attemptType: string
  ): Promise<{ allowed: boolean; retryAfter?: number; reason?: string }> {
    
    if (this.isBlocked(identifier)) {
      const blockedUntil = this.blockedIdentifiers.get(identifier)!;
      return {
        allowed: false,
        retryAfter: blockedUntil - Date.now(),
        reason: 'temporarily_blocked'
      };
    }

    const config = this.rateLimits[attemptType];
    if (!config) {
      logSecurity('Unknown attempt type', { attemptType, identifier: this.sanitizeIdentifier(identifier) });
      return { allowed: true };
    }

    const recentAttempts = this.getRecentAttempts(identifier, attemptType, config.windowMs);
    
    if (recentAttempts.length >= config.maxAttempts) {
      this.blockedIdentifiers.set(identifier, Date.now() + config.blockDurationMs);
      this.persistState();
      
      logSecurity('Rate limit exceeded, blocking identifier', {
        identifier: this.sanitizeIdentifier(identifier),
        attemptType,
        attemptCount: recentAttempts.length,
        blockDuration: config.blockDurationMs
      });

      return {
        allowed: false,
        retryAfter: config.blockDurationMs,
        reason: 'rate_limit_exceeded'
      };
    }

    return { allowed: true };
  }

  public recordAttempt(
    identifier: string,
    attemptType: string,
    success: boolean
  ): void {
    const attempt: AuthAttempt = {
      identifier,
      timestamp: Date.now(),
      success,
      attemptType: attemptType as any
    };

    const attempts = this.attempts.get(identifier) || [];
    attempts.push(attempt);
    
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentAttempts = attempts.filter(a => a.timestamp > dayAgo);
    
    this.attempts.set(identifier, recentAttempts);
    this.persistState();

    logSecurity('Authentication attempt recorded', {
      identifier: this.sanitizeIdentifier(identifier),
      attemptType,
      success,
      recentFailureCount: recentAttempts.filter(a => !a.success).length
    });

    if (success) {
      this.blockedIdentifiers.delete(identifier);
      this.persistState();
    }
  }

  private getRecentAttempts(
    identifier: string, 
    attemptType: string, 
    windowMs: number
  ): AuthAttempt[] {
    const attempts = this.attempts.get(identifier) || [];
    const cutoff = Date.now() - windowMs;
    
    return attempts.filter(attempt => 
      attempt.timestamp > cutoff && 
      attempt.attemptType === attemptType &&
      !attempt.success
    );
  }

  public sanitizeIdentifier(identifier: string): string {
    if (identifier.includes('@')) {
      const [, domain] = identifier.split('@');
      return `[user]@${domain}`;
    }
    
    const parts = identifier.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
    
    return '[identifier]';
  }

  public async applyProgressiveDelay(identifier: string, attemptType: string): Promise<void> {
    const config = this.rateLimits[attemptType];
    if (!config?.progressiveDelay) return;

    const recentAttempts = this.getRecentAttempts(identifier, attemptType, config.windowMs);
    const failureCount = recentAttempts.length;

    if (failureCount > 0) {
      const delayMs = Math.min(Math.pow(2, failureCount) * 1000, 30000);
      
      logSecurity('Applying progressive delay', {
        identifier: this.sanitizeIdentifier(identifier),
        delayMs,
        failureCount
      });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  private loadPersistedState(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = localStorage.getItem(AuthSecurityManager.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        attempts?: Record<string, AuthAttempt[]>;
        blockedIdentifiers?: Record<string, number>;
      };

      const now = Date.now();
      const maxRetentionMs = 24 * 60 * 60 * 1000;

      if (parsed.attempts) {
        Object.entries(parsed.attempts).forEach(([identifier, attempts]) => {
          const filtered = (attempts || [])
            .filter((attempt) =>
              typeof attempt?.timestamp === 'number' &&
              now - attempt.timestamp <= maxRetentionMs
            )
            .slice(-AuthSecurityManager.MAX_PERSISTED_ATTEMPTS_PER_IDENTIFIER);
          if (filtered.length > 0) {
            this.attempts.set(identifier, filtered);
          }
        });
      }

      if (parsed.blockedIdentifiers) {
        Object.entries(parsed.blockedIdentifiers).forEach(([identifier, blockedUntil]) => {
          if (typeof blockedUntil === 'number' && blockedUntil > now) {
            this.blockedIdentifiers.set(identifier, blockedUntil);
          }
        });
      }
    } catch (error) {
      logError('Failed to load auth security persisted state', { error });
    }
  }

  private persistState(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const attemptsObject: Record<string, AuthAttempt[]> = {};
      this.attempts.forEach((attempts, identifier) => {
        attemptsObject[identifier] = attempts.slice(-AuthSecurityManager.MAX_PERSISTED_ATTEMPTS_PER_IDENTIFIER);
      });

      const blockedObject: Record<string, number> = {};
      this.blockedIdentifiers.forEach((blockedUntil, identifier) => {
        blockedObject[identifier] = blockedUntil;
      });

      localStorage.setItem(
        AuthSecurityManager.STORAGE_KEY,
        JSON.stringify({
          attempts: attemptsObject,
          blockedIdentifiers: blockedObject,
          persistedAt: Date.now()
        })
      );
    } catch (error) {
      logError('Failed to persist auth security state', { error });
    }
  }
}

export const authSecurity = new AuthSecurityManager();

export interface AuthResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  meta?: {
    timestamp: number;
    requestId: string;
  };
}

export const createAuthResponse = <T>(
  success: boolean,
  data?: T,
  errorCode?: string,
  userMessage?: string
): AuthResponse<T> => {
  const response: AuthResponse<T> = {
    success,
    meta: {
      timestamp: Date.now(),
      requestId: Math.random().toString(36).substr(2, 9)
    }
  };

  if (success && data !== undefined) {
    response.data = data;
  }

  if (!success) {
    response.error = {
      code: errorCode || 'AUTH_ERROR',
      message: userMessage || 'Authentication failed',
      details: import.meta.env.DEV ? 'Check server logs for details' : undefined
    };
  }

  return response;
};

export const sanitizeAuthError = (error: any): { code: string; message: string } => {
  const errorMap: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password',
    'User not found': 'Invalid email or password',
    'Email not confirmed': 'Please verify your email address',
    'Too many requests': 'Too many attempts. Please try again later',
    'Signup not allowed for this email domain': 'Signup is not available for your email domain',
    'WeakPasswordError': 'Password does not meet security requirements',
    'EmailRateLimitError': 'Too many email attempts. Please try again later'
  };

  const userMessage = errorMap[error.message] || 'Authentication failed';
  
  let errorCode = 'AUTH_ERROR';
  if (error.message?.includes('rate') || error.message?.includes('too many')) {
    errorCode = 'RATE_LIMITED';
  } else if (error.message?.includes('email') && error.message?.includes('confirm')) {
    errorCode = 'EMAIL_NOT_VERIFIED';
  } else if (error.message?.includes('password')) {
    errorCode = 'INVALID_CREDENTIALS';
  }

  return { code: errorCode, message: userMessage };
};
