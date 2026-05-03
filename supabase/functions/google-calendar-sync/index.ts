// supabase/functions/google-calendar-sync/index.ts
// Syncs CRM tasks to Google Calendar with smart time detection
// Supports: create, update, delete actions

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { refreshAccessToken } from '../_shared/google-auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { isInternalServiceCall } from '../_shared/auth.ts';
import { validateOrganizationAccess } from '../_shared/security.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ============================================================================
// SMART TIME DETECTION
// ============================================================================

interface TimeSlot {
  hour: number;
  duration: number; // in minutes
}

const TIME_SLOTS: Record<string, TimeSlot> = {
  breakfast: { hour: 8, duration: 60 },
  coffee: { hour: 10, duration: 30 },
  lunch: { hour: 12, duration: 60 },
  call: { hour: 14, duration: 30 },
  meeting: { hour: 15, duration: 45 },
  meet: { hour: 15, duration: 45 },
  drinks: { hour: 17, duration: 90 },
  'happy hour': { hour: 17, duration: 90 },
  dinner: { hour: 19, duration: 90 },
};

function detectTimeSlot(title: string): TimeSlot | null {
  const lower = title.toLowerCase();
  
  // Check for keywords in order of specificity
  for (const [keyword, slot] of Object.entries(TIME_SLOTS)) {
    if (lower.includes(keyword)) {
      return slot;
    }
  }
  
  // No time keyword detected - return null for all-day event
  return null;
}

// ============================================================================
// GOOGLE CALENDAR API HELPERS
// ============================================================================

interface CalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}

async function createCalendarEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<{ id: string } | null> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[calendar-sync] Create event failed:', res.status, errorText);
    return null;
  }

  return res.json();
}

async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEvent
): Promise<{ id: string } | null> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[calendar-sync] Update event failed:', res.status, errorText);
    return null;
  }

  return res.json();
}

async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // 204 No Content = success, 410 Gone = already deleted
  return res.status === 204 || res.status === 410;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

interface SyncRequest {
  action: 'create' | 'update' | 'delete';
  taskId: string;
  userId?: string; // Can be passed directly or extracted from JWT
  organizationId?: string;
  title?: string;
  description?: string;
  due_date?: string;
  dealName?: string;
  accountName?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    const body: SyncRequest = await req.json();
    const { action, taskId, title, description, due_date, dealName, accountName } = body;

