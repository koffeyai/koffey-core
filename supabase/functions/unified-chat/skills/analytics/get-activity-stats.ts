/**
 * Skill: get_activity_stats
 *
 * Get aggregated activity statistics broken down by type, outcome, rep, or day.
 * Delegates to the extracted handler in tools/analytics.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getActivityStats: SkillDefinition = {
  name: 'get_activity_stats',
  displayName: 'Get Activity Stats',
  domain: 'analytics',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_activity_stats',
      description: 'Get aggregated activity statistics broken down by type, outcome, rep, or day. Use for activity reporting, rep performance tracking, and engagement analysis.',
      parameters: {
        type: 'object',
        properties: {
          date_from: {
            type: 'string',
            description: 'Start date (ISO format, default 7 days ago)',
          },
          date_to: {
            type: 'string',
            description: 'End date (ISO format, default today)',
          },
          rep_name: {
            type: 'string',
            description: 'Filter by rep name (fuzzy match)',
          },
          group_by: {
            type: 'string',
            enum: ['type', 'outcome', 'rep', 'day'],
            description: "Primary grouping dimension (default 'type')",
          },
        },
      },
    },
  },

  instructions: `**For "activity stats", "how many calls/meetings", "rep activity"** → Use get_activity_stats
  - Returns activity counts by type, outcome, rep, or day
  - Default date range is last 7 days`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeGetActivityStats } = await import('../../tools/analytics.ts');
    return executeGetActivityStats(ctx.supabase, ctx.args, ctx.organizationId);
  },

  triggerExamples: [
    'how many calls this week',
    'activity breakdown by rep',
    'meeting stats for the last month',
  ],
};

export default getActivityStats;
