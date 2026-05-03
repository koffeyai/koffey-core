/**
 * Shared Authentication Utilities for Edge Functions
 * 
 * SECURITY: This module provides JWT authentication for all protected edge functions.
 * It validates the user's session token and returns the authenticated user.
 */

import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders } from './cors.ts';

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthResult {
  user: User;
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Authenticate a request using JWT from Authorization header.
 * 
 * SECURITY NOTES:
 * - Uses ANON KEY (not service role) to validate the user's JWT
 * - Extracts user ID from the validated JWT, never trusts request body
 * - Throws AuthError with 401 if authentication fails
 * 
 * @param req - The incoming request
 * @returns Authenticated user and Supabase client
 * @throws AuthError if authentication fails
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 401);
  }

  // Validate header format
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError('Invalid Authorization header format', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    throw new AuthError('Server configuration error', 500);
  }

  // Create Supabase client with the user's JWT
  // SECURITY: Using anon key, not service role, to validate the token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  // Validate the JWT and get the user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    console.error('Auth validation failed:', error?.message || 'No user found');
    throw new AuthError('Invalid or expired token', 401);
  }

  console.log(`✅ Authenticated user: ${user.id}`);

  return {
    user,
    supabase,
    userId: user.id
  };
}

/**
 * Create an unauthorized response with proper CORS headers.
 */
export function createUnauthorizedResponse(message: string = 'Unauthorized', req?: Request): Response {
  return new Response(
    JSON.stringify({
      error: 'Authentication required',
      message
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(req)
      }
    }
  );
}

/**
 * Get a service role client for operations that require elevated privileges.
 * 
 * SECURITY: Only use this for operations that truly need admin access,
 * like updating system tables or cross-user operations.
 */
export function getServiceRoleClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Check if request is from an internal service using SERVICE_ROLE_KEY.
 * 
 * SECURITY: This is secure because only edge functions have access to SUPABASE_SERVICE_ROLE_KEY.
 * External attackers cannot forge this header without the secret.
 * 
 * @param req - The incoming request
 * @returns true if the request is authenticated as an internal service call
 */
export function isInternalServiceCall(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!authHeader || !serviceKey) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  // The caller must use the service role key as Bearer token.
  return match[1] === serviceKey;
}
