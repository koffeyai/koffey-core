/**
 * Google Calendar Watch Management
 *
 * Creates, renews, and stops watch channels for Google Calendar push notifications.
 * Watches expire after 7 days max, so we need to renew them periodically.
 *
 * Endpoints:
 * - POST /start: Create a new watch channel
 * - POST /stop: Stop an existing watch channel
 * - POST /renew: Renew expiring watch channels (called by cron)
 * - GET /status: Get watch status for current user
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { refreshAccessToken } from '../_shared/google-auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Your Supabase function URL for the webhook
const WEBHOOK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-webhook`;

// Watch duration: 6 days (Google max is 7 days, we renew early)
const WATCH_DURATION_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * Generate a unique channel ID
 */
function generateChannelId(): string {
  return `koffey-cal-${crypto.randomUUID()}`;
}

async function resolveOrganizationIdForUser(userId: string): Promise<string | null> {
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return membership?.organization_id || null;
}

/**
 * Create a new watch channel for a user's calendar
 */
async function createWatch(
  userId: string,
  calendarId: string = 'primary',
  organizationId?: string | null
): Promise<{ success: boolean; channelId?: string; error?: string }> {
  console.log(`[watch] Creating watch for user ${userId}, calendar ${calendarId}`);

  const resolvedOrganizationId = organizationId || await resolveOrganizationIdForUser(userId);
  if (!resolvedOrganizationId) {
    return { success: false, error: 'No active organization found for user' };
  }

  // Get user's Google tokens
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('refresh_token, scopes')
    .eq('user_id', userId)
    .single();

  if (!tokenRow?.refresh_token) {
    return { success: false, error: 'No Google account linked' };
  }

  // Check for calendar scope
  const hasCalendarScope = tokenRow.scopes?.some((s: string) => s.includes('calendar'));
  if (!hasCalendarScope) {
    return { success: false, error: 'Calendar access not granted' };
  }

  // Get fresh access token
  const accessToken = await refreshAccessToken(tokenRow.refresh_token);
  if (!accessToken) {
    return { success: false, error: 'Failed to refresh access token' };
  }

  // Check if there's already an active watch
  const { data: existingWatch } = await supabase
    .from('calendar_watch_channels')
    .select('id, channel_id, expiration')
    .eq('user_id', userId)
    .eq('calendar_id', calendarId)
    .eq('status', 'active')
    .maybeSingle();

  if (existingWatch) {
    const expiration = new Date(existingWatch.expiration);
    const hoursUntilExpiry = (expiration.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilExpiry > 24) {
      console.log(`[watch] Active watch exists with ${hoursUntilExpiry.toFixed(1)}h remaining`);
      return { success: true, channelId: existingWatch.channel_id };
    }

    // Stop the old watch before creating a new one
    await stopWatch(existingWatch.channel_id, accessToken, calendarId);
  }

  // Generate new channel ID
  const channelId = generateChannelId();
  const expiration = new Date(Date.now() + WATCH_DURATION_MS);

  // Create watch channel with Google
  const watchResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: WEBHOOK_URL,
        expiration: expiration.getTime().toString()
      })
    }
  );

  if (!watchResponse.ok) {
    const error = await watchResponse.text();
    console.error('[watch] Failed to create watch:', error);
    return { success: false, error: `Google API error: ${error}` };
  }

  const watchData = await watchResponse.json();
  console.log('[watch] Watch created:', watchData);

  // Store watch channel in database
  const { error: dbError } = await supabase
    .from('calendar_watch_channels')
    .upsert({
      user_id: userId,
      organization_id: resolvedOrganizationId,
      channel_id: channelId,
      resource_id: watchData.resourceId,
      calendar_id: calendarId,
      expiration: new Date(parseInt(watchData.expiration)).toISOString(),
      status: 'active',
      error_message: null
    }, {
      onConflict: 'user_id,calendar_id'
    });

  if (dbError) {
    console.error('[watch] Failed to store watch channel:', dbError);
    // Try to stop the watch since we couldn't store it
    await stopWatch(channelId, accessToken, calendarId);
    return { success: false, error: 'Failed to store watch channel' };
  }

  return { success: true, channelId };
}

/**
 * Stop a watch channel
 */
