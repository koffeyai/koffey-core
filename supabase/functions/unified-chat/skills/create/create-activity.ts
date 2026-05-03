/**
 * Skill: create_activity
 *
 * Log a sales activity (call, email, meeting, note) linked to a deal/account/contact.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const createActivity: SkillDefinition = {
  name: 'create_activity',
  displayName: 'Create Activity',
  domain: 'create',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'create_activity',
      description: `Log a sales activity (call, email, meeting, note, etc.) linked to a deal/account/contact. Use when user wants to:
- Log a call they just made: "called mike at target, voicemail"
- Record meeting notes briefly: "had a demo with acme, went well"
- Log an email: "sent proposal to sarah at pepsi"
- Track any outreach: "left voicemail for john, 3rd attempt"

The tool will:
1. Resolve account/deal/contact names automatically
2. Create the activity record with type, description, and date
3. Link to the appropriate deal, account, and contact

IMPORTANT: Use this for quick activity logging. For longer meeting notes with extraction, let the document detection pipeline handle it instead.`,
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: "Brief activity title (e.g., 'Call with Mike', 'Demo meeting', 'Sent proposal')",
          },
          type: {
            type: 'string',
            enum: ['call', 'email', 'meeting', 'note', 'linkedin', 'voicemail', 'demo', 'sms'],
            description: 'Type of activity (default: note)',
          },
          call_outcome: {
            type: 'string',
            enum: ['connected', 'voicemail', 'no_answer', 'busy', 'wrong_number', 'left_message', 'callback_scheduled'],
            description: "Outcome of a call. Use when type is 'call' or 'voicemail'.",
          },
          attempt_number: {
            type: 'number',
            description: "Which attempt this is (e.g., 'attempt 3', '3rd try'). Tracked per contact.",
          },
          disqualify: {
            type: 'boolean',
            description: "Set to true when user says 'DQ', 'disqualify', 'not a fit', 'dead lead'. Will update contact status to indicate disqualification.",
          },
          sentiment: {
            type: 'string',
            enum: ['positive', 'neutral', 'negative'],
            description: 'Prospect sentiment from the interaction',
          },
          description: {
            type: 'string',
            description: 'Details about the activity — what happened, outcome, notes',
          },
          account_name: {
            type: 'string',
            description: 'Account name to link the activity to',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name to link the activity to',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID if already known from prior resolution',
          },
          contact_name: {
            type: 'string',
            description: 'Contact name involved in this activity',
          },
          activity_date: {
            type: 'string',
            description: 'When the activity occurred — natural language (today, yesterday) or YYYY-MM-DD. Defaults to now.',
          },
        },
        required: ['title'],
      },
    },
  },

  instructions: `**For "called X", "had a meeting with", "sent email to", "log a call"** → Use create_activity
  - Resolves account/deal/contact names automatically
  - Tracks call outcomes (connected, voicemail, no_answer, etc.)
  - Supports attempt tracking ("3rd try") and sentiment
  - Use for quick activity logging; longer meeting notes use document detection instead`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeCreateActivity } = await import('../../tools/tasks-activities.ts');
    return executeCreateActivity(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
      ctx.entityContext,
    );
  },

  triggerExamples: [
    'called mike at target, voicemail',
    'had a demo with acme, went well',
    'sent proposal to sarah at pepsi',
  ],
};

export default createActivity;
