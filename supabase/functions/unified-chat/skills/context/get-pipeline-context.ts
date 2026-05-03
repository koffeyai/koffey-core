/**
 * Skill: get_pipeline_context
 *
 * Fetch comprehensive pipeline summary from the get_pipeline_context_for_llm
 * Postgres RPC. Returns summary metrics, stage/forecast breakdowns,
 * at-risk deals, upcoming closes, recent wins/losses, and quota attainment.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

const getPipelineContext: SkillDefinition = {
  name: 'get_pipeline_context',
  displayName: 'Get Pipeline Context',
  domain: 'analytics',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_pipeline_context',
      description:
        'Fetch a comprehensive pipeline summary in a single call: total value, weighted value, stage/forecast breakdowns, at-risk deals, closing soon, recent wins/losses, and quota attainment. Defaults to current quarter. Use when the user asks broad pipeline questions like "how is my pipeline looking" or "give me a pipeline overview".',
      parameters: {
        type: 'object',
        properties: {
          period_start: {
            type: 'string',
            description:
              'Start date for the pipeline period (YYYY-MM-DD). Defaults to the start of the current quarter if not specified.',
          },
          period_end: {
            type: 'string',
            description:
              'End date for the pipeline period (YYYY-MM-DD). Defaults to the end of the current quarter if not specified.',
          },
          scope: {
            type: 'string',
            enum: ['mine', 'org'],
            description:
              'Pipeline scope. "mine" = only deals assigned to the user (default for "my pipeline", "my deals"). "org" = all deals in the organization (for "show all deals", "total pipeline", "company pipeline", or any query not using possessive "my").',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**IMPORTANT: Do NOT use get_pipeline_context for "show all deals", "list my deals", or "how many deals do I have". Those are listing queries — use search_crm with list_all=true instead.**

**For "how is my pipeline", "pipeline overview", "pipeline summary", "how are we tracking", "quota attainment", "forecast summary"** → Use get_pipeline_context
- Returns a complete pipeline snapshot: summary metrics, stage & forecast breakdowns, at-risk deals, deals closing soon, recent wins/losses, unscheduled deals, and quota
- Defaults to the current quarter — pass period_start/period_end to override
- Use this INSTEAD of get_pipeline_stats when the user wants a broad pipeline narrative, not just a single metric

**Scope rules:**
- "my pipeline", "my deals", "how am I doing" → scope: "mine" (only deals assigned to the user)
- "total pipeline", "company pipeline", "all deals closing", "what deals close this month" → scope: "org" (all org deals)
- When in doubt, use "org" — a user asking about pipeline expects to see everything they have access to
- The response now includes an "unscheduled" section for deals without close dates — always mention these if present`,

  execute: async (ctx: ToolExecutionContext) => {
    const args = (ctx.args || {}) as {
      period_start?: string;
      period_end?: string;
      scope?: 'mine' | 'org';
    };

    const rpcArgs: Record<string, unknown> = {
      p_user_id: ctx.userId,
      p_organization_id: ctx.organizationId,
      p_scope: args.scope || 'mine',
    };

    // Only pass period args if provided — RPC defaults to current quarter
    if (args.period_start) {
      rpcArgs.p_period_start = args.period_start;
    }
    if (args.period_end) {
      rpcArgs.p_period_end = args.period_end;
    }

    const { data, error } = await ctx.supabase.rpc('get_pipeline_context_for_llm', rpcArgs);

    if (error) {
      return { success: false, message: `Error fetching pipeline context: ${error.message}` };
    }

    if (!data) {
      return {
        success: false,
        message: 'Could not retrieve pipeline context. Please try again.',
      };
    }

    // Build citation rows from pipeline data so verification doesn't block
    const citationRows: any[] = [];
    for (const section of ['at_risk', 'closing_soon', 'recent_wins', 'recent_losses', 'unscheduled']) {
      const items = data[section];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item?.id && item?.name) {
            citationRows.push({ id: item.id, name: item.name, amount: item.amount, stage: item.stage });
          }
        }
      }
    }
    // Also extract deals from by_stage breakdown
    if (Array.isArray(data.by_stage)) {
      for (const entry of data.by_stage) {
        if (entry?.stage) {
          citationRows.push({ stage: entry.stage, count: entry.count, value: entry.value });
        }
      }
    }

    return {
      ...data,
      __trusted_context: true,
      __citationRows: citationRows.slice(0, 20),
    };
  },

  triggerExamples: [
    "how's my pipeline looking?",
    'pipeline overview',
    'give me a forecast summary',
    'how are we tracking this quarter?',
    'quota attainment update',
    'any at-risk deals?',
  ],
};

export default getPipelineContext;
