/**
 * Skill: get_tasks
 *
 * Get tasks/next steps for an account, deal, or the current user.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getTasks: SkillDefinition = {
  name: 'get_tasks',
  displayName: 'Get Tasks',
  domain: 'search',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_tasks',
      description: `Get tasks/next steps for an account, deal, or the current user. Use for:
- "what's my next step for [account]?"
- "show tasks for [deal]"
- "what do I need to do for [account]?"
- "what's overdue?"
- "my action items" (no entity = user's tasks across all deals)

Returns tasks sorted by: overdue first, then due date, then priority.
Highlights overdue items with visual indicators.

IMPORTANT: Use this tool instead of search_crm when user asks about "next steps", "tasks", or "action items".`,
      parameters: {
        type: 'object',
        properties: {
          account_name: {
            type: 'string',
            description: 'Account name - returns tasks for all deals under this account',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name - returns tasks for this specific deal',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID if known from prior selection',
          },
          status: {
            type: 'string',
            enum: ['open', 'completed', 'all'],
            description: 'Filter by task status (default: open)',
          },
        },
      },
    },
  },

  instructions: `**For "next steps", "tasks", "action items", "what's overdue"** → Use get_tasks
  - Returns tasks sorted by: overdue first, then due date, then priority
  - Use instead of search_crm for task-related queries`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeGetTasks } = await import('../../tools/tasks-activities.ts');
    return executeGetTasks(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
    );
  },

  triggerExamples: [
    "what's my next step for Home Depot",
    'show tasks for the Pepsi deal',
    "what's overdue",
    'my action items',
  ],
};

export default getTasks;
