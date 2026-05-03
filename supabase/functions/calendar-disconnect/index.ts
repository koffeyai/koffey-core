import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateRequest, createUnauthorizedResponse, getServiceRoleClient } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { refreshAccessToken } from '../_shared/google-auth.ts';

let corsHeaders = getCorsHeaders();

async function stopGoogleWatch(accessToken: string, channelId: string, resourceId: string | null) {
  if (!resourceId) return;

  const response = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: channelId,
      resourceId,
    }),
  });

  if (!response.ok && response.status !== 404) {
    console.warn('[calendar-disconnect] failed to stop watch:', await response.text());
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }
  corsHeaders = getCorsHeaders(req);

  try {
    const { user } = await authenticateRequest(req);
    const supabase = getServiceRoleClient();

    const { data: tokenRow } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', user.id)
      .maybeSingle();

    let accessToken: string | null = null;
    if (tokenRow?.refresh_token) {
      accessToken = await refreshAccessToken(tokenRow.refresh_token);
    }

    const { data: watches } = await supabase
      .from('calendar_watch_channels')
      .select('channel_id, resource_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (accessToken && watches?.length) {
      for (const watch of watches) {
        await stopGoogleWatch(accessToken, watch.channel_id, watch.resource_id);
      }
    }

    await supabase
      .from('calendar_watch_channels')
      .update({ status: 'stopped', error_message: null })
      .eq('user_id', user.id);

    await supabase
      .from('calendar_tokens')
      .delete()
      .eq('user_id', user.id);

    if (tokenRow) {
      const remainingScopes = (tokenRow.scopes || []).filter((scope) => {
        const normalized = String(scope || '').toLowerCase();
        return !normalized.includes('/auth/calendar');
      });

      if (remainingScopes.length === 0) {
        await supabase
          .from('google_tokens')
          .delete()
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('google_tokens')
          .update({
            scopes: remainingScopes,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      disconnected: 'calendar'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error?.name === 'AuthError') {
      return createUnauthorizedResponse(error.message, req);
    }

    console.error('[calendar-disconnect] handler error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to disconnect Google Calendar'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(handler);
