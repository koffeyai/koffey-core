/**
 * Skill: update_stakeholder_role
 *
 * Add or update a contact's role on a deal.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const updateStakeholderRole: SkillDefinition = {
  name: 'update_stakeholder_role',
  displayName: 'Update Stakeholder Role',
  domain: 'update',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'update_stakeholder_role',
      description: "Add or update a contact's role on a deal (e.g. decision_maker, champion, blocker). Use when the user mentions a contact's role in a deal, like 'Sarah is the champion on the Acme deal'.",
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'Deal UUID',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name (used for fuzzy lookup if deal_id not provided)',
          },
          contact_id: {
            type: 'string',
            description: 'Contact UUID',
          },
          contact_name: {
            type: 'string',
            description: 'Contact name (used for fuzzy lookup if contact_id not provided)',
          },
          role: {
            type: 'string',
            enum: ['decision_maker', 'influencer', 'gatekeeper', 'user', 'champion', 'blocker', 'technical_buyer', 'economic_buyer'],
            description: "The contact's role in this deal",
          },
        },
        required: ['role'],
      },
    },
  },

  instructions: `**For "Sarah is the champion", "mark John as decision maker"** → Use update_stakeholder_role
  - Links a contact to a deal with a specific buying role`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeUpdateStakeholderRole } = await import('../../tools/crm-update.ts');
    return executeUpdateStakeholderRole(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
    );
  },

  triggerExamples: [
    'Sarah is the champion on the Acme deal',
    'mark John as decision maker for Home Depot',
    'Mike is the blocker on this deal',
  ],
};

export default updateStakeholderRole;
