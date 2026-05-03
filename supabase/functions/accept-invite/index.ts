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

    const { inviteId } = await req.json()

    console.log('Accepting invite:', { inviteId, userId: user.id })

    if (!inviteId || typeof inviteId !== 'string') {
      return new Response(JSON.stringify({ error: 'inviteId is required' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate invite
    const { data: invite, error } = await supabase
      .from('organization_invites')
      .select('*')
      .eq('id', inviteId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !invite) {
      console.error('Invalid invite:', error)
      return new Response('Invalid or expired invite', { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Valid invite found:', invite)

    // Ensure only the invited email can accept this invite.
    const normalizedInviteEmail = String(invite.email || '').trim().toLowerCase();
    const normalizedUserEmail = String(user.email || '').trim().toLowerCase();
    if (!normalizedUserEmail || normalizedInviteEmail !== normalizedUserEmail) {
      return new Response(JSON.stringify({ error: 'Invite does not match authenticated user email' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Idempotent behavior: if membership already exists, just mark invite accepted.
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', invite.org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingMember) {
      // Create membership
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: invite.org_id,
          user_id: user.id,
          role: invite.role
        })

      if (memberError) {
        console.error('Membership creation error:', memberError)
        throw memberError
      }
    }

    // Mark invite as accepted
    await supabase
      .from('organization_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inviteId)

    console.log('Invite accepted successfully')

    return new Response(JSON.stringify({ orgId: invite.org_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    if (error?.name === 'AuthError') {
      return createUnauthorizedResponse(error.message, req);
    }
    return createSecureErrorResponse(error, 'Internal server error', 500, req);
  }
})
