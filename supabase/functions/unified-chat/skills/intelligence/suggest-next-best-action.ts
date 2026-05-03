/**
 * Skill: suggest_next_best_action
 *
 * Suggest prioritized next actions based on CRM data.
 * Queries overdue tasks, stale deals, high-value deals without recent
 * activity, and upcoming meetings — then scores and ranks the top actions.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

interface Suggestion {
  priority: number;
  score: number;
  action_type: string;
  entity_type: string;
  entity_name: string;
  entity_id: string;
  reasoning: string;
  suggested_action: string;
}

const suggestNextBestAction: SkillDefinition = {
  name: 'suggest_next_best_action',
  displayName: 'Suggest Next Best Action',
  domain: 'intelligence',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'suggest_next_best_action',
      description: `Suggest the next best actions for the user based on CRM data. Use when user asks:
- "who should I call today?"
- "what's my priority list?"
- "what should I focus on?"
- "any hot leads I should follow up with?"
- "what deals need attention?"
- "who haven't I talked to in a while?"

Returns a prioritized action list with context for each item.`,
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            enum: ['calls', 'follow_ups', 'at_risk_deals', 'stale_contacts', 'overdue_tasks', 'all'],
            description: 'What to focus suggestions on (default: all)',
          },
          limit: {
            type: 'number',
            description: 'Max number of suggestions to return (default: 10)',
          },
        },
      },
    },
  },

  instructions: `**For "who should I call today?", "what's my priority list?", "what should I focus on?"** → Use suggest_next_best_action
  - Returns prioritized action list with context for each item
  - Can focus on: calls, follow_ups, at_risk_deals, stale_contacts, overdue_tasks`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, userId, organizationId } = ctx;
    const { focus, limit: maxResults } = ctx.args as { focus?: string; limit?: number };
    const resultLimit = Math.min(maxResults || 10, 20);
    const focusArea = focus || 'all';

    const suggestions: Suggestion[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    try {
      // ---------------------------------------------------------------
      // 1. Overdue tasks
      // ---------------------------------------------------------------
      if (focusArea === 'all' || focusArea === 'overdue_tasks') {
        const { data: overdueTasks } = await supabase
          .from('tasks')
          .select('id, title, description, priority, due_date, deal_id, contact_id, account_id')
          .eq('organization_id', organizationId)
          .eq('completed', false)
          .lt('due_date', now.toISOString().split('T')[0])
          .order('due_date', { ascending: true })
          .limit(10);

        for (const task of overdueTasks || []) {
          const daysOverdue = Math.floor((now.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24));
          const priorityBonus = task.priority === 'high' ? 3 : task.priority === 'medium' ? 1 : 0;
          suggestions.push({
            priority: 0,
            score: 70 + Math.min(daysOverdue * 2, 20) + priorityBonus,
            action_type: 'complete_task',
            entity_type: 'task',
            entity_name: task.title,
            entity_id: task.id,
            reasoning: `Task is ${daysOverdue} day(s) overdue (${task.priority} priority)`,
            suggested_action: `Complete or reschedule: "${task.title}"`,
          });
        }
      }

      // ---------------------------------------------------------------
      // 2. Stale high-value deals (no activity in 7+ days)
      // ---------------------------------------------------------------
      if (focusArea === 'all' || focusArea === 'at_risk_deals' || focusArea === 'follow_ups') {
        const { data: openDeals } = await supabase
          .from('deals')
          .select('id, name, amount, stage, probability, expected_close_date, updated_at')
          .eq('organization_id', organizationId)
          .not('stage', 'in', '("closed_won","closed_lost")')
          .order('amount', { ascending: false, nullsFirst: false })
          .limit(30);

        if (openDeals && openDeals.length > 0) {
          // Get latest activity per deal
          const dealIds = openDeals.map((d: any) => d.id);
          const { data: recentActivities } = await supabase
            .from('activities')
            .select('deal_id, created_at')
            .eq('organization_id', organizationId)
            .in('deal_id', dealIds)
            .order('created_at', { ascending: false });

          const latestByDeal: Record<string, string> = {};
          for (const a of recentActivities || []) {
            if (a.deal_id && !latestByDeal[a.deal_id]) {
              latestByDeal[a.deal_id] = a.created_at;
            }
          }

          for (const deal of openDeals) {
            const lastTouch = latestByDeal[deal.id] || deal.updated_at;
            const daysSince = Math.floor((now.getTime() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24));
            const amount = Number(deal.amount) || 0;

            if (daysSince < 7) continue;

            // Score: higher for more days stale, higher amount, close date approaching
            let score = 50;
            score += Math.min(daysSince * 2, 30);
            if (amount >= 100000) score += 15;
            else if (amount >= 50000) score += 10;
            else if (amount >= 10000) score += 5;

            // Close date urgency
            if (deal.expected_close_date) {
              const daysToClose = Math.floor((new Date(deal.expected_close_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (daysToClose < 0) score += 15;
              else if (daysToClose < 14) score += 10;
              else if (daysToClose < 30) score += 5;
            }

            const isCritical = daysSince > 14;
            suggestions.push({
              priority: 0,
              score,
              action_type: isCritical ? 'urgent_follow_up' : 'follow_up',
              entity_type: 'deal',
              entity_name: deal.name,
              entity_id: deal.id,
              reasoning: `${isCritical ? 'CRITICAL: ' : ''}No activity in ${daysSince} days on $${amount.toLocaleString()} deal (${deal.stage})${deal.expected_close_date ? `, closing ${deal.expected_close_date}` : ''}`,
              suggested_action: `Reach out on "${deal.name}" — it's been ${daysSince} days since last touch`,
            });
          }
        }
      }

      // ---------------------------------------------------------------
      // 3. Deals closing this week without recent activity
      // ---------------------------------------------------------------
      if (focusArea === 'all' || focusArea === 'at_risk_deals') {
        const endOfWeek = new Date(now);
        endOfWeek.setDate(now.getDate() + 7);

        const { data: closingSoon } = await supabase
          .from('deals')
          .select('id, name, amount, stage, probability, expected_close_date')
          .eq('organization_id', organizationId)
          .not('stage', 'in', '("closed_won","closed_lost")')
          .lte('expected_close_date', endOfWeek.toISOString().split('T')[0])
          .gte('expected_close_date', now.toISOString().split('T')[0])
          .order('amount', { ascending: false, nullsFirst: false });

        for (const deal of closingSoon || []) {
          // Avoid duplicates from stale deals above
          if (suggestions.some(s => s.entity_id === deal.id)) continue;

          const amount = Number(deal.amount) || 0;
          suggestions.push({
            priority: 0,
            score: 75 + (amount >= 50000 ? 10 : 0),
            action_type: 'close_prep',
            entity_type: 'deal',
            entity_name: deal.name,
            entity_id: deal.id,
            reasoning: `Closing ${deal.expected_close_date} ($${amount.toLocaleString()}, ${deal.probability}% probability) — make sure it's on track`,
            suggested_action: `Review and advance "${deal.name}" — closing date is this week`,
          });
        }
      }

      // ---------------------------------------------------------------
      // 4. Stale contacts (no activity in 14+ days)
      // ---------------------------------------------------------------
      if (focusArea === 'all' || focusArea === 'stale_contacts' || focusArea === 'calls') {
        const { data: recentContacts } = await supabase
          .from('contacts')
          .select('id, full_name, company, email, updated_at')
          .eq('organization_id', organizationId)
          .lt('updated_at', fourteenDaysAgo.toISOString())
          .not('status', 'eq', 'inactive')
          .order('updated_at', { ascending: true })
          .limit(10);

        // Get latest activity per contact
        const contactIds = (recentContacts || []).map((c: any) => c.id);
        let latestByContact: Record<string, string> = {};
        if (contactIds.length > 0) {
          const { data: contactActivities } = await supabase
            .from('activities')
            .select('contact_id, created_at')
            .eq('organization_id', organizationId)
            .in('contact_id', contactIds)
            .order('created_at', { ascending: false });

          for (const a of contactActivities || []) {
            if (a.contact_id && !latestByContact[a.contact_id]) {
              latestByContact[a.contact_id] = a.created_at;
            }
          }
        }

        for (const contact of recentContacts || []) {
          const lastTouch = latestByContact[contact.id] || contact.updated_at;
          const daysSince = Math.floor((now.getTime() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24));

          if (daysSince < 14) continue;

          suggestions.push({
            priority: 0,
            score: 40 + Math.min(daysSince, 30),
            action_type: 'reconnect',
            entity_type: 'contact',
            entity_name: contact.full_name || 'Unknown',
            entity_id: contact.id,
            reasoning: `Haven't touched base in ${daysSince} days${contact.company ? ` (${contact.company})` : ''}`,
            suggested_action: `Reconnect with ${contact.full_name}${contact.email ? ` — ${contact.email}` : ''}`,
          });
        }
      }

      // ---------------------------------------------------------------
      // Score, rank, and return
      // ---------------------------------------------------------------
      suggestions.sort((a, b) => b.score - a.score);

      // Assign priority numbers
      const topSuggestions = suggestions.slice(0, resultLimit).map((s, i) => ({
        ...s,
        priority: i + 1,
      }));

      // Summary stats
      const actionTypeCounts: Record<string, number> = {};
      for (const s of topSuggestions) {
        actionTypeCounts[s.action_type] = (actionTypeCounts[s.action_type] || 0) + 1;
      }

      return {
        success: true,
        focus: focusArea,
        total_suggestions: topSuggestions.length,
        action_type_breakdown: actionTypeCounts,
        suggestions: topSuggestions,
      };
    } catch (err: any) {
      console.error('[suggest_next_best_action] Error:', err.message);
      return { success: false, message: `Failed to generate suggestions: ${err.message}` };
    }
  },

  triggerExamples: [
    'who should I call today',
    "what's my priority list",
    'what deals need attention',
  ],
};

export default suggestNextBestAction;
