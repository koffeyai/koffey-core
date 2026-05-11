/**
 * Skill: get_deal_context
 *
 * Fetch comprehensive, pre-joined deal context from the
 * get_deal_context_for_llm Postgres RPC. Returns deal info, account,
 * contacts, stakeholders, activities, tasks, notes, contract terms,
 * email snippets, engagement stats, and contact memory
 * in a single call — optimised for LLM synthesis.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

// ---------------------------------------------------------------------------
// Entity-name helpers (shared pattern from analyze-deal)
// ---------------------------------------------------------------------------

function cleanEntityDisplayName(displayName: string): string {
  if (!displayName) return '';

  let cleaned = displayName;
  // Strip markdown bold markers
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  // Strip leading numbered-list prefixes ("1. ")
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  // Strip trailing parenthetical suffixes
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  // Normalise dashes
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');

  // Strip trailing " - <date|amount|stage|percent>" suffixes iteratively
  const suffixPattern =
    /\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{4}|\$[\d,.]+[KMB]?|prospecting|qualification|proposal|negotiation|closed[_\s]?(won|lost)?|\d+%?).*$/i;

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

function isUuid(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

/** Strip trailing entity-type words ("deal", "deals", "opportunity", "account", "contact") */
function stripEntitySuffix(name: string): string {
  return name.replace(/\s+(?:deal|deals|opportunity|opportunities|account|accounts|contact|contacts)$/i, '').trim() || name;
}

function quadrantLabel(quadrant?: string | null): string {
  const labels: Record<string, string> = {
    champion_influential: 'Champion (Influential)',
    champion_peripheral: 'Supporter (Peripheral)',
    adversarial_influential: 'Blocker (Influential)',
    adversarial_peripheral: 'Tactical Blocker (Peripheral)',
  };
  return quadrant ? labels[quadrant] || 'Unranked' : 'Unranked';
}

function compactContactName(contact: any): string {
  return contact?.full_name
    || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim()
    || contact?.name
    || 'Unknown contact';
}

async function buildMultipleDealContext(
  ctx: ToolExecutionContext,
  deals: Array<{ id: string; name?: string; amount?: number | null; stage?: string | null }>,
  label: string,
) {
  const dealIds = deals.map((d) => d.id).filter(Boolean);
  if (dealIds.length === 0) {
    return { success: false, message: `I found matching deals for "${label}", but could not read their IDs.` };
  }

  const { data: dealRows, error: dealError } = await ctx.supabase
    .from('deals')
    .select('id, name, amount, currency, stage, probability, close_date, expected_close_date, description, account_id, created_at, updated_at, accounts(id, name, website)')
    .eq('organization_id', ctx.organizationId)
    .in('id', dealIds)
    .order('updated_at', { ascending: false });

  if (dealError) {
    return { success: false, message: `Error fetching matching deals: ${dealError.message}` };
  }

  const { data: stakeholderRows, error: stakeholderError } = await ctx.supabase
    .from('deal_contacts')
    .select(`
      deal_id,
      role_in_deal,
      quadrant,
      support_axis,
      influence_axis,
      contact:contacts(
        id,
        first_name,
        last_name,
        full_name,
        email,
        title,
        position,
        company
      )
    `)
    .eq('organization_id', ctx.organizationId)
    .in('deal_id', dealIds);

  if (stakeholderError) {
    return { success: false, message: `Error fetching deal stakeholders: ${stakeholderError.message}` };
  }

  const stakeholdersByDeal = new Map<string, any[]>();
  for (const row of stakeholderRows || []) {
    const contact = (row as any).contact || {};
    const enriched = {
      id: contact.id,
      name: compactContactName(contact),
      email: contact.email || null,
      position: contact.position || contact.title || null,
      company: contact.company || null,
      role_in_deal: (row as any).role_in_deal || null,
      quadrant: (row as any).quadrant || null,
      quadrant_label: quadrantLabel((row as any).quadrant),
      support_axis: (row as any).support_axis ?? null,
      influence_axis: (row as any).influence_axis ?? null,
    };
    if (!stakeholdersByDeal.has((row as any).deal_id)) stakeholdersByDeal.set((row as any).deal_id, []);
    stakeholdersByDeal.get((row as any).deal_id)!.push(enriched);
  }

  const shapedDeals = (dealRows || []).map((deal: any) => {
    return {
      id: deal.id,
      name: deal.name,
      amount: deal.amount,
      currency: deal.currency,
      stage: deal.stage,
      probability: deal.probability,
      close_date: deal.close_date || deal.expected_close_date || null,
      description: deal.description,
      account: deal.accounts ? {
        id: deal.accounts.id,
        name: deal.accounts.name,
        website: deal.accounts.website,
      } : null,
      stakeholders: stakeholdersByDeal.get(deal.id) || [],
      created_at: deal.created_at,
      updated_at: deal.updated_at,
    };
  });

  const optionLines = shapedDeals.slice(0, 5).map((deal: any, index: number) => {
    const facts = [
      deal.stage ? `stage ${deal.stage}` : '',
      typeof deal.amount === 'number' ? `$${deal.amount.toLocaleString('en-US')}` : '',
      deal.close_date ? `close ${deal.close_date}` : '',
      deal.account?.name ? `account ${deal.account.name}` : '',
    ].filter(Boolean);
    return `${index + 1}. ${deal.name || deal.id}${facts.length ? ` (${facts.join(', ')})` : ''}`;
  });

  return {
    success: false,
    _needsInput: true,
    clarification_type: 'multiple_deals',
    multiple_deals: true,
    label,
    deals: shapedDeals,
    message: `I found ${shapedDeals.length} matching deals for "${label}". Which one should I use?\n${optionLines.join('\n')}`,
    follow_up_prompt: 'Reply with the deal name or number.',
  };
}

