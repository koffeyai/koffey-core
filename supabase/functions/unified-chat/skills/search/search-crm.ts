/**
 * Skill: search_crm
 *
 * Search for accounts, contacts, deals, or activities in the CRM.
 * Delegates to the extracted handler in tools/search.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const searchCrm: SkillDefinition = {
  name: 'search_crm',
  displayName: 'Search CRM',
  domain: 'search',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'search_crm',
      description: "Search for accounts, contacts, deals, or activities in the CRM. Use for finding specific records by name, listing entities, or checking for duplicates. NOTE: For 'oldest deal', 'stale deals', or 'sales cycle' questions, prefer get_sales_cycle_analytics which returns oldest_open_deal directly.",
      parameters: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            enum: ['accounts', 'contacts', 'deals', 'activities'],
            description: 'The type of entity to search for',
          },
          query: {
            type: 'string',
            description: 'Search term (name, email, company, etc.)',
          },
          list_all: {
            type: 'boolean',
            description: 'If true, list all records of this type (up to 50)',
          },
          filters: {
            type: 'object',
            description: 'Optional filters. Use probability_gte/probability_lte to filter by win probability. Use stage_not_in to exclude closed deals.',
            properties: {
              amount_gt: { type: 'number' },
              amount_lt: { type: 'number' },
              stage: { type: 'string', description: 'Filter to a specific stage' },
              stage_not_in: {
                type: 'array',
                items: { type: 'string' },
                description: "Exclude these stages (e.g. ['closed_won', 'closed_lost'] to show only open pipeline)",
              },
              probability_gte: { type: 'number', description: "Minimum probability (0-100). Use >= 50 for 'high probability' or 'best' deals." },
              probability_lte: { type: 'number', description: "Maximum probability (0-100). ONLY use for 'at-risk deals' (<=25). Do NOT use for 'lowest probability' — instead sort_by probability asc without this filter." },
              industry: { type: 'string' },
              competitor_name: { type: 'string', description: "Filter deals by competitor name (e.g. 'HubSpot', 'Salesforce'). Only works with entity_type='deals'." },
              lead_source: { type: 'string', description: "Filter contacts by lead source (e.g. 'referral', 'inbound', 'outbound'). Only works with entity_type='contacts'." },
              nurture_stage: { type: 'string', description: "Filter contacts by nurture stage (new, nurturing, engaged, qualified, disqualified, recycled). Only works with entity_type='contacts'." },
              deal_id: { type: 'string', description: "Filter contacts linked to a specific deal via deal_contacts table. Only works with entity_type='contacts'." },
              activity_type: { type: 'string', description: "Filter activities by type (e.g. 'meeting', 'call', 'email', 'note'). Only works with entity_type='activities'." },
              date_from: { type: 'string', description: 'Filter by date (ISO format). For activities: filters by scheduled_at (when meeting/call happens). For other entities: filters by created_at.' },
              date_to: { type: 'string', description: 'Filter by date (ISO format). For activities: filters by scheduled_at. For other entities: filters by created_at.' },
              completed: { type: 'boolean', description: "Filter activities by completion status. Only works with entity_type='activities'." },
              never_contacted: { type: 'boolean', description: "Filter contacts that have never been contacted (no activities). Only works with entity_type='contacts'." },
            },
          },
          sort_by: {
            type: 'string',
            enum: ['created_at', 'updated_at', 'amount', 'close_date', 'name', 'probability', 'scheduled_at', 'lead_score'],
            description: "Field to sort results by. For 'lowest probability deal': sort_by=probability, sort_direction=asc, NO probability_lte filter. For 'highest probability': sort_by=probability, sort_direction=desc. For 'biggest deal': sort_by=amount, sort_direction=desc. For activities: sort_by=scheduled_at. For 'hottest leads': sort_by=lead_score, sort_direction=desc (contacts only).",
          },
          sort_direction: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction: asc (oldest/smallest first) or desc (newest/largest first)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter results to only entities tagged with these labels (e.g. ["enterprise", "partner-referred"])',
          },
        },
        required: ['entity_type'],
      },
    },
  },

  instructions: `**For "find X deal", "show my deals", "list deals"** → Use search_crm

**For "is there a deal with <company>" / "do we have a deal with <company>"** → Use search_crm:
  - entity_type: "deals"
  - query: "<company name>"
  - This supports lookup by deal fields plus linked account/contact records.

**For contact lookup requests** ("find John at Acme", "search contacts by title/source/company") → Use search_crm with entity_type "contacts" and pass the full query text; contact search spans name, email, company, title, phone, notes, and lead-source fields.

**For "highest probability deals", "best deals", "most likely to close", "top deals"** → Use search_crm with SMART FILTERS:
  - entity_type: "deals"
  - filters: { stage_not_in: ["closed_won", "closed_lost"], probability_gte: 50 }
  - sort_by: "probability", sort_direction: "desc"
  - This shows ONLY open, high-probability deals — not all deals

**For "lowest probability deal", "weakest deal", "least likely to close"** → Use search_crm:
  - entity_type: "deals"
  - filters: { stage_not_in: ["closed_won", "closed_lost"] }
  - sort_by: "probability", sort_direction: "asc"
  - Do NOT add probability_lte filter — you want ALL open deals sorted ascending so the first result IS the lowest
  - The first result in the response is the answer

**For "at-risk deals", "deals in trouble"** → Use search_crm:
  - entity_type: "deals"
  - filters: { stage_not_in: ["closed_won", "closed_lost"], probability_lte: 25 }
  - sort_by: "probability", sort_direction: "asc"
  - This filters to only low-probability open deals

  - ALWAYS exclude closed deals when asking about probability/pipeline unless user explicitly asks about closed deals

**For "where were we", "what were we working on", "catch me up", "what's changed"** → This is a resumption query. Call search_crm with entity_type "deals", sort_by "updated_at" desc, limit 5 to show recently touched deals. Then call search_crm again with entity_type "activities", sort_by "created_at" desc, limit 5. Summarize: "Here's what's been happening: [recently modified deals] and [recent activities]." NEVER say "I don't have previous conversation history."

**For "who haven't I touched in X days/weeks"** → Use search_crm with entity_type "contacts", sorted by updated_at ascending. Return individual contact names with last touch dates — NEVER return just a count.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeSearch } = await import('../../tools/search.ts');
    return executeSearch(ctx.supabase, ctx.args, ctx.organizationId);
  },

  triggerExamples: [
    'show my deals',
    'find acme',
    'list contacts',
    'search for pepsi',
    'who are my accounts',
    'highest probability deals',
  ],
};

export default searchCrm;
