/**
 * Skill: create_account
 *
 * Create a new company/account in the CRM.
 * Delegates to the extracted handler in tools/crm-create.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const createAccount: SkillDefinition = {
  name: 'create_account',
  displayName: 'Create Account',
  domain: 'create',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'create_account',
      description: "Create a new company/account in the CRM. When a website/domain is provided, the account is enriched from public website data before it is saved. New accounts are created as 'prospect' type and become 'customer' when they have a closed-won deal.",
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Company name (required)',
          },
          website: {
            type: 'string',
            description: 'Company website - domain will be auto-extracted for email matching',
          },
          industry: {
            type: 'string',
            description: 'Industry sector',
          },
          phone: {
            type: 'string',
            description: 'Company phone',
          },
          address: {
            type: 'string',
            description: 'Company address',
          },
          notes: {
            type: 'string',
            description: 'Optional account notes or meeting summary to store as account context',
          },
          description: {
            type: 'string',
            description: 'Optional long-form account description/context',
          },
          contact_name: {
            type: 'string',
            description: 'Optional associated contact name mentioned by the user',
          },
          contact_email: {
            type: 'string',
            description: 'Optional associated contact email mentioned by the user',
          },
          associated_contacts: {
            type: 'string',
            description: 'Optional free-text list of associated contacts mentioned by the user',
          },
          domain: {
            type: 'string',
            description: "Email domain (e.g., 'homedepot.com') - auto-extracted from website if not provided",
          },
        },
        required: ['name'],
      },
    },
  },

  instructions: `**For "add company", "new account", "create account"** → Use create_account
  - Treat terse CRM commands like "add Acme" or "create Technova" as account creation unless the user clearly means a deal, contact, task, or activity
  - New accounts start as 'prospect' type, become 'customer' on closed-won deal
  - Domain auto-extracted from website for email matching and public website enrichment
  - If the user gives a domain or website, pass it; do not ask for industry/phone/description first because enrichment can fill those fields
  - If the user provides notes/context about the account, pass notes (or description) so it is captured during creation
  - If the user provides associated contacts, pass contact_name/contact_email or associated_contacts so the system does not ask for that information again`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeCreateAccount } = await import('../../tools/crm-create.ts');
    return executeCreateAccount(ctx.supabase, ctx.args, ctx.organizationId, ctx.userId);
  },

  triggerExamples: [
    'add acme',
    'add Acme Corp as an account',
    'create a new company called Target',
  ],
};

export default createAccount;
