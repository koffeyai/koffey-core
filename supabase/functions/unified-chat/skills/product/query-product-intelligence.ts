/**
 * Skill: query_product_intelligence
 *
 * Query structured product intelligence from sales conversations.
 * Uses the product_mentions table and product_mention_summary view.
 * Supports: mentions_summary, deal_list, competitive, revenue_attribution,
 * customer_requirements. feature_gaps returns a "not yet available" note.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

function getTimePeriodFilter(period?: string): string | null {
  const now = new Date();
  switch (period) {
    case 'this_month': {
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }
    case 'this_quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), qStart, 1).toISOString().split('T')[0];
    }
    case 'this_year': {
      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    }
    case 'all':
    default:
      return null;
  }
}

const queryProductIntelligence: SkillDefinition = {
  name: 'query_product_intelligence',
  displayName: 'Query Product Intelligence',
  domain: 'product',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'query_product_intelligence',
      description: 'Query structured product intelligence from sales conversations. Use when product team asks about product mentions, feature demand, competitive landscape, or revenue attribution. Data comes from extracted meeting notes where products were mentioned.',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            enum: ['mentions_summary', 'deal_list', 'feature_gaps', 'competitive', 'revenue_attribution', 'customer_requirements'],
            description: 'Type of product intelligence query: mentions_summary (aggregate by product), deal_list (deals mentioning a product), feature_gaps (feature gap impact), competitive (competitor mentions), revenue_attribution (revenue by product), customer_requirements (requirements per product)',
          },
          product_name: {
            type: 'string',
            description: 'Filter to a specific product name (optional)',
          },
          time_period: {
            type: 'string',
            enum: ['this_month', 'this_quarter', 'this_year', 'all'],
            description: 'Time period filter (default: all)',
          },
          mention_type: {
            type: 'string',
            enum: ['positioned', 'customer_workload', 'competitor_product', 'requirement'],
            description: 'Filter by mention type (optional)',
          },
        },
        required: ['query_type'],
      },
    },
  },

  instructions: `**For product mentions, feature demand, competitive landscape** → Use query_product_intelligence
  - Query structured product mentions from sales extraction data
  - Supports: mentions_summary, deal_list, feature_gaps, competitive, revenue_attribution, customer_requirements`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, organizationId } = ctx;
    const { query_type, product_name, time_period, mention_type } = ctx.args as {
      query_type: string;
      product_name?: string;
      time_period?: string;
      mention_type?: string;
    };

    const dateFrom = getTimePeriodFilter(time_period);

    try {
      switch (query_type) {
        // =====================================================================
        // MENTIONS SUMMARY — aggregate product mentions
        // =====================================================================
        case 'mentions_summary': {
          // Try the pre-built view first
          let query = supabase
            .from('product_mention_summary')
            .select('*')
            .eq('organization_id', organizationId);

          if (product_name) {
            query = query.ilike('product_name', `%${product_name}%`);
          }
          if (mention_type) {
            query = query.eq('mention_type', mention_type);
          }

          const { data: summary, error: viewError } = await query.order('total_mentions', { ascending: false });

          if (viewError) {
            // Fallback: query product_mentions directly
            let fallbackQuery = supabase
              .from('product_mentions')
              .select('product_name, mention_type, attributed_amount, sentiment, deal_id, account_id, meeting_date')
              .eq('organization_id', organizationId);

            if (product_name) fallbackQuery = fallbackQuery.ilike('product_name', `%${product_name}%`);
            if (mention_type) fallbackQuery = fallbackQuery.eq('mention_type', mention_type);
            if (dateFrom) fallbackQuery = fallbackQuery.gte('meeting_date', dateFrom);

            const { data: mentions, error: mentionError } = await fallbackQuery;
            if (mentionError) throw mentionError;

            // Aggregate manually
            const agg: Record<string, { total_mentions: number; deal_ids: Set<string>; revenue: number; positive: number; negative: number }> = {};
            for (const m of mentions || []) {
              const key = `${m.product_name}|${m.mention_type}`;
              if (!agg[key]) agg[key] = { total_mentions: 0, deal_ids: new Set(), revenue: 0, positive: 0, negative: 0 };
              agg[key].total_mentions++;
              if (m.deal_id) agg[key].deal_ids.add(m.deal_id);
              agg[key].revenue += Number(m.attributed_amount) || 0;
              if (m.sentiment === 'positive') agg[key].positive++;
              if (m.sentiment === 'negative') agg[key].negative++;
            }

            const results = Object.entries(agg).map(([key, data]) => {
              const [pName, mType] = key.split('|');
              return {
                product_name: pName,
                mention_type: mType,
                total_mentions: data.total_mentions,
                deal_count: data.deal_ids.size,
                total_attributed_revenue: data.revenue,
                positive_mentions: data.positive,
                negative_mentions: data.negative,
              };
            }).sort((a, b) => b.total_mentions - a.total_mentions);

            return { success: true, query_type, results };
          }

          return {
            success: true,
            query_type,
            time_period: time_period || 'all',
            results: summary || [],
          };
        }

        // =====================================================================
        // DEAL LIST — deals mentioning a specific product
        // =====================================================================
        case 'deal_list': {
          let query = supabase
            .from('product_mentions')
            .select('deal_id, product_name, mention_type, attributed_amount, sentiment, context_snippet, meeting_date')
            .eq('organization_id', organizationId)
            .not('deal_id', 'is', null);

          if (product_name) query = query.ilike('product_name', `%${product_name}%`);
          if (mention_type) query = query.eq('mention_type', mention_type);
          if (dateFrom) query = query.gte('meeting_date', dateFrom);

          const { data: mentions, error } = await query.order('meeting_date', { ascending: false }).limit(100);
          if (error) throw error;

          // Get unique deal IDs and fetch deal details
          const dealIds = [...new Set((mentions || []).map((m: any) => m.deal_id).filter(Boolean))];

          let dealMap: Record<string, any> = {};
          if (dealIds.length > 0) {
            const { data: deals } = await supabase
              .from('deals')
              .select('id, name, amount, stage, expected_close_date, account_id')
              .in('id', dealIds);

            for (const d of deals || []) {
              dealMap[d.id] = d;
            }
          }

          // Group mentions by deal
          const dealMentions: Record<string, { deal: any; mentions: any[] }> = {};
          for (const m of mentions || []) {
            if (!m.deal_id) continue;
            if (!dealMentions[m.deal_id]) {
              dealMentions[m.deal_id] = {
                deal: dealMap[m.deal_id] || { id: m.deal_id },
                mentions: [],
              };
            }
            dealMentions[m.deal_id].mentions.push({
              product_name: m.product_name,
              mention_type: m.mention_type,
              attributed_amount: m.attributed_amount,
              sentiment: m.sentiment,
              context_snippet: m.context_snippet,
              meeting_date: m.meeting_date,
            });
          }

          const results = Object.values(dealMentions).map((dm: any) => ({
            deal_id: dm.deal.id,
            deal_name: dm.deal.name || 'Unknown Deal',
            deal_amount: dm.deal.amount,
            deal_stage: dm.deal.stage,
            expected_close_date: dm.deal.expected_close_date,
            mention_count: dm.mentions.length,
            mentions: dm.mentions.slice(0, 5),
          })).sort((a: any, b: any) => b.mention_count - a.mention_count);

          return {
            success: true,
            query_type,
            product_filter: product_name || 'all',
            total_deals: results.length,
            results,
          };
        }

        // =====================================================================
        // COMPETITIVE — competitor product mentions
        // =====================================================================
        case 'competitive': {
          let query = supabase
            .from('product_mentions')
            .select('product_name, deal_id, account_id, attributed_amount, sentiment, context_snippet, meeting_date, mentioned_by')
            .eq('organization_id', organizationId)
            .eq('mention_type', 'competitor_product');

          if (product_name) query = query.ilike('product_name', `%${product_name}%`);
          if (dateFrom) query = query.gte('meeting_date', dateFrom);

          const { data: mentions, error } = await query.order('meeting_date', { ascending: false }).limit(200);
          if (error) throw error;

          // Aggregate by competitor product
          const compMap: Record<string, { mentions: number; deal_ids: Set<string>; revenue_at_risk: number; sentiments: Record<string, number>; snippets: string[] }> = {};
          for (const m of mentions || []) {
            const name = m.product_name;
            if (!compMap[name]) compMap[name] = { mentions: 0, deal_ids: new Set(), revenue_at_risk: 0, sentiments: {}, snippets: [] };
            compMap[name].mentions++;
            if (m.deal_id) compMap[name].deal_ids.add(m.deal_id);
            compMap[name].revenue_at_risk += Number(m.attributed_amount) || 0;
            const sent = m.sentiment || 'neutral';
            compMap[name].sentiments[sent] = (compMap[name].sentiments[sent] || 0) + 1;
            if (m.context_snippet && compMap[name].snippets.length < 3) {
              compMap[name].snippets.push(m.context_snippet);
            }
          }

          // Get deal amounts for revenue at risk
          const allDealIds = [...new Set(Object.values(compMap).flatMap(c => [...c.deal_ids]))];
          if (allDealIds.length > 0) {
            const { data: deals } = await supabase
              .from('deals')
              .select('id, amount')
              .in('id', allDealIds)
              .not('stage', 'in', '("closed_won","closed_lost")');

            const dealAmounts: Record<string, number> = {};
            for (const d of deals || []) {
              dealAmounts[d.id] = Number(d.amount) || 0;
            }

            // Recalculate revenue at risk from deal amounts
            for (const [, comp] of Object.entries(compMap)) {
              let totalRisk = 0;
              for (const did of comp.deal_ids) {
                totalRisk += dealAmounts[did] || 0;
              }
              if (totalRisk > 0) comp.revenue_at_risk = totalRisk;
            }
          }

          const results = Object.entries(compMap).map(([name, data]) => ({
            competitor_product: name,
            mention_count: data.mentions,
            deals_affected: data.deal_ids.size,
            revenue_at_risk: data.revenue_at_risk,
            sentiment_breakdown: data.sentiments,
            sample_contexts: data.snippets,
          })).sort((a, b) => b.mention_count - a.mention_count);

          return {
            success: true,
            query_type,
            time_period: time_period || 'all',
            total_competitor_products: results.length,
            results,
          };
        }

        // =====================================================================
        // REVENUE ATTRIBUTION — revenue by product
        // =====================================================================
        case 'revenue_attribution': {
          let query = supabase
            .from('product_mentions')
            .select('product_name, attributed_amount, amount_type, deal_id, mention_type, meeting_date')
            .eq('organization_id', organizationId)
            .eq('mention_type', 'positioned');

          if (product_name) query = query.ilike('product_name', `%${product_name}%`);
          if (dateFrom) query = query.gte('meeting_date', dateFrom);

          const { data: mentions, error } = await query;
          if (error) throw error;

          // Aggregate by product
          const prodMap: Record<string, { attributed: number; deal_ids: Set<string>; amount_types: Record<string, number> }> = {};
          for (const m of mentions || []) {
            const name = m.product_name;
            if (!prodMap[name]) prodMap[name] = { attributed: 0, deal_ids: new Set(), amount_types: {} };
            prodMap[name].attributed += Number(m.attributed_amount) || 0;
            if (m.deal_id) prodMap[name].deal_ids.add(m.deal_id);
            if (m.amount_type) {
              prodMap[name].amount_types[m.amount_type] = (prodMap[name].amount_types[m.amount_type] || 0) + (Number(m.attributed_amount) || 0);
            }
          }

          // Also get deal amounts for positioned products
          const allDealIds = [...new Set(Object.values(prodMap).flatMap(p => [...p.deal_ids]))];
          let dealTotalByProduct: Record<string, number> = {};
          if (allDealIds.length > 0) {
            const { data: deals } = await supabase
              .from('deals')
              .select('id, amount, products_positioned, stage')
              .in('id', allDealIds);

            for (const d of deals || []) {
              if (Array.isArray(d.products_positioned)) {
                for (const p of d.products_positioned) {
                  const key = p.toLowerCase();
                  if (!dealTotalByProduct[key]) dealTotalByProduct[key] = 0;
                  dealTotalByProduct[key] += Number(d.amount) || 0;
                }
              }
            }
          }

          const results = Object.entries(prodMap).map(([name, data]) => ({
            product_name: name,
            attributed_revenue: data.attributed,
            deal_pipeline_value: dealTotalByProduct[name.toLowerCase()] || 0,
            deal_count: data.deal_ids.size,
            amount_type_breakdown: data.amount_types,
          })).sort((a, b) => b.attributed_revenue - a.attributed_revenue);

          return {
            success: true,
            query_type,
            time_period: time_period || 'all',
            total_attributed_revenue: results.reduce((s, r) => s + r.attributed_revenue, 0),
            results,
          };
        }

        // =====================================================================
        // CUSTOMER REQUIREMENTS — requirements per product
        // =====================================================================
        case 'customer_requirements': {
          let query = supabase
            .from('product_mentions')
            .select('product_name, customer_requirements, deal_id, account_id, context_snippet, meeting_date')
            .eq('organization_id', organizationId)
            .eq('mention_type', 'requirement');

          if (product_name) query = query.ilike('product_name', `%${product_name}%`);
          if (dateFrom) query = query.gte('meeting_date', dateFrom);

          const { data: mentions, error } = await query.order('meeting_date', { ascending: false });
          if (error) throw error;

          // Aggregate requirements by product
          const reqMap: Record<string, { requirements: Record<string, number>; deal_ids: Set<string>; snippets: string[] }> = {};
          for (const m of mentions || []) {
            const name = m.product_name;
            if (!reqMap[name]) reqMap[name] = { requirements: {}, deal_ids: new Set(), snippets: [] };
            if (m.deal_id) reqMap[name].deal_ids.add(m.deal_id);
            if (m.context_snippet && reqMap[name].snippets.length < 5) {
              reqMap[name].snippets.push(m.context_snippet);
            }
            if (Array.isArray(m.customer_requirements)) {
              for (const req of m.customer_requirements) {
                reqMap[name].requirements[req] = (reqMap[name].requirements[req] || 0) + 1;
              }
            }
          }

          const results = Object.entries(reqMap).map(([name, data]) => ({
            product_name: name,
            deal_count: data.deal_ids.size,
            requirements: Object.entries(data.requirements)
              .map(([req, count]) => ({ requirement: req, frequency: count }))
              .sort((a, b) => b.frequency - a.frequency),
            sample_contexts: data.snippets,
          })).sort((a, b) => b.requirements.length - a.requirements.length);

          return {
            success: true,
            query_type,
            time_period: time_period || 'all',
            total_products_with_requirements: results.length,
            results,
          };
        }

        // =====================================================================
        // Not yet implemented
        // =====================================================================
        case 'feature_gaps':
          return {
            success: false,
            query_type,
            message: 'The "feature_gaps" query type is not yet available. Try "customer_requirements" for similar data, or use "mentions_summary" with mention_type="requirement".',
          };

        default:
          return {
            success: false,
            message: `Unknown query_type: "${query_type}". Available: mentions_summary, deal_list, competitive, revenue_attribution, customer_requirements.`,
          };
      }
    } catch (err: any) {
      console.error(`[query_product_intelligence] Error (${query_type}):`, err.message);
      return { success: false, message: `Failed to query product intelligence: ${err.message}` };
    }
  },

  triggerExamples: [
    'which products are mentioned most in deals',
    'show feature gaps by revenue impact',
    'competitive landscape for our products',
  ],
};

export default queryProductIntelligence;