    // Resolve user context safely:
    // - Internal service calls may pass userId + organizationId in body.
    // - External calls must use JWT identity and cannot spoof userId from body.
    let userId: string | undefined;
    if (isInternalServiceCall(req)) {
      userId = body.userId;
      if (!userId || !body.organizationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'userId and organizationId required for internal calls', errorCode: 'MISSING_CONTEXT' }),
          { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      const hasOrgAccess = await validateOrganizationAccess(supabase, userId, body.organizationId);
      if (!hasOrgAccess) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid userId/organizationId context', errorCode: 'INVALID_CONTEXT' }),
          { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
    } else {
      const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: { user } } = await supabase.auth.getUser(jwt);
      userId = user?.id;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing userId', errorCode: 'MISSING_USER' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    let resolvedOrganizationId = body.organizationId;
    if (!resolvedOrganizationId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      resolvedOrganizationId = membership?.organization_id;
    }

    if (!resolvedOrganizationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'No active organization membership', errorCode: 'NO_ORG' }),
        { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    if (!taskId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing taskId', errorCode: 'MISSING_TASK' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    console.log(`[calendar-sync] ${action} for task ${taskId}, user ${userId}`);

    // Get user's Google token
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenRow?.refresh_token) {
      console.log('[calendar-sync] No Google token for user, skipping sync');
      return new Response(
        JSON.stringify({ success: false, error: 'Google Calendar not connected', errorCode: 'NOT_CONNECTED' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Check for calendar scope (either readonly or full access)
    const hasCalendarScope = 
      tokenRow.scopes?.includes('https://www.googleapis.com/auth/calendar') ||
      tokenRow.scopes?.includes('https://www.googleapis.com/auth/calendar.readonly');
    
    // For write operations, we need full access, not just readonly
    const hasWriteScope = tokenRow.scopes?.includes('https://www.googleapis.com/auth/calendar');

    if (!hasCalendarScope) {
      console.log('[calendar-sync] No calendar scope, skipping sync');
      return new Response(
        JSON.stringify({ success: false, error: 'Calendar scope not granted', errorCode: 'NO_SCOPE' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    if (!hasWriteScope && action !== 'delete') {
      console.log('[calendar-sync] Only readonly scope, cannot create/update events');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Calendar write access required. Please reconnect Google Calendar.',
          errorCode: 'NEEDS_WRITE_SCOPE'
        }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Get access token
    const accessToken = await refreshAccessToken(tokenRow.refresh_token);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to refresh Google token', errorCode: 'TOKEN_EXPIRED' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Get user's timezone from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();

    const timezone = profile?.timezone || 'America/New_York';

    // Handle actions
    if (action === 'delete') {
      // Get existing event ID from task
      const { data: task } = await supabase
        .from('tasks')
        .select('google_event_id')
        .eq('id', taskId)
        .maybeSingle();

      if (!task?.google_event_id) {
        console.log('[calendar-sync] No event to delete');
        return new Response(
          JSON.stringify({ success: true, message: 'No calendar event to delete' }),
          { headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }

      const deleted = await deleteCalendarEvent(accessToken, task.google_event_id);
      if (deleted) {
        await supabase
          .from('tasks')
          .update({ google_event_id: null, calendar_synced_at: null })
          .eq('id', taskId);
      }

      return new Response(
        JSON.stringify({ success: deleted }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // For create/update, we need due_date
    if (!due_date) {
      console.log('[calendar-sync] No due_date, skipping sync');
      return new Response(
        JSON.stringify({ success: false, error: 'No due date for task' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Detect time slot from title
    const timeSlot = title ? detectTimeSlot(title) : null;
    const dueDate = new Date(due_date);

    // Build event summary
    let summary = title || 'CRM Task';
    if (dealName) summary += ` - ${dealName}`;
    if (accountName && !summary.includes(accountName)) summary += ` (${accountName})`;

    // Build event description
    let eventDescription = description || '';
    if (dealName) eventDescription = `Deal: ${dealName}\n${eventDescription}`;

    // Build calendar event
    const event: CalendarEvent = {
      summary,
      description: eventDescription || undefined,
      start: {},
      end: {},
    };

    if (timeSlot) {
      // Timed event
      const startDate = new Date(dueDate);
      startDate.setHours(timeSlot.hour, 0, 0, 0);
      
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + timeSlot.duration);

      event.start = {
        dateTime: startDate.toISOString(),
        timeZone: timezone,
      };
      event.end = {
        dateTime: endDate.toISOString(),
        timeZone: timezone,
      };

      console.log(`[calendar-sync] Detected "${Object.keys(TIME_SLOTS).find(k => title?.toLowerCase().includes(k))}" - scheduling at ${timeSlot.hour}:00 for ${timeSlot.duration}min`);
    } else {
      // All-day event
      const dateStr = dueDate.toISOString().split('T')[0];
      event.start = { date: dateStr };
      event.end = { date: dateStr };
      
      console.log('[calendar-sync] No time keyword detected - creating all-day event');
    }

    // Check if this is a real task ID (UUID) or a play-based ephemeral ID
    const isRealTask = !taskId.startsWith('play-');

    // Check for existing event (update case) — only for real tasks
    let existingEventId: string | null = null;
    if (isRealTask) {
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('google_event_id')
        .eq('id', taskId)
        .maybeSingle();
      existingEventId = existingTask?.google_event_id || null;
    }

    let result: { id: string } | null = null;

    if (existingEventId && action === 'update') {
      // Update existing event
      result = await updateCalendarEvent(accessToken, existingEventId, event);
    } else {
      // Create new event
      console.log('[calendar-sync] Creating event:', JSON.stringify(event));
      result = await createCalendarEvent(accessToken, event);
      console.log('[calendar-sync] Create result:', JSON.stringify(result));
    }

    if (result?.id) {
      // Update task with event ID — only for real tasks
      if (isRealTask) {
        await supabase
          .from('tasks')
          .update({
            google_event_id: result.id,
            calendar_synced_at: new Date().toISOString(),
          })
          .eq('id', taskId);
      }

      console.log(`[calendar-sync] Successfully synced ${taskId} to event ${result.id}`);

      return new Response(
        JSON.stringify({ success: true, eventId: result.id }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Failed to sync to calendar', errorCode: 'SYNC_FAILED' }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );

  } catch (err) {
    console.error('[calendar-sync] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', errorCode: 'INTERNAL_ERROR' }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }
});
