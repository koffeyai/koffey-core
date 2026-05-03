/**
 * Skill: enrich_contacts
 *
 * Look up missing contact info via 3rd party enrichment API.
 * Delegates to the extracted handler in tools/search.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const enrichContacts: SkillDefinition = {
  name: 'enrich_contacts',
  displayName: 'Enrich Contacts',
  domain: 'leads',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'enrich_contacts',
      description: "Look up missing contact info (email, title, company) via 3rd party enrichment API. Use when user says 'enrich', 'look them up', or 'find their emails'.",
      parameters: {
        type: 'object',
        properties: {
          contact_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Contact IDs to enrich',
          },
        },
        required: ['contact_ids'],
      },
    },
  },

  instructions: `**For "enrich", "look them up", "find their emails"** → Use enrich_contacts
  - Requires contact IDs from prior search or entity context
  - Looks up missing email, title, company via enrichment API`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeEnrichContacts } = await import('../../tools/search.ts');
    return executeEnrichContacts(ctx.supabase, ctx.args, ctx.organizationId);
  },

  triggerExamples: [
    'enrich these contacts',
    'look them up',
    'find their emails',
  ],
};

export default enrichContacts;
