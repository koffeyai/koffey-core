/**
 * Skill: get_lead_funnel
 *
 * Get lead funnel metrics with conversion rates per qualification stage.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getLeadFunnel: SkillDefinition = {
  name: 'get_lead_funnel',
  displayName: 'Get Lead Funnel',
  domain: 'leads',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'get_lead_funnel',
      description: 'Get lead funnel metrics showing contacts at each qualification stage with conversion rates. Use for marketing funnel analysis, lead pipeline health, and conversion optimization.',
      parameters: {
        type: 'object',
        properties: {
          date_from: {
            type: 'string',
            description: 'Start date filter for contacts created (ISO format)',
          },
          date_to: {
            type: 'string',
            description: 'End date filter for contacts created (ISO format)',
          },
          lead_source: {
            type: 'string',
            description: "Filter by lead source (e.g. 'referral', 'inbound', 'webinar')",
          },
        },
      },
    },
  },

  instructions: `**For "lead funnel", "conversion rates", "funnel analysis"** → Use get_lead_funnel
  - Shows contacts at each qualification stage with conversion rates
  - Supports filtering by lead source and date range`,

  execute: async (ctx: ToolExecutionContext) => {
    const { date_from, date_to, lead_source } = ctx.args as {
      date_from?: string;
      date_to?: string;
      lead_source?: string;
    };

    let query = ctx.supabase
      .from('contacts')
      .select('qualification_stage')
      .eq('organization_id', ctx.organizationId)
      .not('qualification_stage', 'is', null);

    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', date_to);
    if (lead_source) query = query.eq('lead_source', lead_source);

    const { data, error } = await query;
    if (error) throw error;

    // Define funnel stages in order
    const stageOrder = ['captured', 'enriched', 'engaged', 'discovering', 'qualified', 'disqualified'];

    // Count per stage
    const stageCounts: Record<string, number> = {};
    for (const stage of stageOrder) stageCounts[stage] = 0;
    for (const row of data || []) {
      const s = row.qualification_stage as string;
      if (s in stageCounts) stageCounts[s]++;
      else stageCounts[s] = (stageCounts[s] || 0) + 1;
    }

    const total = (data || []).length;

    // Build funnel with conversion rates
    // Conversion = stage count / previous stage count (disqualified excluded from funnel progression)
    const progressionStages = stageOrder.filter((s) => s !== 'disqualified');
    const funnel = progressionStages.map((stage, i) => {
      const count = stageCounts[stage] || 0;
      const prevCount = i > 0 ? stageCounts[progressionStages[i - 1]] || 0 : total;
      const conversionRate = prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : 0;
      return {
        stage,
        count,
        percentage_of_total: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        conversion_from_previous: i === 0 ? null : conversionRate,
      };
    });

    return {
      total_contacts: total,
      funnel,
      disqualified: stageCounts['disqualified'] || 0,
      filters: { date_from: date_from || null, date_to: date_to || null, lead_source: lead_source || null },
    };
  },

  triggerExamples: [
    'show me the lead funnel',
    'what are our conversion rates',
    'funnel analysis for inbound leads',
  ],
};

export default getLeadFunnel;
