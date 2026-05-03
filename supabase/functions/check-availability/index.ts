// supabase/functions/check-availability/index.ts
// Checks user's Google Calendar availability using FreeBusy API
// Returns available time slots for scheduling meetings

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
// TIME WINDOW CONFIGURATION
// ============================================================================

interface TimeWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  durationMinutes: number;
}

const SLOT_WINDOWS: Record<string, TimeWindow> = {
  lunch:   { startHour: 11, startMinute: 30, endHour: 13, endMinute: 30, durationMinutes: 60 },
  coffee:  { startHour: 9,  startMinute: 0,  endHour: 11, endMinute: 0,  durationMinutes: 30 },
  meeting: { startHour: 9,  startMinute: 0,  endHour: 17, endMinute: 0,  durationMinutes: 45 },
  call:    { startHour: 9,  startMinute: 0,  endHour: 17, endMinute: 0,  durationMinutes: 30 },
};

// ============================================================================
// TYPES
// ============================================================================

interface AvailableSlot {
  date: string;        // "2026-02-13"
  dayLabel: string;    // "Thursday, Feb 13"
  startTime: string;   // "12:00 PM"
  endTime: string;     // "1:00 PM"
  isoStart: string;    // Full ISO datetime string
  isoEnd: string;      // Full ISO datetime string
}

interface BusyPeriod {
  start: string;
  end: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday or Saturday
}

