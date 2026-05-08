/**
 * Skill: update_contact
 *
 * Update an existing contact or lead's details.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const updateContact: SkillDefinition = {
  name: 'update_contact',
  displayName: 'Update Contact',
  domain: 'update',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'update_contact',
      description: `Update an existing contact or lead. Use when user wants to change contact details like email, phone, title, or company.

Examples:
- "update john's email to john@newcompany.com"
- "change sarah's title to VP of Sales"
- "add phone number for mike: 555-1234"`,
      parameters: {
        type: 'object',
        properties: {
          contact_id: {
            type: 'string',
            description: "UUID of the contact - use when available from [ENTITY CONTEXT] or previous tool results.",
          },
          contact_name: {
            type: 'string',
            description: 'Name of the contact to search for.',
          },
          contact_email: {
            type: 'string',
            description: 'Existing email address of the contact to update. Use when the user identifies the contact by email.',
          },
          updates: {
            type: 'object',
            description: 'Fields to update',
            properties: {
              email: { type: 'string', description: 'New email address' },
              phone: { type: 'string', description: 'New phone number' },
              title: { type: 'string', description: 'New job title' },
              company: { type: 'string', description: 'New company name' },
              first_name: { type: 'string', description: 'Updated first name' },
              last_name: { type: 'string', description: 'Updated last name' },
              decision_authority: { type: 'string', description: 'Decision-making authority level' },
              qualification_notes: { type: 'string', description: 'Notes about lead qualification. APPEND to existing notes.' },
              lead_source: { type: 'string', description: "How the lead was acquired (e.g. 'referral', 'webinar', 'inbound', 'outbound', 'conference')" },
              budget_status: { type: 'string', enum: ['unknown', 'no_budget', 'budget_pending', 'budget_allocated', 'budget_approved'], description: 'BANT: Budget status' },
              authority_level: { type: 'string', enum: ['unknown', 'influencer', 'recommender', 'decision_maker', 'economic_buyer'], description: 'BANT: Authority level' },
              need_urgency: { type: 'string', enum: ['unknown', 'no_pain', 'nice_to_have', 'important', 'critical', 'hair_on_fire'], description: 'BANT: Need urgency' },
              timeline_status: { type: 'string', enum: ['unknown', 'no_timeline', 'next_year', 'this_quarter', 'this_month', 'immediate'], description: 'BANT: Timeline status' },
              qualification_stage: { type: 'string', enum: ['captured', 'enriched', 'engaged', 'discovering', 'qualified', 'disqualified'], description: 'Lead qualification stage' },
              nurture_stage: { type: 'string', enum: ['new', 'nurturing', 'engaged', 'qualified', 'disqualified', 'recycled'], description: 'Nurture stage for marketing' },
            },
          },
        },
        required: ['updates'],
      },
    },
  },

  instructions: `**For "update email for", "change title", "update phone number"** → Use update_contact
  - Resolves contact by name
  - After extraction save: "sarah@cvs.com" → update_contact for the contact named Sarah`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeUpdateContact } = await import('../../tools/crm-update.ts');
    return executeUpdateContact(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
    );
  },

  triggerExamples: [
    "update john's email to john@newco.com",
    "change sarah's title to VP of Sales",
    'add phone for mike: 555-1234',
  ],
};

export default updateContact;
