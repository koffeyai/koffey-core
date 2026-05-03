/**
 * Skill: update_account
 *
 * Update an existing account/company's details.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const updateAccount: SkillDefinition = {
  name: 'update_account',
  displayName: 'Update Account',
  domain: 'update',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'update_account',
      description: `Update an existing account/company. Use when user wants to change account details like website, industry, phone, or description.

Examples:
- "update home depot's industry to retail"
- "add website for acme corp: acme.com"
- "change the description for target"`,
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: "UUID of the account - use when available from [ENTITY CONTEXT] or previous tool results.",
          },
          account_name: {
            type: 'string',
            description: 'Name of the account to search for.',
          },
          updates: {
            type: 'object',
            description: 'Fields to update',
            properties: {
              name: { type: 'string', description: 'New account name' },
              website: { type: 'string', description: 'Website URL (domain will be auto-extracted)' },
              industry: { type: 'string', description: 'Industry sector' },
              phone: { type: 'string', description: 'Company phone' },
              description: { type: 'string', description: "Account description. APPEND to existing if user says 'add notes'." },
            },
          },
        },
        required: ['updates'],
      },
    },
  },

  instructions: `**For "update industry for", "change website", "add description to account"** → Use update_account
  - Resolves account by name`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeUpdateAccount } = await import('../../tools/crm-update.ts');
    return executeUpdateAccount(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
    );
  },

  triggerExamples: [
    "update home depot's industry to retail",
    'add website for acme corp: acme.com',
    'change the description for target',
  ],
};

export default updateAccount;