function getNextBusinessDays(startDate: Date, count: number): Date[] {
  const days: Date[] = [];
  const current = new Date(startDate);

  // If current time is past the end of the slot window for today, start from tomorrow
  current.setHours(0, 0, 0, 0);
  if (current.getTime() === startDate.getTime()) {
    // startDate was already midnight, keep it
  }

  while (days.length < count) {
    if (isBusinessDay(current)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function formatDayLabel(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
}

function formatTime(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Given a day and a time window, find available slots that don't overlap with busy periods.
 * Returns slots aligned to 30-minute boundaries.
 */
function findSlotsForDay(
  day: Date,
  window: TimeWindow,
  busyPeriods: BusyPeriod[],
  timezone: string,
  now: Date
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const dateStr = formatDateStr(day);

  // Build the search window for this day in the user's timezone
  // We work in UTC but define the window relative to the user's local time
  const windowStartStr = `${dateStr}T${String(window.startHour).padStart(2, '0')}:${String(window.startMinute).padStart(2, '0')}:00`;
  const windowEndStr = `${dateStr}T${String(window.endHour).padStart(2, '0')}:${String(window.endMinute).padStart(2, '0')}:00`;

  // Parse busy periods that overlap with this day
  const dayBusy = busyPeriods
    .map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter(b => {
      // Rough filter: busy period overlaps this day
      const dayStart = new Date(windowStartStr + 'Z').getTime() - 24 * 60 * 60 * 1000; // generous
      const dayEnd = new Date(windowEndStr + 'Z').getTime() + 24 * 60 * 60 * 1000;
      return b.start < dayEnd && b.end > dayStart;
    })
    .sort((a, b) => a.start - b.start);

  // Iterate through the window in 30-minute increments
  const durationMs = window.durationMinutes * 60 * 1000;

  // Create candidate slots every 30 minutes within the window
  let candidateHour = window.startHour;
  let candidateMinute = window.startMinute;

  while (candidateHour < window.endHour || (candidateHour === window.endHour && candidateMinute < window.endMinute)) {
    const slotStartStr = `${dateStr}T${String(candidateHour).padStart(2, '0')}:${String(candidateMinute).padStart(2, '0')}:00`;

    // Use a simple approach: create Date objects with timezone offset
    // The FreeBusy API returns UTC times, so we need to compare properly
    // We'll use the timezone-aware format for the Google API
    const slotStartDate = new Date(slotStartStr);
    const slotEndDate = new Date(slotStartDate.getTime() + durationMs);

    // Check the end of this slot doesn't exceed the window
    const windowEndDate = new Date(windowEndStr);
    if (slotEndDate > windowEndDate) break;

    // Skip slots in the past
    if (slotStartDate > now) {
      // Check for overlap with busy periods
      const slotStartMs = slotStartDate.getTime();
      const slotEndMs = slotEndDate.getTime();
      const hasConflict = dayBusy.some(b => b.start < slotEndMs && b.end > slotStartMs);

      if (!hasConflict) {
        slots.push({
          date: dateStr,
          dayLabel: formatDayLabel(slotStartDate, timezone),
          startTime: formatTime(slotStartDate, timezone),
          endTime: formatTime(slotEndDate, timezone),
          isoStart: slotStartDate.toISOString(),
          isoEnd: slotEndDate.toISOString(),
        });
      }
    }

    // Advance by 30 minutes
    candidateMinute += 30;
    if (candidateMinute >= 60) {
      candidateMinute -= 60;
      candidateHour += 1;
    }
  }

  return slots;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Auth: support both JWT (from browser) and service role key (from unified-chat)
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    let userId: string;

    // Check if this is an internal service call
    if (isInternalServiceCall(req)) {
      // Internal call — userId must be in the body
      const body = await req.clone().json();
      if (!body.userId) {
        return new Response(
          JSON.stringify({ success: false, error: 'userId required for internal calls' }),
          { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      if (!body.organizationId) {
        return new Response(
          JSON.stringify({ success: false, error: 'organizationId required for internal calls' }),
          { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      const hasOrgAccess = await validateOrganizationAccess(supabase, body.userId, body.organizationId);
      if (!hasOrgAccess) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid userId/organizationId context' }),
          { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      userId = body.userId;
    } else {
      // Browser call — extract from JWT
      const { data: { user } } = await supabase.auth.getUser(jwt);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
      userId = user.id;
    }

    const body = await req.json();
    const slotType = body.slotType || 'lunch';
    const daysAhead = Math.min(body.daysAhead || 5, 10); // Cap at 10 business days
    const maxSlots = body.maxSlots || 3;
    const timePreference: 'morning' | 'afternoon' | 'any' = body.timePreference || 'any';

    const requestedOrganizationId = body.organizationId;
    if (requestedOrganizationId) {
      const hasOrgAccess = await validateOrganizationAccess(supabase, userId, requestedOrganizationId);
      if (!hasOrgAccess) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid user/organization context' }),
          { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
    } else {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (!membership?.organization_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'No active organization membership' }),
          { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } }
        );
      }
    }

    // Get Google tokens
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenRow?.refresh_token) {
      return new Response(
        JSON.stringify({ success: false, errorCode: 'NOT_CONNECTED', error: 'Google Calendar not connected' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Check calendar scope
    const hasCalendarScope = tokenRow.scopes?.includes('https://www.googleapis.com/auth/calendar.readonly') ||
                              tokenRow.scopes?.includes('https://www.googleapis.com/auth/calendar');
    if (!hasCalendarScope) {
      return new Response(
        JSON.stringify({ success: false, errorCode: 'NO_CALENDAR_SCOPE', error: 'Calendar access not granted' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Refresh access token
    const accessToken = await refreshAccessToken(tokenRow.refresh_token);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ success: false, errorCode: 'TOKEN_EXPIRED', error: 'Failed to refresh Google token' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Get user timezone
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();

    const timezone = profile?.timezone || 'America/New_York';

    // Get the time window for this slot type
    const window = SLOT_WINDOWS[slotType] || SLOT_WINDOWS.lunch;

    // Determine the date range to search
    const now = new Date();
    const businessDays = getNextBusinessDays(now, daysAhead);

    if (businessDays.length === 0) {
      return new Response(
        JSON.stringify({ success: true, slots: [], message: 'No business days found in the search range' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    // Build FreeBusy request spanning the full range
    const firstDay = businessDays[0];
    const lastDay = businessDays[businessDays.length - 1];

    const timeMinStr = `${formatDateStr(firstDay)}T${String(window.startHour).padStart(2, '0')}:00:00`;
    const timeMaxStr = `${formatDateStr(new Date(lastDay.getTime() + 24 * 60 * 60 * 1000))}T00:00:00`;

    // Call Google Calendar FreeBusy API
    const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMinStr,
        timeMax: timeMaxStr,
        timeZone: timezone,
        items: [{ id: 'primary' }],
      }),
    });

    if (!freeBusyRes.ok) {
      const errText = await freeBusyRes.text();
      console.error('[check-availability] FreeBusy API error:', errText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check calendar availability' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    const freeBusyData = await freeBusyRes.json();
    const busyPeriods: BusyPeriod[] = freeBusyData.calendars?.primary?.busy || [];

    console.log(`[check-availability] Found ${busyPeriods.length} busy periods across ${businessDays.length} business days`);

    // Find available slots across all business days
    const allSlots: AvailableSlot[] = [];

    for (const day of businessDays) {
      if (allSlots.length >= maxSlots) break;

      const daySlots = findSlotsForDay(day, window, busyPeriods, timezone, now);
      for (const slot of daySlots) {
        if (allSlots.length >= maxSlots) break;

        // Apply time preference filter
        if (timePreference !== 'any') {
          // Parse hour from startTime (e.g., "2:00 PM" → 14, "9:30 AM" → 9)
          const timeMatch = slot.startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (timeMatch) {
            let hour = parseInt(timeMatch[1], 10);
            const isPM = timeMatch[3].toUpperCase() === 'PM';
            if (isPM && hour !== 12) hour += 12;
            if (!isPM && hour === 12) hour = 0;

            if (timePreference === 'morning' && hour >= 12) continue;
            if (timePreference === 'afternoon' && hour < 12) continue;
          }
        }

        allSlots.push(slot);
      }
    }

    // If we didn't find enough slots, extend the search
    if (allSlots.length < maxSlots && daysAhead < 10) {
      console.log(`[check-availability] Only found ${allSlots.length} slots, would need extended search`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        slots: allSlots,
        slotType,
        timezone,
        searchedDays: businessDays.length,
        message: allSlots.length === 0
          ? `No available ${slotType} slots found in the next ${daysAhead} business days. Your calendar is packed!`
          : `Found ${allSlots.length} available ${slotType} slot${allSlots.length === 1 ? '' : 's'}.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );

  } catch (err) {
    console.error('[check-availability] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }
});
