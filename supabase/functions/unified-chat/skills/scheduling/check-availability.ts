/**
 * Skill: check_availability
 *
 * Check user's Google Calendar for available meeting slots.
 * Calls the check-availability edge function.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const checkAvailability: SkillDefinition = {
  name: 'check_availability',
  displayName: 'Check Availability',
  domain: 'scheduling',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check the user\'s Google Calendar for available meeting slots. Use when user wants to schedule lunch, coffee, a meeting, or a call with a contact. Can look up the contact via deal_id, contact_id, or contact_name. Always present slots to the user and wait for confirmation before sending any email.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'Deal UUID — used to look up the contact to schedule with',
          },
          contact_id: {
            type: 'string',
            description: 'Contact UUID — direct lookup of a specific contact to schedule with',
          },
          contact_name: {
            type: 'string',
            description: 'Contact name — fuzzy match to find the contact to schedule with',
          },
          slot_type: {
            type: 'string',
            enum: ['lunch', 'coffee', 'meeting', 'call'],
            description: 'Type of meeting (determines search window: lunch=11:30-1:30pm, coffee=9-11am, meeting/call=9am-5pm)',
          },
          days_ahead: {
            type: 'number',
            description: 'Number of business days to search for availability (default 5, max 10)',
          },
          time_preference: {
            type: 'string',
            enum: ['morning', 'afternoon', 'any'],
            description: "Preferred time of day: morning (9am-12pm), afternoon (12pm-5pm), or any (default). Use when user says 'preferably morning' or 'afternoon works best'.",
          },
        },
      },
    },
  },

  instructions: `**For "schedule lunch with", "book a meeting", "find time for coffee"** → Use check_availability then send_scheduling_email
  - PROACTIVE SCHEDULING FLOW (minimize back-and-forth):
    1. Immediately call check_availability with deal_id and the appropriate slot_type (infer from context: "lunch" → lunch, "coffee" → coffee, "meeting" → meeting, "call" → call)
    2. Present the available slots to the user as numbered options along with the contact info
    3. WAIT for the user to confirm which slot(s) they prefer — NEVER auto-send the email
    4. Once confirmed, compose AND send in one step — don't show a draft unless the user asks to review
    5. Confirm the email was sent and the activity was logged
  - KEY: Do NOT ask "which deal?" if there's only one deal in context. Do NOT ask "what type of meeting?" if the user already said "lunch". Act on clear intent immediately.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { userId, organizationId, args } = ctx;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const payload: Record<string, unknown> = {
      userId,
      organizationId,
      slotType: args.slot_type || 'meeting',
      daysAhead: args.days_ahead || 5,
      maxSlots: 5,
      timePreference: args.time_preference || 'any',
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/check-availability`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.error || 'Failed to check availability' };
    }

    return await response.json();
  },

  triggerExamples: [
    'schedule lunch with Sarah',
    'find time for a call with John next week',
    'book a meeting with the Pepsi team',
  ],
};

export default checkAvailability;
