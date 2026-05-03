import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface InvitationRequest {
  email: string;
  role: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Initialize Supabase client with user auth for permission checks
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Initialize admin client for bypassing RLS on invitation creation
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, role, organizationId }: InvitationRequest = await req.json();

    // Validate input
    if (!email || !role || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, role, organizationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin of the organization
    const { data: membership } = await supabaseClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate invite code using RPC function
    const { data: inviteCode, error: codeError } = await supabaseClient
      .rpc('generate_invite_code');

    if (codeError || !inviteCode) {
      console.error('Error generating invite code:', codeError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate invite code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the invitation using admin client to bypass RLS
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('organization_invites')
      .insert({
        org_id: organizationId,
        email: email,
        role: role,
        invited_by: user.id,
        invite_code: inviteCode,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      return new Response(
        JSON.stringify({ error: 'Failed to create invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Invitation created successfully:', invitation);

    // Get organization and inviter details for email
    const { data: organization } = await supabaseClient
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const { data: inviterProfile } = await supabaseClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    // Send invitation email
    try {
      const { error: emailError } = await supabaseAdmin.functions.invoke('send-invitation-email', {
        body: {
          email: invitation.email,
          organizationName: organization?.name || 'Unknown Organization',
          inviteCode: invitation.invite_code,
          role: invitation.role,
          inviterName: inviterProfile?.full_name || inviterProfile?.email || 'Someone'
        }
      });

      if (emailError) {
        console.error('Error sending invitation email:', emailError);
        // Don't fail the whole request if email fails
      }
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Don't fail the whole request if email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          invite_code: invitation.invite_code,
          expires_at: invitation.expires_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in create-org-invitation function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);