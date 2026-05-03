// supabase/functions/google-calendar/index.ts
// Fetches calendar events using google_tokens table
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CSEC = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
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

  // Use google_tokens as the canonical table
  const { data: row, error } = await supabase
    .from('google_tokens')
    .select('refresh_token, scopes')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500, 
      headers: { ...corsHeaders, 'content-type': 'application/json' } 
    });
  }
  
  if (!row?.refresh_token) {
    return new Response(JSON.stringify({ error: 'No Google account linked' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'content-type': 'application/json' } 
    });
  }

  // Check for calendar scope — accept both readonly and full access
  const hasCalendarScope = row.scopes?.includes('https://www.googleapis.com/auth/calendar.readonly')
    || row.scopes?.includes('https://www.googleapis.com/auth/calendar');
  if (!hasCalendarScope) {
    return new Response(JSON.stringify({ error: 'Calendar access not granted. Please reconnect with Calendar permissions.' }), { 
      status: 403, 
      headers: { ...corsHeaders, 'content-type': 'application/json' } 
    });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CID,
      client_secret: CSEC,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!tokenRes.ok) {
    return new Response(JSON.stringify({ error: 'Token refresh failed' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'content-type': 'application/json' } 
    });
  }
  
  const { access_token } = await tokenRes.json();

  // Use client-provided date range, default to current month ± 1 week padding
  const reqUrl = new URL(req.url);
  const now = new Date();
  const defaultMin = new Date(now.getFullYear(), now.getMonth(), 1);
  defaultMin.setDate(defaultMin.getDate() - 7);
  const defaultMax = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  defaultMax.setDate(defaultMax.getDate() + 7);

  const timeMin = reqUrl.searchParams.get('timeMin') || defaultMin.toISOString();
  const timeMax = reqUrl.searchParams.get('timeMax') || defaultMax.toISOString();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', '250');

  const g = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  const payload = await g.json();

  if (!g.ok) {
    const errorMsg = payload?.error?.message || `Google Calendar API error (${g.status})`;
    console.error('[google-calendar] Google API error:', g.status, errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: g.status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
});
