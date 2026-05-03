/**
 * Input validation and sanitization utilities for edge functions
 */
import { getCorsHeaders } from './cors.ts';

// Rate limiting store (in-memory for edge functions)
const rateLimitStore = new Map<string, { count: number; timestamp: number; blocked: boolean }>();

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Advanced input sanitization
 */
export function sanitizeInput(input: any, options: {
  maxLength?: number;
  allowedFields?: string[];
  requiredFields?: string[];
} = {}): any {
  const { maxLength = 50000, allowedFields, requiredFields = [] } = options;

  if (typeof input === 'string') {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframes
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/data:text\/html/gi, '') // Remove data URLs
      .substring(0, maxLength)
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item, options)).slice(0, 100); // Limit array size
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(input)) {
      // Skip dangerous keys
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        continue;
      }

      // Check allowed fields
      if (allowedFields && !allowedFields.includes(key)) {
        continue;
      }

      // Sanitize key and value
      const sanitizedKey = sanitizeInput(key, { maxLength: 100 });
      sanitized[sanitizedKey] = sanitizeInput(value, options);
    }

    return sanitized;
  }

  return input;
}

/**
 * Validate input structure and content
 */
export function validateInput(input: any, schema: {
  type: 'object' | 'string' | 'number' | 'array';
  required?: string[];
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: any[];
}): ValidationResult {
  const errors: string[] = [];

  // Type validation
  if (schema.type === 'object' && (typeof input !== 'object' || input === null)) {
    errors.push('Input must be an object');
    return { isValid: false, errors };
  }

  if (schema.type === 'string' && typeof input !== 'string') {
    errors.push('Input must be a string');
    return { isValid: false, errors };
  }

  if (schema.type === 'number' && typeof input !== 'number') {
    errors.push('Input must be a number');
    return { isValid: false, errors };
  }

  if (schema.type === 'array' && !Array.isArray(input)) {
    errors.push('Input must be an array');
    return { isValid: false, errors };
  }

  // String validations
  if (schema.type === 'string') {
    if (schema.maxLength && input.length > schema.maxLength) {
      errors.push(`String too long (max ${schema.maxLength})`);
    }
    if (schema.pattern && !schema.pattern.test(input)) {
      errors.push('String format invalid');
    }
    if (schema.allowedValues && !schema.allowedValues.includes(input)) {
      errors.push('Value not allowed');
    }
  }

  // Object validations
  if (schema.type === 'object' && schema.required) {
    for (const field of schema.required) {
      if (!(field in input) || input[field] === null || input[field] === undefined) {
        errors.push(`Required field missing: ${field}`);
      }
    }
  }

  // Array validations
  if (schema.type === 'array') {
    if (input.length > 1000) {
      errors.push('Array too large (max 1000 items)');
    }
  }

  const sanitizedData = sanitizeInput(input);

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData
  };
}

/**
 * Advanced rate limiting with progressive penalties
 */
export function checkRateLimit(
  key: string, 
  limits: {
    requests: number;
    windowMs: number;
    blockDurationMs?: number;
  }
): RateLimitResult {
  const now = Date.now();
  const { requests, windowMs, blockDurationMs = 300000 } = limits; // 5min default block

  const record = rateLimitStore.get(key);

  // Check if currently blocked
  if (record?.blocked && (now - record.timestamp) < blockDurationMs) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.timestamp + blockDurationMs
    };
  }

  // Reset or create record if window expired
  if (!record || (now - record.timestamp) > windowMs) {
    rateLimitStore.set(key, { count: 1, timestamp: now, blocked: false });
    return {
      allowed: true,
      remaining: requests - 1,
      resetTime: now + windowMs
    };
  }

  // Increment counter
  record.count++;

  // Check if limit exceeded
  if (record.count > requests) {
    record.blocked = true;
    record.timestamp = now; // Reset timer for block duration
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: now + blockDurationMs
    };
  }

  return {
    allowed: true,
    remaining: requests - record.count,
    resetTime: record.timestamp + windowMs
  };
}

/**
 * Validate organization access
 */
export async function validateOrganizationAccess(
  supabase: any,
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    return !error && !!data;
  } catch {
    return false;
  }
}

/**
 * Validate user has required org role (e.g., 'admin')
 * Returns the user's role string if access is granted, null otherwise.
 */
export async function validateUserRole(
  supabase: any,
  userId: string,
  organizationId: string,
  requiredRole: 'admin' | 'member'
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const roleHierarchy: Record<string, number> = { member: 1, admin: 2 };
    const userLevel = roleHierarchy[data.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel ? data.role : null;
  } catch {
    return null;
  }
}

/**
 * Validate user has one of the allowed sales roles.
 * Returns the user's sales_role if authorized, null otherwise.
 */
export async function validateSalesRole(
  supabase: any,
  userId: string,
  organizationId: string,
  allowedRoles: string[]
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, sales_role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    // Org admins bypass sales_role restrictions
    if (data.role === 'admin') return data.sales_role || 'admin';

    return allowedRoles.includes(data.sales_role) ? data.sales_role : null;
  } catch {
    return null;
  }
}

/**
 * Secure error response that doesn't leak sensitive info
 */
export function createSecureErrorResponse(
  error: any,
  userMessage: string = 'An error occurred',
  statusCode: number = 500,
  req?: Request
): Response {
  // Log full error for debugging (only visible in logs)
  console.error('Edge function error:', {
    message: error?.message,
    code: error?.code,
    timestamp: new Date().toISOString()
  });

  // Return sanitized error to user
  return new Response(
    JSON.stringify({
      success: false,
      error: userMessage,
      timestamp: Date.now()
    }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(req)
      }
    }
  );
}

/**
 * SQL injection prevention patterns
 */
export const DANGEROUS_PATTERNS = [
  /union\s+select/gi,
  /drop\s+table/gi,
  /delete\s+from/gi,
  /update\s+.*\s+set/gi,
  /insert\s+into/gi,
  /exec\s*\(/gi,
  /script\s*>/gi,
  /'.*--/gi,
  /;.*--/gi
];

/**
 * Check for SQL injection attempts
 */
export function detectSQLInjection(input: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
}
