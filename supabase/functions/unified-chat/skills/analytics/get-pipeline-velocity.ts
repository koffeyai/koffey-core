/**
 * Skill: get_pipeline_velocity
 *
 * Analyze pipeline velocity by tracking deal stage transitions over time.
 * Delegates to the extracted handler in tools/analytics.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getPipelineVelocity: SkillDefinition = {
  name: 'get_pipeline_velocity',
  displayName: 'Get Pipeline Velocity',
  domain: 'analytics',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'get_pipeline_velocity',
      description: 'Analyze pipeline velocity by tracking deal stage transitions over time. Shows how long deals spend in each stage, average/median dwell times, and recent transitions. Use for sales cycle optimization and pipeline health analysis.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'Optional: filter to a specific deal UUID',
          },
          date_from: {
            type: 'string',
            description: 'Start date for analysis (ISO format)',
          },
          date_to: {
            type: 'string',
            description: 'End date for analysis (ISO format)',
          },
        },
      },
    },
  },

  instructions: `**For "pipeline velocity", "stage dwell time", "how long in each stage"** → Use get_pipeline_velocity
  - Tracks deal stage transitions over time
  - Shows average/median dwell times per stage
  - Use for sales cycle optimization`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeGetPipelineVelocity } = await import('../../tools/analytics.ts');
    return executeGetPipelineVelocity(ctx.supabase, ctx.args, ctx.organizationId);
  },

  triggerExamples: [
    'pipeline velocity',
    'how long do deals spend in each stage',
    'stage transition analysis',
  ],
};

export default getPipelineVelocity;
