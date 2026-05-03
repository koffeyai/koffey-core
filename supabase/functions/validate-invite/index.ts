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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { inviteCode, userId } = await req.json()
    
    console.log('Validating invite:', { inviteCode, hasUserId: Boolean(userId) })

    if (!inviteCode) {
      return new Response(JSON.stringify({ error: 'Invite code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate the invite code
    const { data: inviteValidation, error: validationError } = await supabase
      .rpc('validate_invite_code', { code: inviteCode })
      .single()

    if (validationError) {
      console.error('Validation error:', validationError)
      return new Response(JSON.stringify({ error: 'Failed to validate invite' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!inviteValidation?.is_valid) {
      return new Response(JSON.stringify({ 
        error: inviteValidation?.error_message || 'Invalid invitation'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // If userId is provided, treat this as a redemption request and require auth.
    if (userId) {
      const { user } = await authenticateRequest(req);
      const authenticatedUserId = user.id;
      const authenticatedEmail = String(user.email || '').trim().toLowerCase();
      console.log('Redeeming invite for authenticated user:', authenticatedUserId);

      // Confirm invite code belongs to this authenticated email.
      const inviteCodeHashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(inviteCode)
      );
      const inviteCodeHash = Array.from(new Uint8Array(inviteCodeHashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const { data: inviteRecord, error: inviteLookupError } = await supabase
        .from('organization_invites')
        .select('email')
        .or(`invite_code.eq.${inviteCode},invite_code_hash.eq.${inviteCodeHash}`)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (inviteLookupError || !inviteRecord) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invitation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const inviteEmail = String(inviteRecord.email || '').trim().toLowerCase();
      if (!authenticatedEmail || inviteEmail !== authenticatedEmail) {
        return new Response(JSON.stringify({ error: 'Invitation does not match authenticated user' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', inviteValidation.organization_id)
        .eq('user_id', authenticatedUserId)
        .maybeSingle()

      if (existingMember) {
        return new Response(JSON.stringify({ error: 'User is already a member of this organization' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Create organization membership
      const { error: membershipError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: inviteValidation.organization_id,
          user_id: authenticatedUserId,
          role: inviteValidation.role
        })

      if (membershipError) {
        console.error('Membership creation error:', membershipError)
        return new Response(JSON.stringify({ error: 'Failed to create membership' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Mark invite as used
      const { error: updateError } = await supabase
        .from('organization_invitations')
        .update({
          used_at: new Date().toISOString(),
          used_by: authenticatedUserId
        })
        .eq('invite_code', inviteCode)

      if (updateError) {
        console.error('Failed to mark invite as used:', updateError)
        // Don't fail the request since membership was created
      }

      return new Response(JSON.stringify({
        success: true,
        organizationId: inviteValidation.organization_id,
        organizationName: inviteValidation.organization_name,
        role: inviteValidation.role
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Just validation without redemption
    return new Response(JSON.stringify({
      valid: true,
      organizationName: inviteValidation.organization_name,
      role: inviteValidation.role,
      invitedBy: inviteValidation.invited_by_email
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
