/**
 * Skill: get_sales_cycle_analytics
 *
 * PREFERRED tool for oldest deals, pipeline age, average sales cycle,
 * stale deals, and deals needing attention.
 * Delegates to the extracted handler in tools/analytics.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getSalesCycleAnalytics: SkillDefinition = {
  name: 'get_sales_cycle_analytics',
  displayName: 'Get Sales Cycle Analytics',
  domain: 'analytics',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'get_sales_cycle_analytics',
      description: "PREFERRED TOOL for: oldest deals, pipeline age, average sales cycle, stale deals, deals needing attention, sales velocity. Returns oldest_open_deal directly - more efficient than sorting search results. Use for any question about 'what's my oldest deal?', 'which deals are stale?', 'average time to close?', 'deals that need attention'.",
      parameters: {
        type: 'object',
        properties: {
          amount_min: {
            type: 'number',
            description: 'Minimum deal amount to include (e.g., 100000 for deals over $100k)',
          },
          amount_max: {
            type: 'number',
            description: 'Maximum deal amount to include (e.g., 50000 for deals under $50k)',
          },
          analysis_type: {
            type: 'string',
            enum: ['full', 'stale_only', 'velocity_only'],
            description: 'Type of analysis: full (all metrics), stale_only (deals needing attention), velocity_only (sales cycle focus)',
          },
        },
      },
    },
  },

  instructions: `**For "oldest deal", "sales cycle", "stale deals", "deals needing attention"** → Use get_sales_cycle_analytics
  - Returns oldest_open_deal, average_sales_cycle_days, stale_deals directly
  - More efficient than sorting search results
  - PREFERRED over search_crm for these query types`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeGetSalesCycleAnalytics } = await import('../../tools/analytics.ts');
    return executeGetSalesCycleAnalytics(ctx.supabase, ctx.args, ctx.organizationId);
  },

  triggerExamples: [
    "what's my oldest deal",
    'which deals are stale',
    'average time to close',
    'deals needing attention',
  ],
};

export default getSalesCycleAnalytics;
