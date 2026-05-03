/**
 * Skill: generate_report
 *
 * Generate a formatted report based on CRM data.
 * Supports: pipeline_review, weekly_forecast, stale_deals, activity_audit,
 * risk_report. Other types return a "not yet available" message.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

// ---------------------------------------------------------------
// Helper: compute date boundaries from time_period
// ---------------------------------------------------------------
function getDateRange(period?: string): { from: string; to: string; label: string } {
  const now = new Date();
  const to = now.toISOString();

  switch (period) {
    case 'today': {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to, label: 'Today' };
    }
    case 'this_week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); // Sunday
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to, label: 'This Week' };
    }
    case 'last_week': {
      const end = new Date(now);
      end.setDate(now.getDate() - now.getDay());
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      return { from: start.toISOString(), to: end.toISOString(), label: 'Last Week' };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to, label: 'This Month' };
    }
    case 'last_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const end = new Date(now.getFullYear(), qMonth, 1);
      const start = new Date(now.getFullYear(), qMonth - 3, 1);
      return { from: start.toISOString(), to: end.toISOString(), label: 'Last Quarter' };
    }
    case 'this_quarter':
    default: {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qStart, 1);
      return { from: start.toISOString(), to, label: 'This Quarter' };
    }
  }
}

const generateReport: SkillDefinition = {
  name: 'generate_report',
  displayName: 'Generate Report',
  domain: 'intelligence',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'generate_report',
      description: `Generate a formatted report based on CRM data. Use when user asks for:
- "pipeline review" or "pipeline summary"
- "weekly forecast" or "forecast report"
- "stale deals report"
- "activity audit" or "activity report"
- "data quality report"
- "rep scorecard" or "team performance"
- "coaching prep for [rep]" or "1:1 prep"
- "deals at risk" or "risk report"
- "competitive analysis"

Returns a formatted markdown report suitable for review or sharing.`,
      parameters: {
        type: 'object',
        properties: {
          report_type: {
            type: 'string',
            enum: ['pipeline_review', 'weekly_forecast', 'stale_deals', 'activity_audit', 'data_quality', 'rep_scorecard', 'coaching_prep', 'risk_report', 'competitive_analysis'],
            description: 'Type of report to generate',
          },
          time_period: {
            type: 'string',
            enum: ['today', 'this_week', 'last_week', 'this_month', 'this_quarter', 'last_quarter'],
            description: 'Time period for the report (default: this_quarter)',
          },
          rep_name: {
            type: 'string',
            description: 'Rep name for rep-specific reports (scorecard, coaching prep)',
          },
          include_recommendations: {
            type: 'boolean',
            description: 'Include AI-generated recommendations (default: true)',
          },
        },
        required: ['report_type'],
      },
    },
  },

  instructions: `**For "pipeline review", "weekly forecast", "stale deals report", "activity audit"** → Use generate_report
  - Returns formatted markdown report
  - Supports multiple report types: pipeline_review, weekly_forecast, stale_deals, activity_audit, data_quality, rep_scorecard, coaching_prep, risk_report, competitive_analysis`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, organizationId } = ctx;
    const { report_type, time_period, rep_name } = ctx.args as {
      report_type: string;
      time_period?: string;
      rep_name?: string;
    };

    const range = getDateRange(time_period);

    try {
      switch (report_type) {
        // =====================================================================
        // PIPELINE REVIEW — deals grouped by stage with values
        // =====================================================================
        case 'pipeline_review': {
          const { data: deals, error } = await supabase
            .from('deals')
            .select('id, name, amount, stage, probability, expected_close_date, forecast_category, account_id, created_at, updated_at')
            .eq('organization_id', organizationId)
            .not('stage', 'in', '("closed_won","closed_lost")')
            .order('amount', { ascending: false, nullsFirst: false });

          if (error) throw error;
          const allDeals = deals || [];

          // Group by stage
          const stageMap: Record<string, { count: number; total_value: number; deals: any[] }> = {};
          for (const d of allDeals) {
            const s = d.stage || 'unknown';
            if (!stageMap[s]) stageMap[s] = { count: 0, total_value: 0, deals: [] };
            stageMap[s].count++;
            stageMap[s].total_value += Number(d.amount) || 0;
            stageMap[s].deals.push({
              name: d.name,
              amount: d.amount,
              probability: d.probability,
              expected_close_date: d.expected_close_date,
              forecast_category: d.forecast_category,
            });
          }

          const totalValue = allDeals.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
          const weightedValue = allDeals.reduce(
            (sum: number, d: any) => sum + (Number(d.amount) || 0) * ((d.probability || 0) / 100),
            0,
          );

          // Won/lost for win rate (this quarter)
          const { data: closedWon } = await supabase
            .from('deals')
            .select('id', { count: 'exact' })
            .eq('organization_id', organizationId)
            .eq('stage', 'closed_won')
            .gte('actual_closed_at', range.from)
            .lte('actual_closed_at', range.to);

          const { data: closedLost } = await supabase
            .from('deals')
            .select('id', { count: 'exact' })
            .eq('organization_id', organizationId)
            .eq('stage', 'closed_lost')
            .gte('actual_closed_at', range.from)
            .lte('actual_closed_at', range.to);

          const wonCount = closedWon?.length || 0;
          const lostCount = closedLost?.length || 0;
          const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null;

          return {
            success: true,
            report_type: 'pipeline_review',
            period: range.label,
            summary: {
              total_open_deals: allDeals.length,
              total_pipeline_value: totalValue,
              weighted_pipeline_value: Math.round(weightedValue),
              win_rate_pct: winRate,
              won_this_period: wonCount,
              lost_this_period: lostCount,
            },
            by_stage: Object.entries(stageMap).map(([stage, data]) => ({
              stage,
              deal_count: data.count,
              total_value: data.total_value,
              top_deals: data.deals.slice(0, 3),
            })),
          };
        }

        // =====================================================================
        // WEEKLY FORECAST — deals closing soon with probabilities
        // =====================================================================
        case 'weekly_forecast': {
          const now = new Date();
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          const endOfWeek = new Date(now);
          endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

          const { data: deals, error } = await supabase
            .from('deals')
            .select('id, name, amount, stage, probability, expected_close_date, forecast_category, account_id')
            .eq('organization_id', organizationId)
            .not('stage', 'in', '("closed_won","closed_lost")')
            .lte('expected_close_date', endOfMonth.toISOString().split('T')[0])
            .order('expected_close_date', { ascending: true });

          if (error) throw error;
          const allDeals = deals || [];

          // Split into this week vs rest of month
          const thisWeek = allDeals.filter((d: any) =>
            d.expected_close_date && d.expected_close_date <= endOfWeek.toISOString().split('T')[0],
          );
          const restOfMonth = allDeals.filter((d: any) =>
            d.expected_close_date && d.expected_close_date > endOfWeek.toISOString().split('T')[0],
          );

          const calcBucket = (ds: any[]) => ({
            deal_count: ds.length,
            total_value: ds.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0),
            weighted_value: Math.round(
              ds.reduce((s: number, d: any) => s + (Number(d.amount) || 0) * ((d.probability || 0) / 100), 0),
            ),
            deals: ds.map((d: any) => ({
              name: d.name,
              amount: d.amount,
              probability: d.probability,
              expected_close_date: d.expected_close_date,
              forecast_category: d.forecast_category,
              stage: d.stage,
            })),
          });

          // By forecast category
          const byCategory: Record<string, { count: number; value: number }> = {};
          for (const d of allDeals) {
            const cat = d.forecast_category || 'pipeline';
            if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
            byCategory[cat].count++;
            byCategory[cat].value += Number(d.amount) || 0;
          }

          return {
            success: true,
            report_type: 'weekly_forecast',
            period: range.label,
            closing_this_week: calcBucket(thisWeek),
            closing_rest_of_month: calcBucket(restOfMonth),
            by_forecast_category: byCategory,
            total_forecast_value: allDeals.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0),
          };
        }

        // =====================================================================
        // STALE DEALS — deals with no activity in 7+ days
        // =====================================================================
        case 'stale_deals': {
          const staleCutoff = new Date();
          staleCutoff.setDate(staleCutoff.getDate() - 7);

          // Get all open deals
          const { data: deals, error } = await supabase
            .from('deals')
            .select('id, name, amount, stage, probability, expected_close_date, updated_at, account_id, assigned_to')
            .eq('organization_id', organizationId)
            .not('stage', 'in', '("closed_won","closed_lost")')
            .order('updated_at', { ascending: true });

          if (error) throw error;

          // Get latest activity per deal
          const { data: recentActivities } = await supabase
            .from('activities')
            .select('deal_id, created_at')
            .eq('organization_id', organizationId)
            .in('deal_id', (deals || []).map((d: any) => d.id).filter(Boolean))
            .order('created_at', { ascending: false });

          const latestActivityByDeal: Record<string, string> = {};
          for (const a of recentActivities || []) {
            if (a.deal_id && !latestActivityByDeal[a.deal_id]) {
              latestActivityByDeal[a.deal_id] = a.created_at;
            }
          }

          const staleDeals = (deals || []).filter((d: any) => {
            const lastActivity = latestActivityByDeal[d.id];
            const lastTouch = lastActivity || d.updated_at;
            return new Date(lastTouch) < staleCutoff;
          }).map((d: any) => {
            const lastActivity = latestActivityByDeal[d.id];
            const lastTouch = lastActivity || d.updated_at;
            const daysSince = Math.floor((Date.now() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24));
            return {
              name: d.name,
              amount: d.amount,
              stage: d.stage,
              probability: d.probability,
              expected_close_date: d.expected_close_date,
              days_since_last_activity: daysSince,
              last_activity_date: lastTouch,
              at_risk: daysSince > 14,
            };
          });

          // Sort by days stale descending
          staleDeals.sort((a: any, b: any) => b.days_since_last_activity - a.days_since_last_activity);

          const totalAtRisk = staleDeals.filter((d: any) => d.at_risk).length;
          const totalStaleValue = staleDeals.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);

          return {
            success: true,
            report_type: 'stale_deals',
            summary: {
              total_stale_deals: staleDeals.length,
              total_stale_value: totalStaleValue,
              critically_stale: totalAtRisk,
              threshold_days: 7,
            },
            stale_deals: staleDeals.slice(0, 20),
          };
        }

        // =====================================================================
        // ACTIVITY AUDIT — activity counts by type and user
        // =====================================================================
        case 'activity_audit': {
          const { data: activities, error } = await supabase
            .from('activities')
            .select('id, type, user_id, completed, created_at')
            .eq('organization_id', organizationId)
            .gte('created_at', range.from)
            .lte('created_at', range.to);

          if (error) throw error;
          const allActivities = activities || [];

          // By type
          const byType: Record<string, number> = {};
          for (const a of allActivities) {
            const t = a.type || 'other';
            byType[t] = (byType[t] || 0) + 1;
          }

          // By user
          const byUser: Record<string, { total: number; completed: number; by_type: Record<string, number> }> = {};
          for (const a of allActivities) {
            const uid = a.user_id || 'unknown';
            if (!byUser[uid]) byUser[uid] = { total: 0, completed: 0, by_type: {} };
            byUser[uid].total++;
            if (a.completed) byUser[uid].completed++;
            const t = a.type || 'other';
            byUser[uid].by_type[t] = (byUser[uid].by_type[t] || 0) + 1;
          }

          // By day of week
          const byDay: Record<string, number> = {};
          for (const a of allActivities) {
            const day = new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'long' });
            byDay[day] = (byDay[day] || 0) + 1;
          }

          // Resolve user names
          const userIds = Object.keys(byUser).filter(id => id !== 'unknown');
          let userNames: Record<string, string> = {};
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', userIds);
            for (const p of profiles || []) {
              userNames[p.id] = p.full_name || p.email || p.id;
            }
          }

          return {
            success: true,
            report_type: 'activity_audit',
            period: range.label,
            summary: {
              total_activities: allActivities.length,
              completed: allActivities.filter((a: any) => a.completed).length,
              completion_rate_pct: allActivities.length > 0
                ? Math.round((allActivities.filter((a: any) => a.completed).length / allActivities.length) * 100)
                : 0,
            },
            by_type: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
            by_user: Object.entries(byUser).map(([uid, data]) => ({
              user_id: uid,
              user_name: userNames[uid] || uid,
              ...data,
            })).sort((a, b) => b.total - a.total),
            by_day_of_week: byDay,
          };
        }

        // =====================================================================
        // RISK REPORT — deals with risk indicators
        // =====================================================================
        case 'risk_report': {
          const { data: deals, error } = await supabase
            .from('deals')
            .select('id, name, amount, stage, probability, expected_close_date, updated_at, competitor_name, forecast_category')
            .eq('organization_id', organizationId)
            .not('stage', 'in', '("closed_won","closed_lost")')
            .order('amount', { ascending: false, nullsFirst: false });

          if (error) throw error;
          const allDeals = deals || [];

          // Get latest activity per deal
          const dealIds = allDeals.map((d: any) => d.id);
          const { data: activities } = dealIds.length > 0
            ? await supabase
                .from('activities')
                .select('deal_id, created_at')
                .eq('organization_id', organizationId)
                .in('deal_id', dealIds)
                .order('created_at', { ascending: false })
            : { data: [] };

          const latestByDeal: Record<string, string> = {};
          for (const a of activities || []) {
            if (a.deal_id && !latestByDeal[a.deal_id]) {
              latestByDeal[a.deal_id] = a.created_at;
            }
          }

          const now = new Date();
          const riskyDeals = allDeals.map((d: any) => {
            const risks: string[] = [];
            let riskScore = 0;

            // Stale — no activity in 7+ days
            const lastTouch = latestByDeal[d.id] || d.updated_at;
            const daysSinceActivity = Math.floor((now.getTime() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceActivity > 14) { risks.push(`No activity in ${daysSinceActivity} days`); riskScore += 3; }
            else if (daysSinceActivity > 7) { risks.push(`No activity in ${daysSinceActivity} days`); riskScore += 2; }

            // Close date passed
            if (d.expected_close_date && new Date(d.expected_close_date) < now) {
              risks.push('Close date has passed');
              riskScore += 3;
            }

            // Close date within 2 weeks but low probability
            if (d.expected_close_date) {
              const daysToClose = Math.floor((new Date(d.expected_close_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (daysToClose <= 14 && daysToClose > 0 && (d.probability || 0) < 50) {
                risks.push(`Closing in ${daysToClose} days but only ${d.probability}% probability`);
                riskScore += 2;
              }
            }

            // Has competitor
            if (d.competitor_name) {
              risks.push(`Competitor: ${d.competitor_name}`);
              riskScore += 1;
            }

            // High value + early stage
            if ((Number(d.amount) || 0) > 50000 && ['prospecting', 'qualification'].includes(d.stage)) {
              risks.push('High-value deal still in early stage');
              riskScore += 1;
            }

            return {
              name: d.name,
              amount: d.amount,
              stage: d.stage,
              probability: d.probability,
              expected_close_date: d.expected_close_date,
              competitor_name: d.competitor_name,
              risk_score: riskScore,
              risk_factors: risks,
              days_since_activity: daysSinceActivity,
            };
          }).filter((d: any) => d.risk_score > 0)
            .sort((a: any, b: any) => b.risk_score - a.risk_score);

          const totalAtRiskValue = riskyDeals.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);

          return {
            success: true,
            report_type: 'risk_report',
            summary: {
              deals_at_risk: riskyDeals.length,
              total_at_risk_value: totalAtRiskValue,
              critical: riskyDeals.filter((d: any) => d.risk_score >= 4).length,
              warning: riskyDeals.filter((d: any) => d.risk_score >= 2 && d.risk_score < 4).length,
              watch: riskyDeals.filter((d: any) => d.risk_score < 2).length,
            },
            deals: riskyDeals.slice(0, 20),
          };
        }

        // =====================================================================
        // Not yet implemented
        // =====================================================================
        case 'data_quality':
        case 'rep_scorecard':
        case 'coaching_prep':
        case 'competitive_analysis':
          return {
            success: false,
            report_type,
            message: `The "${report_type.replace(/_/g, ' ')}" report is not yet available. Currently supported: pipeline_review, weekly_forecast, stale_deals, activity_audit, risk_report.`,
          };

        default:
          return {
            success: false,
            message: `Unknown report type: "${report_type}". Available types: pipeline_review, weekly_forecast, stale_deals, activity_audit, risk_report.`,
          };
      }
    } catch (err: any) {
      console.error(`[generate_report] Error generating ${report_type}:`, err.message);
      return { success: false, message: `Failed to generate report: ${err.message}` };
    }
  },

  triggerExamples: [
    'give me a pipeline review',
    'weekly forecast report',
    'stale deals report',
    'coaching prep for Sarah',
  ],
};

export default generateReport;
