/**
 * Skill: query_web_events
 *
 * Query website visitor events and engagement data.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const queryWebEvents: SkillDefinition = {
  name: 'query_web_events',
  displayName: 'Query Web Events',
  domain: 'admin',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'query_web_events',
      description: 'Query website visitor events and engagement data. Shows page visits, time on page, scroll depth, and UTM attribution. Use for marketing analysis, account-based intent signals, and campaign effectiveness.',
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Filter by account UUID',
          },
          visitor_id: {
            type: 'string',
            description: 'Filter by specific visitor UUID',
          },
          page_category: {
            type: 'string',
            enum: ['pricing', 'demo', 'case_study', 'blog', 'docs', 'product', 'homepage', 'careers'],
            description: 'Filter by page category',
          },
          date_from: {
            type: 'string',
            description: 'Start date (ISO format)',
          },
          date_to: {
            type: 'string',
            description: 'End date (ISO format)',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 50)',
          },
        },
      },
    },
  },

  instructions: `**For "website visitors", "web engagement", "who visited pricing page"** → Use query_web_events
  - Shows page visits, time on page, scroll depth, UTM attribution
  - Use for account-based intent signals and campaign effectiveness`,

  execute: async (_ctx: ToolExecutionContext) => {
    throw new Error('LEGACY_FALLTHROUGH');
  },

  triggerExamples: [
    'who visited our pricing page',
    'web engagement for Home Depot',
    'website activity this week',
  ],
};

export default queryWebEvents;
