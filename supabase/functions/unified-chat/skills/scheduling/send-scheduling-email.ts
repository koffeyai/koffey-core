/**
 * Skill: send_scheduling_email
 *
 * Send an email proposing meeting times. ONLY after check_availability + user confirmation.
 * Calls the send-scheduling-email edge function.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const sendSchedulingEmail: SkillDefinition = {
  name: 'send_scheduling_email',
  displayName: 'Send Scheduling Email',
  domain: 'scheduling',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'send_scheduling_email',
      description: "Send an email to a contact proposing meeting time(s). ONLY call this after check_availability and ONLY after the user has confirmed which slot(s) they want to propose. Compose a professional, friendly email including the proposed times.",
      parameters: {
        type: 'object',
        properties: {
          recipient_email: {
            type: 'string',
            description: "Contact's email address",
          },
          recipient_name: {
            type: 'string',
            description: "Contact's full name",
          },
          subject: {
            type: 'string',
            description: 'Email subject line (keep it casual and professional)',
          },
          body: {
            type: 'string',
            description: 'Email body in plain text. Include the proposed time(s), a brief context, and a friendly sign-off. Do NOT include HTML tags.',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID for activity logging',
          },
        },
        required: ['recipient_email', 'recipient_name', 'subject', 'body'],
      },
    },
  },

  instructions: `**send_scheduling_email** — ONLY call after check_availability AND after user has confirmed slot(s).
  - Compose professional email with proposed times
  - NEVER auto-send — user must confirm the slot first via check_availability flow`,

  execute: async (ctx: ToolExecutionContext) => {
    const { organizationId, userId, args, traceId } = ctx;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    const payload: Record<string, unknown> = {
      userId,
      organizationId,
      traceId,
      recipientEmail: args.recipient_email,
      recipientName: args.recipient_name,
      subject: args.subject,
      plainBody: args.body,
      dealId: args.deal_id || undefined,
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/send-scheduling-email`, {
      method: 'POST',
      headers: {
        'Authorization': (typeof ctx.authHeader === 'string' && /^Bearer\s+\S+/i.test(ctx.authHeader)) ? ctx.authHeader : `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...((typeof ctx.authHeader === 'string' && /^Bearer\s+\S+/i.test(ctx.authHeader) && anonKey) ? { apikey: anonKey } : {}),
        ...(traceId ? { 'x-trace-id': traceId } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.error || 'Failed to send scheduling email' };
    }

    return await response.json();
  },

  triggerExamples: [
    'send the meeting request to Sarah',
    'email Mike about the lunch slot',
  ],
};

export default sendSchedulingEmail;
