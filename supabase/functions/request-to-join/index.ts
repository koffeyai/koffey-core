import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.50.0"
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { authenticateRequest, createUnauthorizedResponse } from '../_shared/auth.ts';
import { createSecureErrorResponse } from '../_shared/security.ts';

let corsHeaders = getCorsHeaders();

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }
  corsHeaders = getCorsHeaders(req);

  try {
    const { user } = await authenticateRequest(req);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { 
      organizationId, 
      userName, 
      requestedRole = 'member',
      message,
      ipAddress,
      userAgent 
    } = await req.json()

    const userEmail = String(user.email || '').trim().toLowerCase();
    
    console.log('Join request:', { organizationId, userEmail, requestedRole })

    if (!organizationId || !userEmail) {
      return new Response(JSON.stringify({ error: 'Organization ID and email are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const domain = userEmail.split('@')[1]

    // Prevent duplicate join request if user is already an active member.
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existingMember) {
      return new Response(JSON.stringify({ error: 'User is already a member of this organization' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if organization exists
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single()

    if (!organization) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check rate limiting - max 5 attempts per email per organization
    const { data: existingRequest } = await supabase
      .from('organization_join_requests')
      .select('attempts_count, created_at')
      .eq('organization_id', organizationId)
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingRequest) {
      // Check if last request was within 24 hours and at max attempts
      const lastRequestTime = new Date(existingRequest.created_at)
      const now = new Date()
      const hoursSinceLastRequest = (now.getTime() - lastRequestTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastRequest < 24 && existingRequest.attempts_count >= 5) {
        return new Response(JSON.stringify({ 
          error: 'Too many join requests. Please wait 24 hours before trying again.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Create or update join request
    const { data: joinRequest, error: insertError } = await supabase
      .from('organization_join_requests')
      .upsert({
        organization_id: organizationId,
        user_email: userEmail,
        user_domain: domain,
        user_name: userName || user.user_metadata?.full_name || user.user_metadata?.name || null,
        requested_role: requestedRole,
        message: message,
        ip_address: ipAddress,
        user_agent: userAgent,
        attempts_count: existingRequest ? existingRequest.attempts_count + 1 : 1,
        status: 'pending',
        metadata: {
          requested_at: new Date().toISOString(),
          source: 'domain_discovery'
        }
      }, {
        onConflict: 'organization_id,user_email'
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create join request:', insertError)
      return new Response(JSON.stringify({ error: 'Failed to submit join request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get organization admins for notification (implement notification logic later)
    const { data: admins } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .in('role', ['admin', 'owner'])
      .eq('is_active', true)

    console.log(`Join request created for ${userEmail} to ${organization.name}. Admins to notify:`, admins?.length)

    return new Response(JSON.stringify({
      success: true,
      message: 'Your request to join has been sent to the organization administrators.',
      requestId: joinRequest.id,
      organizationName: organization.name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    if (error?.name === 'AuthError') {
      return createUnauthorizedResponse(error.message, req);
    }
    return createSecureErrorResponse(error, 'Internal server error', 500, req);
  }
})
