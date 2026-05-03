/**
 * Skill: create_task
 *
 * Create a task or next step linked to a deal.
 * Handler is still inline in index.ts (executeCreateTask).
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const createTask: SkillDefinition = {
  name: 'create_task',
  displayName: 'Create Task',
  domain: 'create',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'create_task',
      description: `Create a task or next step linked to a deal. Use this for requests like:
- "add a next step to [account/deal]"
- "remind me to follow up with [account]"
- "need to send proposal to [account] by [date]"
- "schedule a call with [contact] for [date]"
- "schedule a discovery call for [deal]"

The tool will:
1. Resolve account/deal names automatically
2. If single match found: create task immediately
3. If multiple matches: return options for user to select
4. Parse natural language dates (tomorrow, next week, february 12th)
5. Auto-sync to Google Calendar if the user has it connected and task has a due_date

IMPORTANT: For scheduling requests, ALWAYS include a due_date (default to today if user doesn't specify one). Include "call" or "meeting" in the title so the calendar event gets a proper time slot.`,
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Task title/description - what needs to be done (required)',
          },
          account_name: {
            type: 'string',
            description: 'Account name to find and link deals for',
          },
          deal_name: {
            type: 'string',
            description: 'Specific deal name if mentioned',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID if already known from prior resolution',
          },
          due_date: {
            type: 'string',
            description: 'Due date - natural language (tomorrow, next week, feb 12) or YYYY-MM-DD',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Task priority level (default: medium)',
          },
          contact_name: {
            type: 'string',
            description: 'Contact name if task involves a specific person. Extract when user says "follow up with Sarah", "call Daniel Ricci", etc.',
          },
        },
        required: ['title'],
      },
    },
  },

  instructions: `**For "add next step", "remind me to", "follow up with", "need to", "schedule a call/meeting", "create a task"** → Use create_task
  - NEVER ask what the task should be about — the user already told you. If they say "create a follow-up task for Acme", the title IS "Follow up" and the deal is "Acme". Just create it.
  - Use the user's own words as the task title. "Follow up", "Send proposal", "Schedule demo" — whatever action they described IS the title.
  - If the user mentions a person's name, ALWAYS extract it as contact_name. E.g. "follow up with Sarah" → contact_name="Sarah". The system will resolve and link the contact.
  - If context from previous messages identifies the account/deal, the system will use that automatically — you don't need to re-ask.
  - Automatically resolves account/deal names AND contact names (scoped to account when possible)
  - Single match: creates immediately
  - Multiple matches: returns options for user selection
  - Parses natural dates: "tomorrow", "next week", "february 12th"
  - Tasks with due dates auto-sync to Google Calendar (if connected)
  - For scheduling: ALWAYS include a due_date (default to today if not specified)
  - NOTE: If the user wants to actually SEND an email/invite to someone (not just create a task), use schedule_meeting instead.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeCreateTask } = await import('../../tools/tasks-activities.ts');
    return executeCreateTask(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
      ctx.entityContext,
    );
  },

  triggerExamples: [
    'add a next step for the Pepsi deal',
    'remind me to follow up with John tomorrow',
    'schedule a call with Sarah next Tuesday',
  ],
};

export default createTask;
