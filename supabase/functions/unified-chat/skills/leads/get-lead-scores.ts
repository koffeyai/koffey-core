/**
 * Skill: get_lead_scores
 *
 * Get lead scores and qualification data for contacts.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getLeadScores: SkillDefinition = {
  name: 'get_lead_scores',
  displayName: 'Get Lead Scores',
  domain: 'leads',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'get_lead_scores',
      description: "Get lead scores and qualification data for contacts. Shows overall score, BANT breakdown, fit/intent/engagement scores, and grade (A+ through F). Use for 'hottest leads', 'qualified leads', 'lead scoring', 'who should I call?'.",
      parameters: {
        type: 'object',
        properties: {
          min_score: {
            type: 'number',
            description: 'Minimum overall_lead_score (0-100). Use 60+ for qualified leads.',
          },
          grade: {
            type: 'string',
            enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
            description: 'Filter by score grade',
          },
          qualification_stage: {
            type: 'string',
            enum: ['captured', 'enriched', 'engaged', 'discovering', 'qualified', 'disqualified'],
            description: 'Filter by qualification stage',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 20)',
          },
          recalculate: {
            type: 'boolean',
            description: 'If true, recalculate scores before returning (slower but fresh data)',
          },
        },
      },
    },
  },

  instructions: `**For "hottest leads", "qualified leads", "lead scores"** → Use get_lead_scores
  - Shows overall score, BANT breakdown, fit/intent/engagement scores, and grade (A+ through F)`,

  execute: async (ctx: ToolExecutionContext) => {
    const { min_score, grade, qualification_stage, limit, recalculate } = ctx.args as {
      min_score?: number;
      grade?: string;
      qualification_stage?: string;
      limit?: number;
      recalculate?: boolean;
    };

    const resultLimit = Math.min(Math.max(limit || 20, 1), 100);

    // If recalculate requested, trigger score recalculation via RPC for org contacts
    if (recalculate) {
      // Best-effort batch recalc — get contact IDs and call the DB function
      const { data: contactIds } = await ctx.supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .limit(resultLimit);

      if (contactIds) {
        for (const c of contactIds) {
          await ctx.supabase.rpc('calculate_lead_score', {
            p_contact_id: c.id,
            p_organization_id: ctx.organizationId,
          });
        }
      }
    }

    // Query contacts with scoring fields
    let query = ctx.supabase
      .from('contacts')
      .select(
        'id, full_name, first_name, last_name, email, company, title, qualification_stage, ' +
        'overall_lead_score, fit_score, intent_score, engagement_score, bant_score, ' +
        'budget_status, authority_level, need_urgency, timeline_status, lead_source'
      )
      .eq('organization_id', ctx.organizationId)
      .order('overall_lead_score', { ascending: false })
      .limit(resultLimit);

    if (min_score !== undefined) query = query.gte('overall_lead_score', min_score);
    if (qualification_stage) query = query.eq('qualification_stage', qualification_stage);

    const { data, error } = await query;
    if (error) throw error;

    // Map grade from score if grade filter is requested
    const gradeFromScore = (score: number): string => {
      if (score >= 90) return 'A+';
      if (score >= 80) return 'A';
      if (score >= 70) return 'B+';
      if (score >= 60) return 'B';
      if (score >= 50) return 'C+';
      if (score >= 40) return 'C';
      if (score >= 25) return 'D';
      return 'F';
    };

    let results = (data || []).map((c: any) => ({
      id: c.id,
      name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      email: c.email,
      company: c.company,
      title: c.title,
      qualification_stage: c.qualification_stage,
      overall_lead_score: c.overall_lead_score || 0,
      grade: gradeFromScore(c.overall_lead_score || 0),
      fit_score: c.fit_score || 0,
      intent_score: c.intent_score || 0,
      engagement_score: c.engagement_score || 0,
      bant_score: c.bant_score || 0,
      bant: {
        budget: c.budget_status,
        authority: c.authority_level,
        need: c.need_urgency,
        timeline: c.timeline_status,
      },
      lead_source: c.lead_source,
    }));

    if (grade) {
      results = results.filter((r: any) => r.grade === grade);
    }

    return {
      leads: results,
      count: results.length,
      filters: {
        min_score: min_score ?? null,
        grade: grade ?? null,
        qualification_stage: qualification_stage ?? null,
      },
    };
  },

  triggerExamples: [
    'show my hottest leads',
    'who are my qualified leads',
    'lead scores for this quarter',
  ],
};

export default getLeadScores;
