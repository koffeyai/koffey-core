/**
 * Skill: analyze_deal
 *
 * Open the SCOUTPAD AI coaching panel for deep deal analysis.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';
import { normalizeEntityHint } from '../../intent/interpret-message.ts';

function cleanEntityDisplayName(displayName: string): string {
  if (!displayName) return '';

  let cleaned = displayName;
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');

  const suffixPattern = /\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{4}|\$[\d,.]+[KMB]?|prospecting|qualification|proposal|negotiation|closed[_\s]?(won|lost)?|\d+%?).*$/i;

  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(suffixPattern, '');
  }
  return cleaned.trim();
}

function stripArticles(name: string): string {
  return name.replace(/^(the|a|an)\s+/i, '').trim();
}

function resolveEntityFromContext(
  entityContext: any,
  entityType: 'deal',
  nameHint?: string
): string | null {
  if (!entityContext?.referencedEntities) return null;
  const entities = entityContext.referencedEntities[`${entityType}s`];
  if (!entities || entities.length === 0) return null;

  if (entityContext.primaryEntity?.type === entityType) {
    if (!nameHint) return entityContext.primaryEntity.id;
    const hintClean = stripArticles(cleanEntityDisplayName(nameHint)).toLowerCase();
    const primaryClean = stripArticles(entityContext.primaryEntity.name).toLowerCase();
    if (primaryClean.includes(hintClean) || hintClean.includes(primaryClean)) {
      return entityContext.primaryEntity.id;
    }
  }

  if (nameHint) {
    const cleanedHint = cleanEntityDisplayName(nameHint).toLowerCase();
    const cleanedHintNoArticle = stripArticles(cleanedHint).toLowerCase();
    const match = entities.find((e: any) => {
      const cleanedName = (e.name || '').toLowerCase();
      const cleanedNameNoArticle = stripArticles(e.name || '').toLowerCase();
      return cleanedName.includes(cleanedHint) ||
        cleanedHint.includes(cleanedName) ||
        cleanedNameNoArticle.includes(cleanedHintNoArticle) ||
        cleanedHintNoArticle.includes(cleanedNameNoArticle);
    });
    if (match) return match.id;
    return null;
  }

  return entities[0]?.id || null;
}

function formatDealForUI(deal: any, zoomLevel: 'tactical' | 'strategic' = 'tactical') {
  return {
    id: deal.id,
    name: deal.name,
    amount: deal.amount,
    stage: deal.stage,
    probability: deal.probability,
    expected_close_date: deal.expected_close_date,
    close_date: deal.close_date,
    description: deal.description,
    notes: deal.notes,
    organization_id: deal.organization_id,
    account_id: deal.account_id,
    account_name: deal.accounts?.name,
    stakeholders: deal.stakeholders,
    last_activity: deal.last_activity,
    competitor_info: deal.competitor_info,
    timeline: deal.timeline,
    zoomLevel,
  };
}

async function getDealById(ctx: ToolExecutionContext, dealId: string) {
  const { data, error } = await ctx.supabase
    .from('deals')
    .select('*, accounts(name)')
    .eq('id', dealId)
    .eq('organization_id', ctx.organizationId)
    .single();
  if (error || !data) return null;
  return data;
}

async function searchDealsByName(ctx: ToolExecutionContext, rawName: string) {
  const normalized = normalizeEntityHint(rawName, { entityType: 'deal' });
  const cleanedName = cleanEntityDisplayName(rawName);
  const noArticle = stripArticles(cleanedName);
  const orderedTerms = [normalized, cleanedName, noArticle]
    .map((term) => String(term || '').trim())
    .filter(Boolean)
    .filter((term, index, arr) => arr.indexOf(term) === index);
  const displayName = normalized || cleanedName;
  const primaryOr = orderedTerms.map((term) => `name.ilike.%${term}%`).join(',');
  const fallbackBase = orderedTerms[0] || displayName;
  const words = fallbackBase.split(/\s+/).filter((w) => w.length > 2);
  const pattern = words.length > 0 ? `%${words.join('%')}%` : `%${fallbackBase}%`;

  const { data: deals, error } = await ctx.supabase
    .from('deals')
    .select('*, accounts(name)')
    .eq('organization_id', ctx.organizationId)
    .or(primaryOr)
    .limit(5);

  if (!error && deals && deals.length > 0) return { cleanedName: displayName, deals };

  const { data: fallbackDeals, error: fallbackError } = await ctx.supabase
    .from('deals')
    .select('*, accounts(name)')
    .eq('organization_id', ctx.organizationId)
    .ilike('name', pattern)
    .limit(5);

  if (fallbackError) return { cleanedName: displayName, deals: [] as any[] };
  return { cleanedName: displayName, deals: fallbackDeals || [] };
}

const analyzeDeal: SkillDefinition = {
  name: 'analyze_deal',
  displayName: 'Analyze Deal',
  domain: 'coaching',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'analyze_deal',
      description: "Open the SCOUTPAD AI coaching panel to deeply analyze a specific deal. Provides deal grade (A-F), probability assessment, identified risks, opportunities, and actionable next steps. Use when user wants to analyze, coach, review, or get insights on a deal. If no deal is specified, uses the most recently discussed deal from the conversation. Supports zoom_level parameter for tactical (deal-only) or strategic (include account history) analysis.",
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'UUID of the deal - ALWAYS use this when available from [ENTITY CONTEXT] or previous tool results. This is more reliable than deal_name.',
          },
          deal_name: {
            type: 'string',
            description: "Name of the deal to search for. CRITICAL: Use ONLY the base company/deal name (e.g., 'Home Depot', 'Pepsi'), NEVER include dates, amounts, stages, or any suffixed data (WRONG: 'Home Depot - 1/24/2026', RIGHT: 'Home Depot').",
          },
          zoom_level: {
            type: 'string',
            enum: ['tactical', 'strategic'],
            description: "Analysis depth: 'tactical' for deal-only analysis (default), 'strategic' to include full account relationship history and patterns. User may say 'quick analysis' (tactical) or 'deep dive with history' (strategic).",
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "analyze this deal", "coach me on X", "evaluate the deal", "grade this deal"** → Use analyze_deal
  - Opens interactive SCOUTPAD coaching panel
  - Provides deal grade (A-F), risks, opportunities, and next steps
  - tactical = deal-only, strategic = includes account history`,

  execute: async (ctx: ToolExecutionContext) => {
    const args = (ctx.args || {}) as {
      deal_id?: string;
      deal_name?: string;
      zoom_level?: 'tactical' | 'strategic';
    };
    const zoomLevel: 'tactical' | 'strategic' = args.zoom_level === 'strategic' ? 'strategic' : 'tactical';

    let dealId = args.deal_id;
    if (!dealId && args.deal_name && ctx.entityContext) {
      dealId = resolveEntityFromContext(ctx.entityContext, 'deal', args.deal_name) || undefined;
    }

    if (!dealId && !args.deal_name && ctx.activeContext?.lastEntityType === 'deals' && ctx.activeContext.lastEntityIds?.length === 1) {
      dealId = ctx.activeContext.lastEntityIds[0];
    }

    if (dealId) {
      const deal = await getDealById(ctx, dealId);
      if (deal) {
        return {
          success: true,
          message: `Opening SCOUTPAD analysis for **${deal.name}**.`,
          action: {
            type: 'open_coaching_dialog',
            deal: formatDealForUI(deal, zoomLevel),
          },
        };
      }
    }

    if (args.deal_name) {
      const { cleanedName, deals } = await searchDealsByName(ctx, args.deal_name);
      if (!deals || deals.length === 0) {
        return {
          success: false,
          message: `I couldn't find a deal matching "${cleanedName}". Tell me the exact deal name or ask me to list your open deals first.`,
        };
      }

      if (deals.length > 1) {
        const dealList = deals.map((d: any, i: number) =>
          `${i + 1}. **${d.name}** - $${(d.amount || 0).toLocaleString()} (${d.stage || 'unknown'})`
        ).join('\n');

        return {
          success: false,
          message: `I found multiple matches for "${cleanedName}":\n\n${dealList}\n\nWhich one should I analyze?`,
        };
      }

      return {
        success: true,
        message: `Opening SCOUTPAD analysis for **${deals[0].name}**.`,
        action: {
          type: 'open_coaching_dialog',
          deal: formatDealForUI(deals[0], zoomLevel),
        },
      };
    }

    if (ctx.activeContext?.lastEntityType === 'deals' && (ctx.activeContext.lastEntityNames?.length || 0) > 1) {
      const dealList = (ctx.activeContext.lastEntityNames || []).slice(0, 5).map((name: string, i: number) =>
        `${i + 1}. **${name}**`
      ).join('\n');
      return {
        success: false,
        message: `I found several recent deals:\n\n${dealList}\n\nWhich one should I analyze?`,
      };
    }

    return {
      success: false,
      message: "Which deal should I analyze? Share the deal name, or ask me to list your open deals first.",
    };
  },

  triggerExamples: [
    'analyze the pepsi deal',
    'coach me on the home depot opportunity',
    'grade this deal',
    'deep dive on the acme deal',
  ],
};

export default analyzeDeal;
