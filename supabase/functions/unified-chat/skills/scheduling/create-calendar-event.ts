/**
 * Skill: create_calendar_event
 *
 * Create a Google Calendar event with attendees and send invites.
 * Two-phase: first returns preview for confirmation, then executes on confirm.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';
import { refreshAccessToken } from '../../../_shared/google-auth.ts';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const createCalendarEvent: SkillDefinition = {
  name: 'create_calendar_event',
  displayName: 'Create Calendar Event',
  domain: 'scheduling',
  version: '1.0.0',
  loadTier: 'standard',

  schema: {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Create a Google Calendar event and send meeting invites. ALWAYS use this tool when the user wants to send a meeting invite, schedule a call, or book a meeting — even if the person is not in the CRM. Accepts email addresses directly via attendee_emails. On first call, returns a preview. After user confirms, call again with confirmed=true.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Meeting title (e.g., "Discovery Call with Sarah Chen")',
          },
          contact_name: {
            type: 'string',
            description: 'Name of the CRM contact to invite. Their email will be looked up automatically.',
          },
          attendee_emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Email addresses to invite. Use this when the user provides an email directly (e.g. "send a meeting to john@example.com"). Works for anyone — they do NOT need to be in the CRM.',
          },
          start_time: {
            type: 'string',
            description: 'Start date/time in ISO 8601 format (e.g., "2026-03-25T14:00:00")',
          },
          duration_minutes: {
            type: 'number',
            description: 'Meeting duration in minutes. Default: 30.',
          },
          description: {
            type: 'string',
            description: 'Meeting description/agenda',
          },
          confirmed: {
            type: 'boolean',
            description: 'Set to true ONLY after the user has confirmed the meeting preview. Never set on first call.',
          },
        },
        required: ['title', 'start_time'],
      },
    },
  },

  instructions: `**For ANY meeting/calendar request — "send a meeting invite", "book a call", "schedule a meeting", "set up a call", "invite X to a meeting"** → Use create_calendar_event
  - If user provides an EMAIL ADDRESS directly → pass it in attendee_emails (do NOT search CRM)
  - If user provides a NAME → look up their email via contact_name parameter
  - If no attendee provided → create event with no attendees (just blocks the user's calendar)
  - First call: show confirmation preview (do NOT set confirmed=true)
  - After user says "yes"/"confirm": call again with the SAME parameters + confirmed=true
  - Default duration is 30 minutes unless specified
  - Google Calendar sends invite emails to all attendees automatically
  - Do NOT use create_activity for meeting requests — ALWAYS use create_calendar_event`,

  execute: async (ctx: ToolExecutionContext) => {
    const { title, contact_name, attendee_emails, start_time, duration_minutes, description, confirmed } = ctx.args;

    // Resolve contact email
    let attendees: Array<{ email: string; displayName?: string }> = [];

    if (contact_name) {
      const { data: contact } = await ctx.supabase
        .from('contacts')
        .select('id, full_name, email')
        .eq('organization_id', ctx.organizationId)
        .ilike('full_name', `%${contact_name}%`)
        .limit(1)
        .maybeSingle();

      if (!contact) {
        return { success: false, message: `No contact found matching "${contact_name}".` };
      }
      if (!contact.email) {
        return { success: false, message: `${contact.full_name} doesn't have an email. Add their email first.` };
      }
      attendees.push({ email: contact.email, displayName: contact.full_name });
    }

    if (attendee_emails) {
      for (const email of attendee_emails) {
        if (!attendees.some(a => a.email === email)) {
          attendees.push({ email });
        }
      }
    }

    const duration = duration_minutes || 30;
    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
    const attendeeList = attendees.map(a => a.displayName ? `${a.displayName} (${a.email})` : a.email).join(', ');

    // Phase 1: Preview (no confirmed flag)
    if (!confirmed) {
      return {
        _needsConfirmation: true,
        _confirmationType: 'calendar_event',
        success: true,
        preview: { title, attendees: attendeeList, start: startDate.toISOString(), end: endDate.toISOString(), duration_minutes: duration },
        message: `I'll create this meeting:\n\n**${title}**\n- With: ${attendeeList || 'no attendees'}\n- When: ${startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n- Duration: ${duration} minutes\n\nReply "yes" to create and send invite.`,
      };
    }

    // Phase 2: Execute — actually create the Google Calendar event
    try {
      // Get user's Google token
      const { data: tokenRow } = await ctx.supabase
        .from('google_tokens')
        .select('refresh_token, access_token, expires_at, scopes')
        .eq('user_id', ctx.userId)
        .maybeSingle();

      if (!tokenRow?.refresh_token) {
        return { success: false, message: 'Google Calendar not connected. Connect in Settings → Features.' };
      }

      const scopes: string[] = tokenRow.scopes || [];
      if (!scopes.some(s => s.includes('calendar'))) {
        return { success: false, message: 'Calendar permission not granted. Reconnect Google Calendar in Settings.' };
      }

      // Refresh token if needed
      const accessToken = await refreshAccessToken(tokenRow.refresh_token);
      if (!accessToken) {
        return { success: false, message: 'Google token refresh failed. Reconnect Google Calendar in Settings.' };
      }
      await ctx.supabase
        .from('google_tokens')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
        .eq('user_id', ctx.userId);

      // Create event via Google Calendar API
      const event = {
        summary: title,
        description: description || '',
        start: { dateTime: startDate.toISOString(), timeZone: 'America/New_York' },
        end: { dateTime: endDate.toISOString(), timeZone: 'America/New_York' },
        attendees: attendees.map(a => ({ email: a.email, displayName: a.displayName })),
        reminders: { useDefault: true },
      };

      const response = await fetch(`${CALENDAR_API}?sendUpdates=all`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[create_calendar_event] API error ${response.status}:`, errText.substring(0, 200));
        return { success: false, message: `Failed to create event: ${response.status}` };
      }

      const created = await response.json();

      // Log as CRM activity
      await ctx.supabase.from('activities').insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        type: 'meeting',
        title: `Meeting: ${title}`,
        description: `${attendeeList ? `With: ${attendeeList}` : ''}${description ? `\n${description}` : ''}`,
        scheduled_at: startDate.toISOString(),
      });

      return {
        success: true,
        id: created.id,
        name: title,
        message: `✅ Meeting created: **${title}**\n- ${attendeeList ? `Invite sent to ${attendeeList}` : 'No attendees'}\n- ${startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      };
    } catch (err: any) {
      console.error('[create_calendar_event] Error:', err.message);
      return { success: false, message: `Failed to create calendar event: ${err.message}` };
    }
  },

  triggerExamples: [
    'book a call with Sarah next Tuesday at 2pm',
    'schedule a meeting with the Datadog team',
    'create a 1-hour meeting with Lisa Chang on Friday',
  ],
};

export default createCalendarEvent;
