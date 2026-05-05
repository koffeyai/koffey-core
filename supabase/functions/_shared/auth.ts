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

export interface OrganizationAccessResult {
  organizationId: string;
  role: string;
  membershipId: string;
  salesRole: string | null;
  salesRoleStatus: string | null;
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
 * Resolve the organization a user is allowed to operate against.
 *
 * If a specific organization is requested, the user must be an active member of
 * that organization. Without a requested organization, the first active
 * membership is used as the default context.
 */
export async function resolveAuthorizedOrganization(
  supabase: SupabaseClient,
  userId: string,
  requestedOrganizationId?: string | null
): Promise<OrganizationAccessResult | null> {
  const normalizedUserId = String(userId || '').trim();
  const normalizedOrganizationId = String(requestedOrganizationId || '').trim();

  if (!normalizedUserId) {
    throw new AuthError('Authenticated user required', 401);
  }

  let query = supabase
    .from('organization_members')
    .select('id, organization_id, role, sales_role, sales_role_status')
    .eq('user_id', normalizedUserId)
    .eq('is_active', true);

  if (normalizedOrganizationId) {
    query = query.eq('organization_id', normalizedOrganizationId);
  }

  const { data, error } = await query
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Organization access lookup failed:', error.message);
    throw new AuthError('Could not resolve organization access', 500);
  }

  if (!data?.organization_id) {
    if (normalizedOrganizationId) {
      throw new AuthError('You do not have access to this organization', 403);
    }
    return null;
  }

  return {
    organizationId: data.organization_id,
    role: data.role || 'member',
    membershipId: data.id,
    salesRole: data.sales_role || null,
    salesRoleStatus: data.sales_role_status || null,
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
