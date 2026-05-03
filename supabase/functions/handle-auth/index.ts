import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.50.0"
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

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

    const { email, type, inviteCode } = await req.json() // type: 'signin' | 'signup', inviteCode: optional
    const domain = email.split('@')[1]
    
    console.log('Handle auth request:', { email, type, domain, hasInviteCode: !!inviteCode })
    
    // Check for existing user
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (type === 'signup' && existingUser) {
      return new Response(JSON.stringify({ error: 'User already exists' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if domain is a public email provider
    const { data: publicDomain } = await supabase
      .from('public_email_domains')
      .select('domain')
      .eq('domain', domain)
      .maybeSingle()

    const isPublicDomain = !!publicDomain
    
    console.log('Domain check:', { domain, isPublicDomain })
    
    // For signin - just authenticate (invite-only doesn't affect signin)
    if (type === 'signin') {
      return new Response(JSON.stringify({ 
        action: 'signin_allowed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // For signup - check invite code first
    if (inviteCode) {
      console.log('Validating invite code:', inviteCode)
      // Validate invite code
      const { data: inviteValidation } = await supabase
        .rpc('validate_invite_code', { code: inviteCode })
        .single()

      if (inviteValidation?.is_valid) {
        return new Response(JSON.stringify({ 
          action: 'invited_signup',
          message: `Looks like you've been invited for some koffey ☕`,
          orgName: inviteValidation.organization_name,
          role: inviteValidation.role,
          inviteCode: inviteCode
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } else {
        return new Response(JSON.stringify({ 
          error: inviteValidation?.error_message || 'Invalid invitation code'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // No invite code - check if domain has existing organization
    if (!isPublicDomain) {
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id, name, domain')
        .eq('domain', domain)
        .maybeSingle()

      if (existingOrg) {
        // Domain has organization - offer to join or create new
        return new Response(JSON.stringify({ 
          action: 'domain_discovery',
          message: `Looks like you may be part of an existing community, would you like to join or start your own?`,
          orgName: existingOrg.name,
          organizationId: existingOrg.id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // No invite, no existing domain org, or public domain - allow new org creation
    return new Response(JSON.stringify({ 
      action: 'create_org',
      message: `Welcome, let's energize your sales cycle ⚡`,
      isNewDomain: !isPublicDomain
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in handle-auth function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
