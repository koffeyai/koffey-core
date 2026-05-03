/**
 * Skill: get_pipeline_stats
 *
 * Get sales pipeline analytics including total value, stage breakdown,
 * win rates, and velocity metrics. Supports team-level views for managers.
 * Delegates to the extracted handler in tools/analytics.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getPipelineStats: SkillDefinition = {
  name: 'get_pipeline_stats',
  displayName: 'Get Pipeline Stats',
  domain: 'analytics',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_pipeline_stats',
      description: 'Get sales pipeline analytics including total value, stage breakdown, win rates, and velocity metrics. Supports team-level views for managers.',
      parameters: {
        type: 'object',
        properties: {
          time_period: {
            type: 'string',
            enum: ['current', 'this_month', 'this_quarter', 'this_year'],
            description: 'Time period for analytics (defaults to current)',
          },
          team_view: {
            type: 'boolean',
            description: 'If true, shows pipeline for the manager\'s team (requires manager role). Shows per-rep breakdown.',
          },
          rep_name: {
            type: 'string',
            description: 'Filter pipeline to a specific rep by name (manager view only)',
          },
          group_by: {
            type: 'string',
            enum: ['stage', 'rep', 'forecast_category'],
            description: 'How to group the pipeline data (default: stage)',
          },
          date_from: {
            type: 'string',
            description: 'Only include deals created on or after this date (ISO format). Use for QoQ/MoM comparisons.',
          },
          date_to: {
            type: 'string',
            description: 'Only include deals created on or before this date (ISO format).',
          },
        },
      },
    },
  },

  instructions: `**For "pipeline stats", "pipeline value", "stage breakdown", "win rates"** → Use get_pipeline_stats
  - Returns total pipeline value, deals by stage, win rate, and velocity metrics.
  - Supports time_period filter for current/this_month/this_quarter/this_year.
  - Managers can use team_view=true for per-rep breakdown.
  - Use date_from/date_to for QoQ or MoM comparisons.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeGetPipelineStats } = await import('../../tools/analytics.ts');
    return executeGetPipelineStats(ctx.supabase, ctx.organizationId, ctx.args, ctx.userId);
  },

  triggerExamples: [
    'show pipeline stats',
    "what's my pipeline worth",
    'stage breakdown',
    'win rate this quarter',
    'team pipeline view',
  ],
};

export default getPipelineStats;
