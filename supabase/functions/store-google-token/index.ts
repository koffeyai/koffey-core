// supabase/functions/store-google-token/index.ts
// Stores Google OAuth tokens in google_tokens table
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'content-type': 'application/json' } 
      });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!membership?.organization_id) {
      return new Response(JSON.stringify({ error: 'No active organization membership' }), {
        status: 403,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      });
    }

    const { refresh_token, scopes } = await req.json();
    if (!refresh_token) {
      return new Response(JSON.stringify({ error: 'Missing refresh_token' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'content-type': 'application/json' } 
      });
    }

    // Use google_tokens as the canonical table
    const { error } = await supabase
      .from('google_tokens')
      .upsert({
        user_id: user.id,
        refresh_token,
        scopes: Array.isArray(scopes) ? scopes : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'content-type': 'application/json' } 
      });
    }
    
    return new Response(JSON.stringify({ ok: true }), { 
      headers: { ...corsHeaders, 'content-type': 'application/json' } 
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Bad Request' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'content-type': 'application/json' } 
    });
  }
});
