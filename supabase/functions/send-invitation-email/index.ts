import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface EmailRequest {
  email: string;
  organizationName: string;
  inviteCode: string;
  role: string;
  inviterName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { email, organizationName, inviteCode, role, inviterName }: EmailRequest = await req.json();

    // Get the proper app URL from environment, fallback to local development.
    const appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5173';
    const inviteUrl = `${appUrl}/invite?code=${inviteCode}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333; margin-bottom: 24px;">You're invited to join ${organizationName}</h1>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
          ${inviterName} has invited you to join <strong>${organizationName}</strong> on Koffey AI as a <strong>${role.replace('_', ' ')}</strong>.
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${inviteUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 32px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${inviteUrl}" style="color: #2563eb; word-break: break-all;">${inviteUrl}</a>
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          Sent by Koffey AI
        </p>
      </div>
    `;

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        organization_name: organizationName,
        invite_code: inviteCode,
        role: role,
        inviter_name: inviterName,
        invitation_type: 'organization_invite'
      },
      redirectTo: inviteUrl
    });

    if (error) {
      console.error('Error sending Supabase invitation:', error);
      throw error;
    }

    const emailResponse = { success: true, data };

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending invitation email:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
