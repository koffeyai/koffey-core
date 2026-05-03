/**
 * Skill: delete_deal
 *
 * Permanently delete an existing deal/opportunity with explicit confirmation.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const deleteDeal: SkillDefinition = {
  name: 'delete_deal',
  displayName: 'Delete Deal',
  domain: 'update',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'delete_deal',
      description: `Permanently delete an existing deal/opportunity. Use only when the user explicitly asks to delete/remove a deal record (not when they mean "mark lost").

Examples:
- "delete the acme deal"
- "remove this opportunity from CRM"
- "permanently delete the apex expansion deal"

Deletion is destructive. The tool enforces an explicit confirmation step and writes an audit log entry.`,
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'UUID of the deal. Prefer this whenever available from context or prior tool results.',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name or company hint used to resolve the deal when id is unavailable.',
          },
          delete_reason: {
            type: 'string',
            description: 'Optional reason for deletion, recorded in audit logs.',
          },
          confirmed: {
            type: 'boolean',
            description: 'Set true only after the user explicitly confirms deletion.',
          },
        },
      },
    },
  },

  instructions: `**For "delete deal", "remove opportunity", "permanently delete this deal"** → Use delete_deal
  - Do not map delete/remove requests to closed_lost.
  - Always run the delete confirmation flow first.
  - Only pass confirmed: true after the user explicitly confirms deletion.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeDeleteDeal } = await import('../../tools/crm-update.ts');
    return executeDeleteDeal(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
    );
  },

  triggerExamples: [
    'delete the acme deal',
    'remove this opportunity',
    'permanently delete apex expansion',
  ],
};

export default deleteDeal;
