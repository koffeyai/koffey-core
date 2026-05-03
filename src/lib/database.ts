/**
 * Database utilities with safe query methods to prevent app crashes
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

export interface DatabaseQueryOptions {
  timeout?: number;
  fallbackValue?: any;
  shouldRetry?: boolean;
  retryAttempts?: number;
  errorMessage?: string;
  logContext?: string;
}

const DEFAULT_OPTIONS: Required<DatabaseQueryOptions> = {
  timeout: 5000,
  fallbackValue: null,
  shouldRetry: true,
  retryAttempts: 2,
  errorMessage: 'Query failed',
  logContext: 'database_query'
};

/**
 * Safe alternative to .single() that won't crash the app
 */
export async function safeSingle<T>(
  query: any,
  options: DatabaseQueryOptions = {}
): Promise<T | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  while (attempt <= opts.retryAttempts) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), opts.timeout)
      );

      const { data, error } = await Promise.race([
        query.maybeSingle(),
        timeoutPromise
      ]) as { data: T | null; error: any };

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      // Log successful query (without sensitive data)
      logger.info(`Query completed successfully`, {
        context: opts.logContext,
        hasResult: !!data,
        attempt: attempt + 1
      });

      return data || opts.fallbackValue;

    } catch (error: any) {
      attempt++;
      
      logger.error(`Query failed (attempt ${attempt}/${opts.retryAttempts + 1})`, {
        context: opts.logContext,
        error: error.message,
        willRetry: attempt <= opts.retryAttempts
      });

      if (attempt > opts.retryAttempts) {
        throw new Error(opts.errorMessage);
      }

      // Exponential backoff for retries
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  return opts.fallbackValue;
}

/**
 * Safe database query with retry logic
 */
export async function safeQuery<T>(
  queryFn: () => any,
  options: DatabaseQueryOptions = {}
): Promise<{ data: T[] | null; error: any }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.retryAttempts + 1; attempt++) {
    try {
      const query = queryFn();
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database query timeout')), opts.timeout)
      );

      const { data, error } = await Promise.race([
        query,
        timeoutPromise
      ]) as { data: T[] | null; error: any };

      if (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.code === 'PGRST116' || !opts.shouldRetry || attempt > opts.retryAttempts) {
          logger.warn('Database query failed', { 
            error: error.message,
            code: error.code,
            attempt,
            finalAttempt: true
          });
          return { data: opts.fallbackValue, error };
        }

        logger.warn('Database query failed, retrying', { 
          error: error.message,
          code: error.code,
          attempt,
          maxAttempts: opts.retryAttempts + 1
        });
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        continue;
      }

      if (attempt > 1) {
        logger.info('Database query succeeded after retry', { attempt });
      }

      return { data, error: null };
    } catch (err: any) {
      lastError = err;
      
      if (!opts.shouldRetry || attempt > opts.retryAttempts) {
        logger.error('Database query exception', err);
        return { data: opts.fallbackValue, error: err };
      }

      logger.warn('Database query exception, retrying', { 
        error: err.message,
        attempt,
        maxAttempts: opts.retryAttempts + 1
      });
      
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }

  return { data: opts.fallbackValue, error: lastError };
}

/**
 * Basic input sanitization for client-side
 */
function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Basic XSS and injection prevention
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Skip dangerous keys
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        continue;
      }
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Enhanced input validation and sanitization for client-side
 */
export function validateAndSanitizeInput(input: any, options: {
  maxLength?: number;
  allowedKeys?: string[];
  requiredKeys?: string[];
  type?: 'string' | 'object' | 'array' | 'number';
} = {}): { isValid: boolean; data: any; errors: string[] } {
  const { maxLength = 1000, allowedKeys, requiredKeys = [], type } = options;
  const errors: string[] = [];

  // Type validation
  if (type && typeof input !== type) {
    errors.push(`Expected ${type}, got ${typeof input}`);
    return { isValid: false, data: null, errors };
  }

  // Object validation
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    // Check required keys
    for (const key of requiredKeys) {
      if (!(key in input) || input[key] === null || input[key] === undefined) {
        errors.push(`Missing required field: ${key}`);
      }
    }

    // Sanitize and filter keys
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (allowedKeys && !allowedKeys.includes(key)) {
        continue; // Skip disallowed keys
      }

      sanitized[key] = sanitizeInput(value);
    }

    return { isValid: errors.length === 0, data: sanitized, errors };
  }

  // String validation
  if (typeof input === 'string') {
    if (input.length > maxLength) {
      errors.push(`Input too long (max ${maxLength} characters)`);
    }

    const sanitized = sanitizeInput(input);
    return { isValid: errors.length === 0, data: sanitized, errors };
  }

  return { isValid: true, data: sanitizeInput(input), errors };
}

/**
 * Rate limiting check (basic implementation)
 */
const rateLimitStore = new Map<string, { count: number; timestamp: number }>();

export function checkRateLimit(key: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || now - record.timestamp > windowMs) {
    rateLimitStore.set(key, { count: 1, timestamp: now });
    return true;
  }
  
  if (record.count >= maxRequests) {
    logger.warn('Rate limit exceeded', { key, count: record.count, maxRequests });
    return false;
  }
  
  record.count++;
  return true;
}

export { supabase };