async function stopWatch(
  channelId: string,
  accessToken: string,
  resourceId?: string
): Promise<boolean> {
  console.log(`[watch] Stopping watch ${channelId}`);

  // Get resource ID if not provided
  if (!resourceId) {
    const { data: channel } = await supabase
      .from('calendar_watch_channels')
      .select('resource_id')
      .eq('channel_id', channelId)
      .single();

    resourceId = channel?.resource_id;
  }

  if (!resourceId) {
    console.log('[watch] No resource ID, marking as stopped');
    await supabase
      .from('calendar_watch_channels')
      .update({ status: 'stopped' })
      .eq('channel_id', channelId);
    return true;
  }

  // Stop the watch with Google
  const stopResponse = await fetch(
    'https://www.googleapis.com/calendar/v3/channels/stop',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: channelId,
        resourceId: resourceId
      })
    }
  );

  // 404 is OK - means the watch already expired
  if (!stopResponse.ok && stopResponse.status !== 404) {
    console.error('[watch] Failed to stop watch:', await stopResponse.text());
  }

  // Update database
  await supabase
    .from('calendar_watch_channels')
    .update({ status: 'stopped' })
    .eq('channel_id', channelId);

  return true;
}

/**
 * Renew expiring watch channels (called by cron)
 */
async function renewExpiringWatches(): Promise<{ renewed: number; failed: number }> {
  console.log('[watch] Checking for expiring watches...');

  // Find watches expiring in the next 24 hours
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { data: expiringWatches } = await supabase
    .from('calendar_watch_channels')
    .select('*')
    .eq('status', 'active')
    .lt('expiration', cutoff.toISOString());

  if (!expiringWatches?.length) {
    console.log('[watch] No watches need renewal');
    return { renewed: 0, failed: 0 };
  }

  console.log(`[watch] Found ${expiringWatches.length} watches to renew`);

  let renewed = 0;
  let failed = 0;

  for (const watch of expiringWatches) {
    try {
      const result = await createWatch(watch.user_id, watch.calendar_id, watch.organization_id);
      if (result.success) {
        renewed++;
      } else {
        failed++;
        console.error(`[watch] Failed to renew for user ${watch.user_id}:`, result.error);
      }
    } catch (error) {
      failed++;
      console.error(`[watch] Error renewing for user ${watch.user_id}:`, error);
    }
  }

  return { renewed, failed };
}

/**
 * Get watch status for a user
 */
async function getWatchStatus(userId: string): Promise<{
  hasActiveWatch: boolean;
  watch?: {
    channelId: string;
    calendarId: string;
    expiration: string;
    lastNotification: string | null;
    notificationCount: number;
  };
}> {
  const { data: watch } = await supabase
    .from('calendar_watch_channels')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!watch) {
    return { hasActiveWatch: false };
  }

  return {
    hasActiveWatch: true,
    watch: {
      channelId: watch.channel_id,
      calendarId: watch.calendar_id,
      expiration: watch.expiration,
      lastNotification: watch.last_notification_at,
      notificationCount: watch.notification_count || 0
    }
  };
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  const body = req.method === 'GET' || req.method === 'HEAD'
    ? {}
    : await req.clone().json().catch(() => ({}));
  const action = url.searchParams.get('action') || body.action || 'status';

  try {
    // For renewal, can be called by cron without auth
    if (action === 'renew') {
      // Check for service role key for cron calls
      const authHeader = req.headers.get('authorization');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (authHeader !== `Bearer ${serviceKey}`) {
        // Not a cron call, need user auth
        const jwt = (authHeader || '').replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
        if (authError || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const result = await renewExpiringWatches();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // All other actions need user auth
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const organizationId = await resolveOrganizationIdForUser(user.id);
    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'No active organization membership' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    switch (action) {
      case 'start': {
        const calendarId = body.calendarId || 'primary';
        const result = await createWatch(user.id, calendarId, organizationId);
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'stop': {
        // Get user's token for stopping
        const { data: tokenRow } = await supabase
          .from('google_tokens')
          .select('refresh_token')
          .eq('user_id', user.id)
          .single();

        if (tokenRow?.refresh_token) {
          const accessToken = await refreshAccessToken(tokenRow.refresh_token);
          if (accessToken && body.channelId) {
            await stopWatch(body.channelId, accessToken);
          }
        }

        // Also mark all user's watches as stopped
        await supabase
          .from('calendar_watch_channels')
          .update({ status: 'stopped' })
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'status':
      default: {
        const status = await getWatchStatus(user.id);
        return new Response(JSON.stringify(status), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (error) {
    console.error('[watch] Handler error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
