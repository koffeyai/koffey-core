/**
 * Google Calendar Webhook Handler
 *
 * Receives push notifications from Google Calendar API when events change.
 * This enables real-time bidirectional sync between Google Calendar and CRM.
 *
 * Google sends POST requests with headers:
 * - X-Goog-Channel-ID: Our channel ID
 * - X-Goog-Resource-ID: Google's resource ID
 * - X-Goog-Resource-State: 'sync' (initial) or 'exists' (changes available)
 * - X-Goog-Message-Number: Sequence number
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { refreshAccessToken } from '../_shared/google-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface CalendarEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated: string;
  etag: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    self?: boolean;
    responseStatus?: string;
  }>;
  organizer?: { email: string; displayName?: string; self?: boolean };
}

interface EventsListResponse {
  items: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

/**
 * Fetch changed events using sync token (incremental sync)
 */
async function fetchChangedEvents(
  accessToken: string,
  calendarId: string,
  syncToken?: string
): Promise<{ events: CalendarEvent[]; nextSyncToken: string | null }> {
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);

    if (syncToken && !pageToken) {
      // Use sync token for incremental sync
      url.searchParams.set('syncToken', syncToken);
    } else {
      // Full sync or pagination
      url.searchParams.set('maxResults', '100');
      url.searchParams.set('singleEvents', 'true');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      } else {
        // For full sync, only get recent events
        const timeMin = new Date();
        timeMin.setDate(timeMin.getDate() - 30);
        url.searchParams.set('timeMin', timeMin.toISOString());
      }
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const error = await response.text();
      // If sync token is invalid, we need to do a full sync
      if (response.status === 410) {
        console.log('[webhook] Sync token expired, need full sync');
        return fetchChangedEvents(accessToken, calendarId, undefined);
      }
      throw new Error(`Calendar API error: ${response.status} - ${error}`);
    }

    const data: EventsListResponse = await response.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || null;
  } while (pageToken);

  return { events: allEvents, nextSyncToken };
}

/**
 * Process a single event change
 */