// ---------------------------------------------------------------------------
// Entity resolution from conversation context
// ---------------------------------------------------------------------------

function resolveEntityFromContext(
  entityContext: ToolExecutionContext['entityContext'],
  entityType: 'deal',
  nameHint?: string,
): string | null {
  if (!entityContext?.referencedEntities) return null;

  const entities = entityContext.referencedEntities[`${entityType}s`];
  if (!entities || entities.length === 0) return null;

  // If the primary entity is a deal, try to match it first
  if (entityContext.primaryEntity?.type === entityType) {
    if (!nameHint) return entityContext.primaryEntity.id ?? null;
    const hintClean = stripArticles(cleanEntityDisplayName(nameHint)).toLowerCase();
    const primaryClean = stripArticles(entityContext.primaryEntity.name ?? '').toLowerCase();
    if (primaryClean.includes(hintClean) || hintClean.includes(primaryClean)) {
      return entityContext.primaryEntity.id ?? null;
    }
  }

  // Try fuzzy-matching against all referenced deal entities
  if (nameHint) {
    const cleanedHint = cleanEntityDisplayName(nameHint).toLowerCase();
    const cleanedHintNoArticle = stripArticles(cleanedHint).toLowerCase();
    const match = entities.find((e: { id: string; name: string }) => {
      const cleanedName = (e.name || '').toLowerCase();
      const cleanedNameNoArticle = stripArticles(e.name || '').toLowerCase();
      return (
        cleanedName.includes(cleanedHint) ||
        cleanedHint.includes(cleanedName) ||
        cleanedNameNoArticle.includes(cleanedHintNoArticle) ||
        cleanedHintNoArticle.includes(cleanedNameNoArticle)
      );
    });
    if (match) return match.id;
    return null;
  }

  // No name hint — return first referenced deal
  return entities[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

const getDealContext: SkillDefinition = {
  name: 'get_deal_context',
  displayName: 'Get Deal Context',
  domain: 'context',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_deal_context',
      description:
        'Fetch comprehensive context for a deal in a single call: deal info, account, contacts, stakeholders, activities, tasks, notes, contract terms, recent email snippets, engagement stats, and contact memory. Use this INSTEAD of multiple search_crm calls when you need a full picture of a deal. Prefer deal_id over deal_name when available from entity context or previous tool results.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description:
              'UUID of the deal. Use when available from entity context or previous tool results.',
          },
          deal_name: {
            type: 'string',
            description:
              "Name of the deal to search for. Use ONLY the base company/deal name (e.g., 'Acme Corp', 'Pepsi'), NEVER include dates, amounts, stages, or suffixed data.",
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "tell me about [deal]", "what's happening with [deal]", "give me context on [deal]", "brief me on [deal]", "deal summary", "deal overview"** \u2192 Use get_deal_context
- Returns complete deal context in a single call: deal info, account, contacts, stakeholders, activities, tasks, notes, contract terms, recent email snippets, engagement stats, and contact memory
- Use this INSTEAD of multiple search_crm calls when you need comprehensive deal information
- Prefer deal_id over deal_name when available from context`,

  execute: async (ctx: ToolExecutionContext) => {
    const args = (ctx.args || {}) as {
      deal_id?: string;
      deal_name?: string;
    };

    // ----- 1. Resolve deal_id from args / entityContext / activeContext -----

    let dealName = args.deal_name;
    let dealId = isUuid(args.deal_id) ? args.deal_id : undefined;
    if (args.deal_id && !dealId && !dealName) {
      dealName = args.deal_id;
    }

    // Try entity context when we have a name hint but no id
    if (!dealId && dealName && ctx.entityContext) {
      const resolvedId = resolveEntityFromContext(ctx.entityContext, 'deal', dealName);
      if (isUuid(resolvedId)) dealId = resolvedId ?? undefined;
    }

    // Try entity context without a name hint (primary entity)
    if (!dealId && !dealName && ctx.entityContext) {
      const resolvedId = resolveEntityFromContext(ctx.entityContext, 'deal');
      if (isUuid(resolvedId)) dealId = resolvedId ?? undefined;
    }

    // Fall back to activeContext (most recently discussed deal)
    if (
      !dealId &&
      !dealName &&
      ctx.activeContext?.lastEntityType === 'deals' &&
      ctx.activeContext.lastEntityIds?.length === 1
    ) {
      const activeId = ctx.activeContext.lastEntityIds[0];
      if (isUuid(activeId)) dealId = activeId;
    }

    // ----- 2. If still no id but we have a name, search deals table -----

    if (!dealId && dealName) {
      const cleanedName = cleanEntityDisplayName(dealName);
      const noArticle = stripArticles(cleanedName);
      const noSuffix = stripEntitySuffix(noArticle);

      // Build OR conditions — include stripped variants for "the Salesforce deal" → "Salesforce"
      const orParts = new Set([cleanedName, noArticle, noSuffix].filter(Boolean));
      const orClause = [...orParts].map(n => `name.ilike.%${n}%`).join(',');

      const { data: deals, error } = await ctx.supabase
        .from('deals')
        .select('id, name, amount, stage')
        .eq('organization_id', ctx.organizationId)
        .or(orClause)
        .limit(5);

      if (error) {
        return { success: false, message: `Error searching for deal: ${error.message}` };
      }

      if (!deals || deals.length === 0) {
        // Fallback: search by linked account name (e.g. "Salesforce deal" → account "Salesforce" → its deals)
        const { data: accountDeals } = await ctx.supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .or([...orParts].map(n => `name.ilike.%${n}%`).join(','))
          .limit(3);
        const accountIds = (accountDeals || []).map((a: any) => a.id).filter(Boolean);
        if (accountIds.length > 0) {
          const { data: linkedDeals } = await ctx.supabase
            .from('deals')
            .select('id, name, amount, stage')
            .eq('organization_id', ctx.organizationId)
            .in('account_id', accountIds)
            .limit(5);
          if (linkedDeals && linkedDeals.length > 0) {
            if (linkedDeals.length === 1) {
              dealId = linkedDeals[0].id;
            } else {
              return await buildMultipleDealContext(ctx, linkedDeals as any[], noSuffix);
            }
          }
        }
        if (!dealId) {
          return {
            success: false,
            message: `I couldn't find a deal matching "${cleanedName}". Try the exact deal name, or ask me to list your open deals first.`,
          };
        }
      }

      if (deals.length > 1) {
        return await buildMultipleDealContext(ctx, deals as any[], cleanedName);
      }

      // Single match
      dealId = deals[0].id;
    }

    // ----- 3. If we still don't have a deal_id, ask the user -----

    if (!dealId) {
      // If activeContext has multiple deals, offer disambiguation
      if (
        ctx.activeContext?.lastEntityType === 'deals' &&
        (ctx.activeContext.lastEntityNames?.length || 0) > 1
      ) {
        const dealList = (ctx.activeContext.lastEntityNames || [])
          .slice(0, 5)
          .map((name: string, i: number) => `${i + 1}. **${name}**`)
          .join('\n');
        return {
          success: false,
          message: `I see several recent deals:\n\n${dealList}\n\nWhich one would you like context on?`,
        };
      }

      return {
        success: false,
        message:
          'Which deal would you like context on? Share the deal name, or ask me to list your open deals first.',
      };
    }

    // ----- 4. Call the RPC -----

    const { data, error } = await ctx.supabase.rpc('get_deal_context_for_llm', {
      p_deal_id: dealId,
      p_organization_id: ctx.organizationId,
    });

    if (error) {
      return { success: false, message: `Error fetching deal context: ${error.message}` };
    }

    if (!data) {
      return {
        success: false,
        message:
          'Could not retrieve deal context. The deal may not exist or you may not have access.',
      };
    }

    // ----- 5. Return pre-shaped context -----

    return {
      ...data,
      __trusted_context: true,
    };
  },

  triggerExamples: [
    'tell me about the Acme deal',
    "what's happening with Pepsi?",
    'give me context on the Home Depot opportunity',
    'brief me on this deal',
    'deal summary for Microsoft',
    'deal overview',
  ],
};

export default getDealContext;
