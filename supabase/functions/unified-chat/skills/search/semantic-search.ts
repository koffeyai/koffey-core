/**
 * Skill: semantic_search
 *
 * Search CRM data using natural language meaning (semantic similarity).
 * Delegates to the extracted handler in tools/search.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const semanticSearch: SkillDefinition = {
  name: 'semantic_search',
  displayName: 'Semantic Search',
  domain: 'search',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'semantic_search',
      description: "Search CRM data using natural language meaning (semantic similarity). Use when the user's query is conceptual or doesn't match exact names — e.g. 'deals related to cloud migration', 'contacts in the healthcare space', 'notes about budget concerns'. Falls back to this when search_crm returns no results for a fuzzy query.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query',
          },
          entity_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['account', 'contact', 'deal', 'activity', 'task', 'source_document', 'deal_note'],
            },
            description: 'Entity types to search (defaults to account, contact, deal)',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default 10)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags to filter results (e.g. ["enterprise", "healthcare"])',
          },
        },
        required: ['query'],
      },
    },
  },

  instructions: `**For conceptual or fuzzy queries** → Use semantic_search
  - Use when search_crm returns no results for a fuzzy query
  - Good for: "deals related to cloud migration", "contacts in healthcare", "notes about budget concerns"
  - Falls back to semantic similarity matching across all CRM data`,

  execute: async (ctx: ToolExecutionContext) => {
    const { executeSemanticSearch } = await import('../../tools/search.ts');
    return executeSemanticSearch(ctx.supabase, ctx.args, ctx.organizationId);
  },

  triggerExamples: [
    'deals related to cloud migration',
    'contacts in the healthcare space',
    'notes about budget concerns',
  ],
};

export default semanticSearch;