async function processEventChange(
  event: CalendarEvent,
  userId: string,
  organizationId: string | null,
  calendarId: string
): Promise<{ action: string; activityId?: string }> {
  // Check if we're already tracking this event
  const { data: existingSync } = await supabase
    .from('calendar_event_sync')
    .select('id, activity_id, google_etag')
    .eq('user_id', userId)
    .eq('google_event_id', event.id)
    .eq('google_calendar_id', calendarId)
    .maybeSingle();

  // Event was deleted (status = 'cancelled')
  if (event.status === 'cancelled') {
    if (existingSync?.activity_id) {
      // Mark activity as cancelled/deleted
      await supabase
        .from('activities')
        .update({
          completed: true,
          description: (await supabase
            .from('activities')
            .select('description')
            .eq('id', existingSync.activity_id)
            .single()
          ).data?.description + '\n\n[Event cancelled in Google Calendar]'
        })
        .eq('id', existingSync.activity_id);

      // Update sync record
      await supabase
        .from('calendar_event_sync')
        .update({
          sync_status: 'synced',
          google_updated_at: event.updated,
          google_etag: event.etag
        })
        .eq('id', existingSync.id);

      return { action: 'deleted', activityId: existingSync.activity_id };
    }
    return { action: 'ignored' };
  }

  // Skip if etag hasn't changed (no actual change)
  if (existingSync && existingSync.google_etag === event.etag) {
    return { action: 'unchanged' };
  }

  const startTime = event.start?.dateTime || event.start?.date;

  if (existingSync?.activity_id) {
    // Update existing activity
    await supabase
      .from('activities')
      .update({
        title: event.summary || 'Calendar Event',
        description: event.description || null,
        activity_date: startTime || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingSync.activity_id);

    // Update sync record
    await supabase
      .from('calendar_event_sync')
      .update({
        google_updated_at: event.updated,
        google_etag: event.etag,
        last_synced_at: new Date().toISOString()
      })
      .eq('id', existingSync.id);

    return { action: 'updated', activityId: existingSync.activity_id };
  }

  // Create new activity for this event
  // First, try to find a contact from attendees
  let contactId: string | null = null;
  let accountId: string | null = null;

  if (event.attendees?.length) {
    // Get user's email to exclude self
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = profile?.email?.toLowerCase();

    // Find first non-self attendee that's a contact
    for (const attendee of event.attendees) {
      if (attendee.self || attendee.email?.toLowerCase() === userEmail) continue;

      const { data: contact } = await supabase
        .from('contacts')
        .select('id, account_id')
        .eq('email', attendee.email.toLowerCase())
        .eq('user_id', userId)
        .maybeSingle();

      if (contact) {
        contactId = contact.id;
        accountId = contact.account_id;
        break;
      }
    }
  }

  // Create the activity
  const { data: newActivity, error: activityError } = await supabase
    .from('activities')
    .insert({
      title: event.summary || 'Calendar Event',
      type: 'meeting',
      description: event.description || null,
      activity_date: startTime || new Date().toISOString(),
      contact_id: contactId,
      account_id: accountId,
      user_id: userId,
      organization_id: organizationId,
      completed: startTime ? new Date(startTime) < new Date() : false
    })
    .select('id')
    .single();

  if (activityError) {
    console.error('[webhook] Failed to create activity:', activityError);
    return { action: 'error' };
  }

  // Create sync record
  await supabase
    .from('calendar_event_sync')
    .upsert({
      user_id: userId,
      organization_id: organizationId,
      google_event_id: event.id,
      google_calendar_id: calendarId,
      google_updated_at: event.updated,
      google_etag: event.etag,
      activity_id: newActivity.id,
      sync_direction: 'google_to_crm',
      sync_status: 'synced'
    }, {
      onConflict: 'user_id,google_event_id,google_calendar_id'
    });

  // Post-meeting follow-up: if the meeting has ended and is linked to a CRM contact,
  // create a suggested action prompting the user to log notes
  if (contactId && startTime) {
    const eventEnd = event.end?.dateTime || event.end?.date;
    if (eventEnd) {
      const endTime = new Date(eventEnd);
      const now = new Date();
      const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
      // Meeting just ended (within last 30 minutes)
      if (endTime <= now && endTime >= thirtyMinAgo) {
        try {
          await supabase.from('suggested_actions').insert({
            organization_id: organizationId,
            user_id: userId,
            action_type: 'post_meeting_followup',
            title: `Log your notes from: ${event.summary || 'meeting'}`,
            description: 'The meeting just ended. Capture key takeaways and next steps while they\'re fresh.',
            reference_id: newActivity.id,
            reference_type: 'activity',
            priority: 'high',
          });
          console.log(`[webhook] Created post-meeting follow-up for ${event.summary}`);
        } catch (e) {
          console.warn('[webhook] Failed to create follow-up suggestion:', e);
        }
      }
    }
  }

  return { action: 'created', activityId: newActivity.id };
}

/**
 * Process webhook notification
 */
async function processNotification(channelId: string, resourceId: string, resourceState: string): Promise<void> {
  console.log(`[webhook] Processing notification for channel ${channelId}, state: ${resourceState}`);

  // Get the watch channel info
  const { data: channel, error: channelError } = await supabase
    .from('calendar_watch_channels')
    .select('*')
    .eq('channel_id', channelId)
    .eq('resource_id', resourceId)
    .eq('status', 'active')
    .single();

  if (channelError || !channel) {
    console.error('[webhook] Channel not found:', channelId);
    return;
  }

  // Update notification count
  await supabase
    .from('calendar_watch_channels')
    .update({
      last_notification_at: new Date().toISOString(),
      notification_count: (channel.notification_count || 0) + 1
    })
    .eq('id', channel.id);

  // 'sync' state is just confirmation that watch is set up
  if (resourceState === 'sync') {
    console.log('[webhook] Watch confirmed for channel:', channelId);
    return;
  }

  // 'exists' means there are changes to fetch
  if (resourceState !== 'exists') {
    console.log('[webhook] Ignoring resource state:', resourceState);
    return;
  }

  // Get user's Google tokens
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('refresh_token')
    .eq('user_id', channel.user_id)
    .single();

  if (!tokenRow?.refresh_token) {
    console.error('[webhook] No Google tokens for user:', channel.user_id);
    await supabase
      .from('calendar_watch_channels')
      .update({ status: 'error', error_message: 'No Google tokens' })
      .eq('id', channel.id);
    return;
  }

  // Get fresh access token
  const accessToken = await refreshAccessToken(tokenRow.refresh_token);
  if (!accessToken) {
    console.error('[webhook] Failed to refresh token for user:', channel.user_id);
    return;
  }

  // Fetch changed events
  const { events, nextSyncToken } = await fetchChangedEvents(
    accessToken,
    channel.calendar_id,
    channel.sync_token
  );

  console.log(`[webhook] Fetched ${events.length} changed events`);

  // Get organization context from channel row first, then fallback to membership lookup.
  let organizationId: string | null = channel.organization_id || null;
  if (!organizationId) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', channel.user_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    organizationId = membership?.organization_id || null;
  }

  // Process each event
  let created = 0, updated = 0, deleted = 0;

  for (const event of events) {
    try {
      const result = await processEventChange(
        event,
        channel.user_id,
        organizationId,
        channel.calendar_id
      );

      if (result.action === 'created') created++;
      if (result.action === 'updated') updated++;
      if (result.action === 'deleted') deleted++;
    } catch (error) {
      console.error(`[webhook] Error processing event ${event.id}:`, error);
    }
  }

  // Update sync token for incremental sync
  if (nextSyncToken) {
    await supabase
      .from('calendar_watch_channels')
      .update({ sync_token: nextSyncToken })
      .eq('id', channel.id);
  }

  console.log(`[webhook] Processed: ${created} created, ${updated} updated, ${deleted} deleted`);
}

// Main handler
Deno.serve(async (req) => {
  // Google sends POST requests for notifications
  if (req.method === 'POST') {
    const channelId = req.headers.get('X-Goog-Channel-ID');
    const resourceId = req.headers.get('X-Goog-Resource-ID');
    const resourceState = req.headers.get('X-Goog-Resource-State');
    const messageNumber = req.headers.get('X-Goog-Message-Number');

    console.log(`[webhook] Received: channel=${channelId}, resource=${resourceId}, state=${resourceState}, msg=${messageNumber}`);

    if (!channelId || !resourceId || !resourceState) {
      return new Response('Missing required headers', { status: 400 });
    }

    // Process async to respond quickly to Google
    // Google expects a 200 response within a few seconds
    processNotification(channelId, resourceId, resourceState).catch(err => {
      console.error('[webhook] Async processing error:', err);
    });

    // Respond immediately to Google
    return new Response('OK', { status: 200 });
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', service: 'google-calendar-webhook' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method not allowed', { status: 405 });
});
