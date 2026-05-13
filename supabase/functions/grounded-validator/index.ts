import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateRequest, AuthError, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

/**
 * Grounded Validator - Database searches to prevent hallucinations
 * 
 * SIMPLIFIED: Now accepts structured query plan from query-planner.
 * No more regex-based entity extraction - that's handled by the LLM.
 * 
 * SECURITY: 
 * - Requires authentication (JWT for external calls, SERVICE_ROLE_KEY for internal calls).
 * - Forwards X-User-Token to database-search for RLS enforcement.
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    let userId: string;
    let userToken: string | null = null;
    let requestBody: { 
      userMessage: string; 
      organizationId: string; 
      userId?: string; 
      // NEW: Accept structured query plan
      queryPlan?: {
        entityType: string;
        textQuery?: string;
        filters?: Record<string, any>;
        sortBy?: { field: string; direction: 'asc' | 'desc' };
        limit?: number;
        queryType?: string;
      };
      // Legacy fields for backward compatibility
      entityTypeHint?: string;
      valueFilters?: Array<{ field: string; operator: string; value: number; minValue?: number; maxValue?: number }>;
    };

    // ====== SECURITY: Extract user token for RLS forwarding ======
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (authHeader?.startsWith('Bearer ')) {
      // Check if this is a user JWT (not service role key)
      const token = authHeader.replace('Bearer ', '');
      if (token.startsWith('eyJ') && token !== serviceRoleKey) {
        userToken = token;
      }
    }
    
    // Also check for X-User-Token header (forwarded from upstream)
    const forwardedToken = req.headers.get('X-User-Token');
    if (forwardedToken && forwardedToken !== serviceRoleKey) {
      userToken = forwardedToken;
    }

    // ====== SECURITY: Check for secure internal call first ======
    if (isInternalServiceCall(req)) {
      requestBody = await req.json();
      userId = requestBody.userId!;
      
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'userId required for internal calls' }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      console.log('🔐 Secure internal call authenticated, userId:', userId);
    } else {
      try {
        const auth = await authenticateRequest(req);
        userId = auth.userId;
        // If we authenticated successfully, we should have a valid user token
        if (!userToken && authHeader) {
          userToken = authHeader.replace('Bearer ', '');
        }
      } catch (authError) {
        if (authError instanceof AuthError) {
          return new Response(
            JSON.stringify({ error: 'Authentication required', message: authError.message }),
            { status: authError.statusCode, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        throw authError;
      }
      requestBody = await req.json();
    }

    const { userMessage, organizationId, queryPlan, entityTypeHint, valueFilters } = requestBody;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use query plan if provided, otherwise fall back to legacy behavior
    const entityType = queryPlan?.entityType || entityTypeHint || 'all';
    const textQuery = queryPlan?.textQuery || userMessage;
    const isCountQuery = queryPlan?.queryType === 'count';
    const isListQuery = queryPlan?.queryType === 'list';
    
    console.log('🔍 GROUNDED VALIDATOR:', {
      entityType,
      textQuery: textQuery.substring(0, 50),
      hasQueryPlan: !!queryPlan,
      queryType: queryPlan?.queryType || 'search',
      hasUserToken: !!userToken
    });
    
    // Build headers for database-search call
    const searchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}` // Service key for internal auth
    };
    
    // Forward user token for RLS enforcement
    if (userToken) {
      searchHeaders['X-User-Token'] = userToken;
    }
    
    const response = await fetch(`${supabaseUrl}/functions/v1/database-search`, {
      method: 'POST',
      headers: searchHeaders,
      body: JSON.stringify({
        query: textQuery,
        entityType,
        organizationId,
        userId,
        includeCount: true,
        listAll: isListQuery,
        countOnly: isCountQuery,
        // Pass structured filters if available
        structuredFilters: queryPlan?.filters,
        sortBy: queryPlan?.sortBy,
        limit: queryPlan?.limit,
        // Legacy value filters
        valueFilters: valueFilters || []
      })
    });

    if (!response.ok) throw new Error(`Database search failed: ${response.status}`);
    const searchResults = await response.json();

    return new Response(
      JSON.stringify({ success: true, results: searchResults || [] }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('Grounded validator error:', error);
    return new Response(
      JSON.stringify({ success: false, results: [], error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
