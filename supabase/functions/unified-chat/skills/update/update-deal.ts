/**
 * Skill: update_deal
 *
 * Update an existing deal/opportunity — stage, amount, probability, notes.
 * Includes critical LOSS CAPTURE logic for deal closures.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const updateDeal: SkillDefinition = {
  name: 'update_deal',
  displayName: 'Update Deal',
  domain: 'update',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'update_deal',
      description: `Update an existing deal/opportunity. Use when user wants to change deal details like stage, amount, probability, close date, or add notes.

Examples:
- "move home depot to negotiation"
- "update the pepsi deal to $75,000"
- "change close date on lowe's deal to march 15"
- "add notes to the target deal"
- "set probability to 80% on home depot"

The tool resolves deal names using entity context and fuzzy matching, similar to analyze_deal.`,
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'UUID of the deal - ALWAYS use this when available from [ENTITY CONTEXT] or previous tool results.',
          },
          deal_name: {
            type: 'string',
            description: "Name of the deal to search for. Use the base company/deal name (e.g., 'Home Depot'). Company names are valid and will resolve to linked deals.",
          },
          updates: {
            type: 'object',
            description: 'Fields to update on the deal',
            properties: {
              stage: {
                type: 'string',
                enum: ['prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
                description: 'New deal stage',
              },
              amount: {
                type: 'number',
                description: 'New deal value in dollars',
              },
              probability: {
                type: 'number',
                description: 'New win probability 0-100',
              },
              expected_close_date: {
                type: 'string',
                description: 'New expected close date (YYYY-MM-DD format)',
              },
              description: {
                type: 'string',
                description: "Deal description or notes. When user says 'add notes', APPEND to existing description rather than replacing.",
              },
              name: {
                type: 'string',
                description: 'New deal name (rarely changed)',
              },
              close_reason: {
                type: 'string',
                enum: ['won', 'lost_to_competitor', 'lost_no_decision', 'lost_budget', 'lost_timing', 'lost_other'],
                description: 'Reason for closing the deal. Use when deal moves to closed_won or closed_lost.',
              },
              close_notes: {
                type: 'string',
                description: "Additional notes about why the deal was closed (e.g., 'went with HubSpot', 'budget frozen until Q3')",
              },
              competitor_name: {
                type: 'string',
                description: "Name of the competitor on this deal (e.g., 'Salesforce', 'HubSpot', 'Monday CRM')",
              },
              forecast_category: {
                type: 'string',
                enum: ['commit', 'best_case', 'upside', 'pipeline', 'omit'],
                description: "Forecast category for this deal. 'commit' = high confidence will close, 'best_case' = likely with some risk, 'upside' = possible but uncertain, 'pipeline' = early stage, 'omit' = excluded from forecast.",
              },
              key_use_case: {
                type: 'string',
                description: 'Primary customer use case/problem statement for this deal.',
              },
              lead_source: {
                type: 'string',
                description: "Deal lead source (e.g. 'Conference', 'Referral', 'Inbound', 'Outbound').",
              },
              products_positioned: {
                type: 'array',
                items: { type: 'string' },
                description: 'Products/modules positioned in this opportunity.',
              },
            },
          },
          confirmed: {
            type: 'boolean',
            description: 'Set to true ONLY when the user has explicitly confirmed a stage regression or closed-deal reopening after being warned. Never set this on the first attempt.',
          },
        },
        required: ['updates'],
      },
    },
  },

  instructions: `**For "move X to negotiation", "update deal amount", "change close date", "add notes to"** → Use update_deal
  - Resolves deal name from context or by search
  - For "is there a deal with <company>" follow-ups, pass deal_name as the company name
  - When user says "add notes", APPEND to existing description
  - For meeting updates ("I just met with...", "after the conference..."), include raw note in updates.description and also extract explicit fields when present: stage, probability, expected_close_date, competitor_name, lead_source, key_use_case, products_positioned
  - Never treat "delete/remove the deal" as equivalent to closing it as lost. If the user asks to delete, ask them to explicitly confirm a stage change or use the dedicated delete flow when available.
  - **LOSS CAPTURE (CRITICAL):** When the user says a deal is "lost", "dead", "they went with a competitor", "no go", etc., ALWAYS include a close_reason in the updates. Extract the reason from the user's words:
    - "went with competitor" / "chose X" → close_reason: "lost_to_competitor", competitor_name: "[name if mentioned]"
    - "no budget" / "budget cut" → close_reason: "lost_budget"
    - "timing" / "pushed out" / "not now" → close_reason: "lost_timing"
    - "went dark" / "ghosted" / "no decision" → close_reason: "lost_no_decision"
    - Other → close_reason: "lost_other", close_notes: "[user's exact words]"
  - If the user says "lost" but gives NO reason, the tool will prompt them for one before closing. Do NOT skip this.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeUpdateDeal } = await import('../../tools/crm-update.ts');
    return executeUpdateDeal(
      ctx.supabase,
      ctx.args,
      ctx.organizationId,
      ctx.userId,
    );
  },

  triggerExamples: [
    'move home depot to negotiation',
    'update the pepsi deal to $75,000',
    'the deal is dead, they went with a competitor',
    'add notes to the target deal',
  ],
};

export default updateDeal;
