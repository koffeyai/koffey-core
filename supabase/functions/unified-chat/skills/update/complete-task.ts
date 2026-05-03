/**
 * Skill: complete_task
 *
 * Mark a task as completed or update task details.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const completeTask: SkillDefinition = {
  name: 'complete_task',
  displayName: 'Complete Task',
  domain: 'update',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'complete_task',
      description: `Mark a task as completed, or update task details. Use when user says:
- "mark the follow-up call as done"
- "complete the proposal task for home depot"
- "I finished the discovery call"
- "update the due date on the pepsi task"

Resolves task by name/description matching within an account or deal context.`,
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'UUID of the task if known from prior resolution',
          },
          task_description: {
            type: 'string',
            description: 'Description or title of the task to find (fuzzy match)',
          },
          account_name: {
            type: 'string',
            description: 'Account name to narrow task search',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name to narrow task search',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID if known',
          },
          action: {
            type: 'string',
            enum: ['complete', 'update'],
            description: "Action to take: 'complete' marks as done (default), 'update' changes task fields",
          },
          updates: {
            type: 'object',
            description: "Fields to update (only when action='update')",
            properties: {
              title: {
                type: 'string',
                description: 'New task title',
              },
              due_date: {
                type: 'string',
                description: 'New due date (YYYY-MM-DD or natural language)',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'New priority',
              },
            },
          },
        },
      },
    },
  },

  instructions: `**For "mark task as done", "completed the follow-up", "I finished"** → Use complete_task
  - Fuzzy matches task title within deal/account context`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeCompleteTask } = await import('../../tools/tasks-activities.ts');
    return executeCompleteTask(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
      ctx.entityContext,
    );
  },

  triggerExamples: [
    'mark the follow-up call as done',
    'I finished the discovery call',
    'complete the proposal task for home depot',
  ],
};

export default completeTask;
