/**
 * Skill: create_contact
 *
 * Create a new contact/lead in the CRM.
 * Delegates to the extracted handler in tools/crm-create.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const createContact: SkillDefinition = {
  name: 'create_contact',
  displayName: 'Create Contact',
  domain: 'create',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'create_contact',
      description: "Create a new contact/lead in the CRM. The system will auto-link to an account based on email domain (handles subdomains like us.ibm.com → ibm.com). New contacts are always created as LEADS and promoted to CONTACTS when their specific deal closes.",
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Full name of the contact (required)',
          },
          email: {
            type: 'string',
            description: 'Email address - domain will be used to auto-link to account (supports subdomains)',
          },
          phone: {
            type: 'string',
            description: 'Phone number',
          },
          company: {
            type: 'string',
            description: "Company name - used if email domain doesn't match an account or is a public domain",
          },
          title: {
            type: 'string',
            description: 'Job title/position',
          },
          is_personal: {
            type: 'boolean',
            description: 'Set to true if this is a freelancer/individual with no company - creates a Personal Account for them',
          },
          lead_source: {
            type: 'string',
            description: "How this lead was acquired (e.g. 'LinkedIn', 'Referral', 'Conference', 'Inbound', 'Cold Call', 'Website')",
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the contact',
          },
          confirmed: {
            type: 'boolean',
            description: 'Set true only when user explicitly confirms a previously proposed contact/account creation (e.g. replies "yes").',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "add contact", "new contact", "add a lead"** → Use create_contact
  - Auto-links to accounts via email domain matching (handles subdomains like us.ibm.com → ibm.com)
  - New contacts are created as LEADS and promoted to CONTACTS when their deal closes
  - If is_personal=true, creates a Personal Account for freelancers/individuals
  - If the system asks for confirmation because BOTH contact and company are new, and user replies "yes/confirm", call create_contact with confirmed=true.
  - On confirm replies, include name/company if user restated them; otherwise confirmed=true is enough because pending details are stored in session.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeCreateContact } = await import('../../tools/crm-create.ts');
    return executeCreateContact(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
      ctx.sessionId,
      ctx.sessionTable,
    );
  },

  triggerExamples: [
    'add contact Sarah at Pepsi',
    'create a new lead from the conference',
    'add john@acme.com as a contact',
  ],
};

export default createContact;
