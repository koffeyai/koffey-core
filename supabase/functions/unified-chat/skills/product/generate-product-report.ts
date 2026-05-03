/**
 * Skill: generate_product_report
 *
 * Generate a narrative product intelligence report.
 * Aggregates product catalog data, deal associations, mention trends,
 * and revenue attribution into structured data for LLM narration.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

function getTimePeriodFilter(period?: string): { from: string | null; label: string } {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], label: 'This Month' };
    case 'this_quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), qStart, 1).toISOString().split('T')[0], label: 'This Quarter' };
    }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0], label: 'This Year' };
    case 'all':
    default:
      return { from: null, label: 'All Time' };
  }
}

const generateProductReport: SkillDefinition = {
  name: 'generate_product_report',
  displayName: 'Generate Product Report',
  domain: 'product',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'generate_product_report',
      description: 'Generate a narrative product intelligence report. Use when product team asks for a summary, competitive landscape, feature demand analysis, or revenue breakdown by product.',
      parameters: {
        type: 'object',
        properties: {
          report_type: {
            type: 'string',
            enum: ['product_summary', 'competitive_landscape', 'feature_demand', 'revenue_by_product', 'full_report'],
            description: 'Type of report to generate',
          },
          product_name: {
            type: 'string',
            description: 'Focus on a specific product (optional — omit for all products)',
          },
          time_period: {
            type: 'string',
            enum: ['this_month', 'this_quarter', 'this_year', 'all'],
            description: 'Time period (default: this_quarter)',
          },
        },
        required: ['report_type'],
      },
    },
  },

  instructions: `**For product summary, competitive landscape, feature demand reports** → Use generate_product_report
  - Builds narrative reports on product performance from sales extraction data`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, organizationId } = ctx;
    const { report_type, product_name, time_period } = ctx.args as {
      report_type: string;
      product_name?: string;
      time_period?: string;
    };

    const { from: dateFrom, label: periodLabel } = getTimePeriodFilter(time_period || 'this_quarter');

    try {
      // ---------------------------------------------------------------
      // Shared data: product catalog
      // ---------------------------------------------------------------
      let productsQuery = supabase
        .from('products')
        .select('id, name, description, category, pricing_model, base_price, billing_frequency, status, roadmap_eta')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true });

      if (product_name) {
        productsQuery = productsQuery.ilike('name', `%${product_name}%`);
      }

      const { data: products, error: prodError } = await productsQuery;
      if (prodError) throw prodError;

      // ---------------------------------------------------------------
      // Shared data: product mentions
      // ---------------------------------------------------------------
      let mentionsQuery = supabase
        .from('product_mentions')
        .select('product_name, mention_type, attributed_amount, sentiment, deal_id, account_id, customer_requirements, context_snippet, meeting_date')
        .eq('organization_id', organizationId);

      if (product_name) mentionsQuery = mentionsQuery.ilike('product_name', `%${product_name}%`);
      if (dateFrom) mentionsQuery = mentionsQuery.gte('meeting_date', dateFrom);

      const { data: mentions, error: mentionError } = await mentionsQuery;
      // Non-fatal if product_mentions doesn't exist
      const allMentions = mentionError ? [] : (mentions || []);

      // ---------------------------------------------------------------
      // Shared data: deals with products_positioned
      // ---------------------------------------------------------------
      let dealsQuery = supabase
        .from('deals')
        .select('id, name, amount, stage, probability, expected_close_date, products_positioned, account_id')
        .eq('organization_id', organizationId);

      if (dateFrom) dealsQuery = dealsQuery.gte('created_at', dateFrom);

      const { data: deals } = await dealsQuery;
      const allDeals = deals || [];

      // ---------------------------------------------------------------
      // Build report based on type
      // ---------------------------------------------------------------
      switch (report_type) {
        // =============================================================
        // PRODUCT SUMMARY — overview of each product
        // =============================================================
        case 'product_summary': {
          const productSummaries = (products || []).map((p: any) => {
            const pNameLower = (p.name || '').toLowerCase();

            // Count deals where this product is positioned
            const positionedDeals = allDeals.filter((d: any) =>
              Array.isArray(d.products_positioned) &&
              d.products_positioned.some((pp: string) => pp.toLowerCase() === pNameLower),
            );

            const openDeals = positionedDeals.filter((d: any) => !['closed_won', 'closed_lost'].includes(d.stage));
            const wonDeals = positionedDeals.filter((d: any) => d.stage === 'closed_won');
            const pipelineValue = openDeals.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);
            const wonValue = wonDeals.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);

            // Mentions for this product
            const productMentions = allMentions.filter((m: any) =>
              m.product_name?.toLowerCase() === pNameLower,
            );

            return {
              product_id: p.id,
              name: p.name,
              category: p.category,
              status: p.status,
              pricing_model: p.pricing_model,
              base_price: p.base_price,
              billing_frequency: p.billing_frequency,
              roadmap_eta: p.roadmap_eta,
              deals: {
                open_deals: openDeals.length,
                pipeline_value: pipelineValue,
                won_deals: wonDeals.length,
                won_value: wonValue,
                total_deals: positionedDeals.length,
              },
              mentions: {
                total: productMentions.length,
                positive: productMentions.filter((m: any) => m.sentiment === 'positive').length,
                negative: productMentions.filter((m: any) => m.sentiment === 'negative').length,
                attributed_revenue: productMentions.reduce((s: number, m: any) => s + (Number(m.attributed_amount) || 0), 0),
              },
            };
          });

          return {
            success: true,
            report_type,
            period: periodLabel,
            total_products: productSummaries.length,
            products: productSummaries,
          };
        }

        // =============================================================
        // COMPETITIVE LANDSCAPE — competitor mentions and impact
        // =============================================================
        case 'competitive_landscape': {
          const compMentions = allMentions.filter((m: any) => m.mention_type === 'competitor_product');

          // Aggregate by competitor
          const compMap: Record<string, { mentions: number; deal_ids: Set<string>; sentiments: Record<string, number>; snippets: string[] }> = {};
          for (const m of compMentions) {
            const name = m.product_name;
            if (!compMap[name]) compMap[name] = { mentions: 0, deal_ids: new Set(), sentiments: {}, snippets: [] };
            compMap[name].mentions++;
            if (m.deal_id) compMap[name].deal_ids.add(m.deal_id);
            const sent = m.sentiment || 'neutral';
            compMap[name].sentiments[sent] = (compMap[name].sentiments[sent] || 0) + 1;
            if (m.context_snippet && compMap[name].snippets.length < 3) {
              compMap[name].snippets.push(m.context_snippet);
            }
          }

          // Get deal amounts for revenue at risk
          const compDealIds = [...new Set(Object.values(compMap).flatMap(c => [...c.deal_ids]))];
          let dealAmounts: Record<string, number> = {};
          if (compDealIds.length > 0) {
            const { data: compDeals } = await supabase
              .from('deals')
              .select('id, amount')
              .in('id', compDealIds)
              .not('stage', 'in', '("closed_won","closed_lost")');
            for (const d of compDeals || []) {
              dealAmounts[d.id] = Number(d.amount) || 0;
            }
          }

          const competitors = Object.entries(compMap).map(([name, data]) => {
            let revenueAtRisk = 0;
            for (const did of data.deal_ids) {
              revenueAtRisk += dealAmounts[did] || 0;
            }
            return {
              competitor_product: name,
              mention_count: data.mentions,
              deals_affected: data.deal_ids.size,
              revenue_at_risk: revenueAtRisk,
              sentiment_breakdown: data.sentiments,
              sample_contexts: data.snippets,
            };
          }).sort((a, b) => b.mention_count - a.mention_count);

          // Our products mentioned alongside competitors
          const ourMentions = allMentions.filter((m: any) => m.mention_type === 'positioned');
          const ourProductCounts: Record<string, number> = {};
          for (const m of ourMentions) {
            ourProductCounts[m.product_name] = (ourProductCounts[m.product_name] || 0) + 1;
          }

          return {
            success: true,
            report_type,
            period: periodLabel,
            summary: {
              total_competitor_products: competitors.length,
              total_competitive_mentions: compMentions.length,
              total_revenue_at_risk: competitors.reduce((s, c) => s + c.revenue_at_risk, 0),
            },
            competitors,
            our_products_positioned: Object.entries(ourProductCounts)
              .map(([name, count]) => ({ product_name: name, mention_count: count }))
              .sort((a, b) => b.mention_count - a.mention_count),
          };
        }

        // =============================================================
        // FEATURE DEMAND — customer requirements and gaps
        // =============================================================
        case 'feature_demand': {
          const reqMentions = allMentions.filter((m: any) =>
            m.mention_type === 'requirement' || (Array.isArray(m.customer_requirements) && m.customer_requirements.length > 0),
          );

          // Aggregate requirements
          const reqFrequency: Record<string, { count: number; products: Set<string>; deal_ids: Set<string> }> = {};
          for (const m of reqMentions) {
            const reqs = Array.isArray(m.customer_requirements) ? m.customer_requirements : [];
            for (const req of reqs) {
              if (!reqFrequency[req]) reqFrequency[req] = { count: 0, products: new Set(), deal_ids: new Set() };
              reqFrequency[req].count++;
              if (m.product_name) reqFrequency[req].products.add(m.product_name);
              if (m.deal_id) reqFrequency[req].deal_ids.add(m.deal_id);
            }
          }

          // Enrich with deal values
          const reqDealIds = [...new Set(Object.values(reqFrequency).flatMap(r => [...r.deal_ids]))];
          let reqDealAmounts: Record<string, number> = {};
          if (reqDealIds.length > 0) {
            const { data: reqDeals } = await supabase
              .from('deals')
              .select('id, amount')
              .in('id', reqDealIds);
            for (const d of reqDeals || []) {
              reqDealAmounts[d.id] = Number(d.amount) || 0;
            }
          }

          const requirements = Object.entries(reqFrequency).map(([req, data]) => {
            let totalValue = 0;
            for (const did of data.deal_ids) {
              totalValue += reqDealAmounts[did] || 0;
            }
            return {
              requirement: req,
              frequency: data.count,
              products_mentioned_with: [...data.products],
              deals_requesting: data.deal_ids.size,
              pipeline_value_behind_requirement: totalValue,
            };
          }).sort((a, b) => b.frequency - a.frequency);

          return {
            success: true,
            report_type,
            period: periodLabel,
            summary: {
              unique_requirements: requirements.length,
              total_requirement_mentions: reqMentions.length,
              total_pipeline_value: requirements.reduce((s, r) => s + r.pipeline_value_behind_requirement, 0),
            },
            top_requirements: requirements.slice(0, 20),
          };
        }

        // =============================================================
        // REVENUE BY PRODUCT — product revenue breakdown
        // =============================================================
        case 'revenue_by_product': {
          // Build product revenue from deals.products_positioned
          const prodRevenue: Record<string, { open_value: number; won_value: number; lost_value: number; open_count: number; won_count: number; lost_count: number }> = {};

          for (const deal of allDeals) {
            if (!Array.isArray(deal.products_positioned)) continue;
            for (const p of deal.products_positioned) {
              const key = p;
              if (!prodRevenue[key]) prodRevenue[key] = { open_value: 0, won_value: 0, lost_value: 0, open_count: 0, won_count: 0, lost_count: 0 };
              const amount = Number(deal.amount) || 0;
              if (deal.stage === 'closed_won') {
                prodRevenue[key].won_value += amount;
                prodRevenue[key].won_count++;
              } else if (deal.stage === 'closed_lost') {
                prodRevenue[key].lost_value += amount;
                prodRevenue[key].lost_count++;
              } else {
                prodRevenue[key].open_value += amount;
                prodRevenue[key].open_count++;
              }
            }
          }

          // Also include attributed revenue from mentions
          const positionedMentions = allMentions.filter((m: any) => m.mention_type === 'positioned');
          const mentionRevenue: Record<string, number> = {};
          for (const m of positionedMentions) {
            mentionRevenue[m.product_name] = (mentionRevenue[m.product_name] || 0) + (Number(m.attributed_amount) || 0);
          }

          const results = Object.entries(prodRevenue).map(([name, data]) => ({
            product_name: name,
            ...data,
            total_pipeline: data.open_value + data.won_value,
            attributed_revenue: mentionRevenue[name] || 0,
            win_rate: data.won_count + data.lost_count > 0
              ? Math.round((data.won_count / (data.won_count + data.lost_count)) * 100)
              : null,
          })).sort((a, b) => b.total_pipeline - a.total_pipeline);

          return {
            success: true,
            report_type,
            period: periodLabel,
            summary: {
              total_pipeline_value: results.reduce((s, r) => s + r.open_value, 0),
              total_won_revenue: results.reduce((s, r) => s + r.won_value, 0),
              total_lost_value: results.reduce((s, r) => s + r.lost_value, 0),
              products_with_deals: results.length,
            },
            products: results,
          };
        }

        // =============================================================
        // FULL REPORT — combines all of the above
        // =============================================================
        case 'full_report': {
          // Recursively call the other report types using the same context
          const summaryResult = await generateProductReport.execute({
            ...ctx,
            args: { ...ctx.args, report_type: 'product_summary' },
          });
          const revenueResult = await generateProductReport.execute({
            ...ctx,
            args: { ...ctx.args, report_type: 'revenue_by_product' },
          });
          const competitiveResult = await generateProductReport.execute({
            ...ctx,
            args: { ...ctx.args, report_type: 'competitive_landscape' },
          });
          const demandResult = await generateProductReport.execute({
            ...ctx,
            args: { ...ctx.args, report_type: 'feature_demand' },
          });

          return {
            success: true,
            report_type: 'full_report',
            period: periodLabel,
            sections: {
              product_summary: summaryResult,
              revenue_by_product: revenueResult,
              competitive_landscape: competitiveResult,
              feature_demand: demandResult,
            },
          };
        }

        default:
          return {
            success: false,
            message: `Unknown report type: "${report_type}". Available: product_summary, competitive_landscape, feature_demand, revenue_by_product, full_report.`,
          };
      }
    } catch (err: any) {
      console.error(`[generate_product_report] Error (${report_type}):`, err.message);
      return { success: false, message: `Failed to generate product report: ${err.message}` };
    }
  },

  triggerExamples: [
    'product summary report',
    'competitive landscape report',
    'feature demand analysis',
  ],
};

export default generateProductReport;
