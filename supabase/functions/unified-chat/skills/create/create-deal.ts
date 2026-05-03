/**
 * Skill: create_deal
 *
 * Create a new sales deal/opportunity in the CRM.
 * Delegates to the extracted handler in tools/crm-create.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const createDeal: SkillDefinition = {
  name: 'create_deal',
  displayName: 'Create Deal',
  domain: 'create',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'create_deal',
      description: "Create a new sales deal/opportunity. REQUIRES account_name and amount. close_date and contact_name are optional: if close_date is omitted the system uses a default expected close date, and if contact_name is omitted the deal is still created without a primary contact.",
      parameters: {
        type: 'object',
        properties: {
          account_name: {
            type: 'string',
            description: 'Name of the company/account (required - will find existing or prompt to create)',
          },
          amount: {
            type: 'number',
            description: 'Deal value in dollars (required)',
          },
          name: {
            type: 'string',
            description: "Deal/opportunity name (optional). OMIT this field unless the user explicitly named the deal. The system auto-generates 'Account - $Amount' when omitted. Do NOT invent names like 'Infrastructure Evaluation' or 'Expansion Opportunity'.",
          },
          stage: {
            type: 'string',
            enum: ['prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
            description: 'Deal stage (defaults to prospecting)',
          },
          probability: {
            type: 'number',
            description: 'Win probability 0-100',
          },
          close_date: {
            type: 'string',
            description: 'Expected close date. Accepts YYYY-MM-DD or natural language like "end of June", "Q3", "next month", "Q3 2026".',
          },
          contact_name: {
            type: 'string',
            description: 'Primary contact name at the account',
          },
          contact_email: {
            type: 'string',
            description: 'Primary contact email. If the contact does not exist yet, this lets the system create them before finishing the deal.',
          },
          lead_source: {
            type: 'string',
            description: 'Optional source attribution (e.g., inbound, referral, outbound, partner)',
          },
          notes: {
            type: 'string',
            description: 'Optional deal notes or meeting context to store as deal description',
          },
        },
        required: ['account_name', 'amount'],
      },
    },
  },

  instructions: `**For "add deal", "new deal with X for $Y", "create opportunity"** → Use create_deal
  - REQUIRES account_name AND amount. If either is missing, ASK — do NOT guess.
  - close_date and contact_name are OPTIONAL.
  - If close_date is missing, still call create_deal — the system auto-defaults expected close date.
  - If contact_name is missing, still call create_deal without a primary contact.
  - If contact_name IS provided but ambiguous/missing in CRM, the system will ask a clarification question.
  - If the user shares context notes, capture them in notes so the deal has categorized context from day one.
  - If the user later provides a full name plus email for a missing primary contact, include BOTH contact_name and contact_email so the system can create that contact and continue the deal workflow.
  - If the user provides context clues for a deal name (e.g. "cloud migration deal"), use that. Otherwise OMIT the name parameter — the system auto-generates "Account - $Amount".
  - NEVER invent deal names, amounts, or probabilities.
  - NEVER pass a name parameter unless the user explicitly named the deal.
  - "add this deal for 45k with frito lays, closing next month, contact is sarah" → call create_deal immediately with all fields
  - "new 100k deal with acme corp" → call create_deal immediately
  - "new deal with acme" → ASK for amount only`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeCreateDeal } = await import('../../tools/crm-create.ts');
    return executeCreateDeal(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
      ctx.sessionId,
      ctx.sessionTable,
    );
  },

  triggerExamples: [
    'add deal for 50k with pepsi',
    'new deal with acme corp',
    'create a 100k opportunity with target',
  ],
};

export default createDeal;
