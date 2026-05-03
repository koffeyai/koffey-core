/**
 * Skill: get_attribution
 *
 * Get marketing attribution data — campaigns and sources that generated pipeline/revenue.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getAttribution: SkillDefinition = {
  name: 'get_attribution',
  displayName: 'Get Attribution',
  domain: 'admin',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'get_attribution',
      description: 'Get marketing attribution data. Shows which campaigns and sources generated pipeline and revenue.',
      parameters: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            enum: ['first_touch', 'last_touch', 'pipeline_by_source', 'campaign_roi'],
            description: "Attribution model to use. Use 'campaign_roi' to see campaign performance with spend vs. pipeline generated.",
          },
          time_period: {
            type: 'string',
            enum: ['this_month', 'this_quarter', 'this_year', 'all'],
            description: 'Time period to analyze',
          },
        },
      },
    },
  },

  instructions: `**For "attribution", "campaign ROI", "pipeline by source"** → Use get_attribution
  - Supports first_touch, last_touch, pipeline_by_source, campaign_roi models`,

  execute: async (_ctx: ToolExecutionContext) => {
    throw new Error('LEGACY_FALLTHROUGH');
  },

  triggerExamples: [
    'show marketing attribution',
    'campaign ROI this quarter',
    'pipeline by source',
  ],
};

export default getAttribution;
