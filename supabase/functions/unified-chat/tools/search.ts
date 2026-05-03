/**
 * Search & Discovery Operations — extracted from unified-chat/index.ts
 *
 * Contains: executeSearch, executeSemanticSearch, executeEnrichContacts
 */

import { getQueryEmbedding } from '../../_shared/query-embedding.ts';

const GENERIC_QUERY_PLACEHOLDERS = new Set([
  'this',
  'that',
  'it',
  'deal',
  'account',
  'contact',
  'this deal',
  'that deal',
  'this account',
  'that account',
  'this contact',
  'that contact',
]);

function normalizeSearchQuery(entityType: string, rawQuery: string | undefined): string | null {
  let query = String(rawQuery || '').trim();
  if (!query) return null;
  query = query
    .replace(/\bdael\b/gi, 'deal')
    .replace(/\boppurtunit(?:y|ies)\b/gi, 'opportunity')
    .replace(/\bopprotunit(?:y|ies)\b/gi, 'opportunity')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/[?!.,:;]+$/g, '')
    .trim();

  if (entityType === 'deals') {
    query = query.replace(/\s+(?:deal|deals|opportunity|opportunities)$/i, '').trim() || query;
  } else if (entityType === 'accounts') {
    query = query.replace(/\s+(?:account|accounts)$/i, '').trim() || query;
  } else if (entityType === 'contacts') {
    query = query.replace(/\s+(?:contact|contacts)$/i, '').trim() || query;
  }

  const lowered = query.toLowerCase();
  if (GENERIC_QUERY_PLACEHOLDERS.has(lowered)) return null;
  return query || null;
}

function normalizeForSimilarity(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeForSimilarity(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeForSimilarity(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function diceCoefficient(left: string, right: string): number {
  const a = normalizeForSimilarity(left).replace(/\s/g, '');
  const b = normalizeForSimilarity(right).replace(/\s/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = bigrams.get(gram) || 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      matches += 1;
    }
  }

  return (2 * matches) / ((a.length - 1) + (b.length - 1));
}

// ============================================================================
// executeSearch
// ============================================================================

export async function executeSearch(supabase: any, args: any, organizationId: string) {
  const { entity_type, query, filters, sort_by, sort_direction } = args;
  // Default to list_all when no query is provided — prevents empty results
  // when LLM calls search_crm with entity_type but forgets list_all flag
  const list_all = args.list_all || (!query && !filters);
  const normalizedQuery = normalizeSearchQuery(entity_type, query);
  const entityTableMap: Record<string, string> = {
    'contacts': 'contacts',
    'accounts': 'accounts',
    'deals': 'deals',
    'activities': 'activities'
  };
  const tableName = entityTableMap[entity_type];
  if (!tableName) {
    throw new Error(`Unsupported entity type: "${entity_type}". Valid options: ${Object.keys(entityTableMap).join(', ')}`);
  }

  if (query && !normalizedQuery && !list_all) {
    return {
      results: [],
      count: 0,
      total_count: 0,
      entity_type,
      message: 'Please clarify which record you want me to search for.',
      __forceNoCitations: true,
    };
  }

  const requestedSort = sort_by || 'created_at';
  let ascending = sort_direction === 'asc';

  const sortFieldMap: Record<string, string> = {
    'created_at': 'created_at',
    'updated_at': 'updated_at',
    'amount': 'amount',
    'close_date': 'expected_close_date',
    'name': entity_type === 'contacts' ? 'full_name' : (entity_type === 'activities' ? 'title' : 'name'),
    'probability': 'probability',
    'scheduled_at': 'scheduled_at',
    'lead_score': 'overall_lead_score'
  };
  const sortField = sortFieldMap[requestedSort];
  if (!sortField) {
    throw new Error(`Unsupported sort field: "${requestedSort}". Valid options: ${Object.keys(sortFieldMap).join(', ')}`);
  }

  // When sorting by probability or amount, push NULLs to the end regardless of direction
  const nullsFirst = false;
  const selectClause = entity_type === 'deals'
    ? '*, accounts(name), contacts(full_name,email,company)'
    : '*';
  let dbQuery = supabase
    .from(tableName)
    .select(selectClause, { count: 'exact' })
    .eq('organization_id', organizationId)
    .order(sortField, { ascending, nullsFirst })
    .limit(list_all ? 50 : 20);

  // When explicitly sorting by probability, exclude deals with no probability set
  if (requestedSort === 'probability' && entity_type === 'deals') {
    dbQuery = dbQuery.not('probability', 'is', null);
  }

  if (normalizedQuery && !list_all) {
    if (entity_type === 'contacts') {
      dbQuery = dbQuery.or(
        `full_name.ilike.%${normalizedQuery}%,first_name.ilike.%${normalizedQuery}%,last_name.ilike.%${normalizedQuery}%,email.ilike.%${normalizedQuery}%,company.ilike.%${normalizedQuery}%,title.ilike.%${normalizedQuery}%,phone.ilike.%${normalizedQuery}%,notes.ilike.%${normalizedQuery}%,lead_source.ilike.%${normalizedQuery}%,qualification_notes.ilike.%${normalizedQuery}%`
      );
    } else if (entity_type === 'accounts') {
      dbQuery = dbQuery.or(`name.ilike.%${normalizedQuery}%,website.ilike.%${normalizedQuery}%,industry.ilike.%${normalizedQuery}%,domain.ilike.%${normalizedQuery}%,phone.ilike.%${normalizedQuery}%`);
    } else if (entity_type === 'activities') {
      dbQuery = dbQuery.or(`title.ilike.%${normalizedQuery}%,subject.ilike.%${normalizedQuery}%,description.ilike.%${normalizedQuery}%,type.ilike.%${normalizedQuery}%`);
    } else if (entity_type === 'deals') {
      const dealOrParts = [
        `name.ilike.%${normalizedQuery}%`,
        `description.ilike.%${normalizedQuery}%`,
        `competitor_name.ilike.%${normalizedQuery}%`,
        `key_use_case.ilike.%${normalizedQuery}%`,
        `lead_source.ilike.%${normalizedQuery}%`,
      ];

      // Support "is there a deal with <company>" by matching linked account/contact records.
      const { data: accountMatches } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`name.ilike.%${normalizedQuery}%,website.ilike.%${normalizedQuery}%,industry.ilike.%${normalizedQuery}%,domain.ilike.%${normalizedQuery}%`)
        .limit(15);
      const accountIds = (accountMatches || []).map((a: any) => a.id).filter(Boolean);
      if (accountIds.length > 0) {
        dealOrParts.push(`account_id.in.(${accountIds.join(',')})`);
      }

      const { data: contactMatches } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`full_name.ilike.%${normalizedQuery}%,email.ilike.%${normalizedQuery}%,company.ilike.%${normalizedQuery}%,title.ilike.%${normalizedQuery}%`)
        .limit(15);
      const contactIds = (contactMatches || []).map((c: any) => c.id).filter(Boolean);
      if (contactIds.length > 0) {
        dealOrParts.push(`contact_id.in.(${contactIds.join(',')})`);
      }

      dbQuery = dbQuery.or(dealOrParts.join(','));
    } else {
      dbQuery = dbQuery.or(`name.ilike.%${normalizedQuery}%`);
    }
  }

  if (filters) {
    if (filters.amount_gt) dbQuery = dbQuery.gt('amount', filters.amount_gt);
    if (filters.amount_lt) dbQuery = dbQuery.lt('amount', filters.amount_lt);
    if (filters.stage) dbQuery = dbQuery.eq('stage', filters.stage);
    if (filters.stage_not_in && Array.isArray(filters.stage_not_in) && filters.stage_not_in.length > 0) {
      for (const excludedStage of filters.stage_not_in) {
        dbQuery = dbQuery.neq('stage', excludedStage);
      }
    }
    if (typeof filters.probability_gte === 'number') dbQuery = dbQuery.gte('probability', filters.probability_gte);
    if (typeof filters.probability_lte === 'number') dbQuery = dbQuery.lte('probability', filters.probability_lte);
    if (filters.industry && entity_type === 'accounts') dbQuery = dbQuery.ilike('industry', `%${filters.industry}%`);
    if (filters.industry && entity_type === 'deals') {
      const { data: matchingAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('industry', `%${filters.industry}%`)
        .limit(100);
      const accountIds = (matchingAccounts || []).map((a: any) => a.id).filter(Boolean);
      if (accountIds.length > 0) {
        dbQuery = dbQuery.in('account_id', accountIds);
      } else {
        return { results: [], count: 0, entity_type, message: `No deals found for industry "${filters.industry}".` };
      }
    }
    if (filters.competitor_name && entity_type === 'deals') dbQuery = dbQuery.ilike('competitor_name', `%${filters.competitor_name}%`);
    // Contact-specific filters
    if (filters.lead_source && entity_type === 'contacts') dbQuery = dbQuery.ilike('lead_source', `%${filters.lead_source}%`);
    if (filters.nurture_stage && entity_type === 'contacts') dbQuery = dbQuery.eq('nurture_stage', filters.nurture_stage);
    // Contact-by-deal filter: look up contact IDs via deal_contacts junction table
    if (filters.deal_id && entity_type === 'contacts') {
      const { data: dcLinks } = await supabase
        .from('deal_contacts')
        .select('contact_id')
        .eq('deal_id', filters.deal_id)
        .eq('organization_id', organizationId);
      const contactIds = (dcLinks || []).map((l: any) => l.contact_id);
      if (contactIds.length > 0) {
        dbQuery = dbQuery.in('id', contactIds);
      } else {
        return { results: [], count: 0, entity_type, message: 'No contacts linked to this deal.' };
      }
    }
    // Activity-specific filters
    if (filters.activity_type && entity_type === 'activities') dbQuery = dbQuery.eq('type', filters.activity_type);
    if (typeof filters.completed === 'boolean' && entity_type === 'activities') dbQuery = dbQuery.eq('completed', filters.completed);
    if (filters.never_contacted === true && entity_type === 'contacts') dbQuery = dbQuery.is('first_activity_at', null);
    // For activities, filter by scheduled_at (when the meeting/call happens); for other entities, use created_at
    const dateColumn = entity_type === 'activities' ? 'scheduled_at' : 'created_at';
    if (filters.date_from) dbQuery = dbQuery.gte(dateColumn, filters.date_from);
    if (filters.date_to) dbQuery = dbQuery.lte(dateColumn, filters.date_to);
  }

  const { data, error, count: totalCount } = await dbQuery;
  if (error) throw error;

  // Fuzzy fallback: if query returned nothing, try matching individual words
  if (normalizedQuery && !list_all && (!data || data.length === 0)) {
    const nameColumn = entity_type === 'contacts' ? 'full_name' : (entity_type === 'activities' ? 'title' : 'name');

    // Fetch recent entities and do client-side fuzzy match
    const { data: candidates } = await supabase
      .from(tableName)
      .select(`id, ${nameColumn}`)
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (candidates?.length) {
      const queryLower = normalizedQuery.toLowerCase();
      const fuzzyMatches = candidates.filter((c: any) => {
        const name = (c[nameColumn] || '').toLowerCase();
        const normalizedName = normalizeForSimilarity(name);
        const normalizedNeedle = normalizeForSimilarity(queryLower);
        if (!normalizedName || !normalizedNeedle) return false;
        if (normalizedName.includes(normalizedNeedle) || normalizedNeedle.includes(normalizedName)) return true;
        const tokenScore = tokenSimilarity(normalizedNeedle, normalizedName);
        const diceScore = diceCoefficient(normalizedNeedle, normalizedName);
        return tokenScore >= 0.75 || diceScore >= 0.82;
      });

      if (fuzzyMatches.length > 0) {
        // Re-query with the matched IDs for full data
        const matchedIds = fuzzyMatches.slice(0, 5).map((m: any) => m.id);
        const { data: fullResults } = await supabase
          .from(tableName)
          .select(selectClause)
          .eq('organization_id', organizationId)
          .in('id', matchedIds);

        return {
          results: fullResults || [],
          count: fullResults?.length || 0,
          entity_type,
          sorted_by: requestedSort,
          sort_direction: ascending ? 'asc' : 'desc',
          fuzzy_match: true,
          original_query: query,
          __citationRows: (fullResults || []).slice(0, 8),
        };
      }
    }

    // Unified search fallback: use TSVECTOR + vector similarity via unified_search RPC
    // This catches conceptual/semantic matches that ILIKE and client-side fuzzy miss
    try {
      const singularType = entity_type.replace(/s$/, ''); // contacts → contact
      let queryEmbedding: number[] | null = null;
      try {
        queryEmbedding = await getQueryEmbedding(normalizedQuery);
      } catch (embErr: any) {
        console.log('[search_crm] Embedding generation failed, falling back to TSVECTOR-only:', embErr.message);
      }

      const { data: unifiedResults, error: unifiedError } = await supabase.rpc('unified_search', {
        p_query: normalizedQuery,
        p_query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : null,
        p_organization_id: organizationId,
        p_entity_types: [singularType],
        p_tags: null,
        p_limit: 10,
      });

      if (!unifiedError && unifiedResults?.length > 0) {
        const matchedIds = unifiedResults.map((r: any) => r.entity_id);
        const { data: fullResults } = await supabase
          .from(tableName)
          .select(selectClause)
          .eq('organization_id', organizationId)
          .in('id', matchedIds);

        return {
          results: fullResults || [],
          count: fullResults?.length || 0,
          entity_type,
          sorted_by: requestedSort,
          sort_direction: ascending ? 'asc' : 'desc',
          unified_search: true,
          search_scores: unifiedResults.map((r: any) => ({
            id: r.entity_id,
            final_score: r.final_score,
            semantic_score: r.semantic_score,
            tsvector_score: r.tsvector_score,
          })),
          original_query: query,
          __citationRows: (fullResults || []).slice(0, 8),
        };
      }
    } catch (unifiedErr: any) {
      console.log('[search_crm] unified_search fallback failed:', unifiedErr.message);
      // Graceful degradation — return empty results rather than throwing
    }
  }

  // Filter out stale/useless contacts — records with no name or no useful data
  let results = data || [];
  if (entity_type === 'contacts' && results.length > 0) {
    const useful = results.filter((c: any) => {
      const hasName = c.full_name && c.full_name.trim().length > 1;
      const hasEmail = !!c.email;
      const hasPhone = !!c.phone;
      const hasCompany = !!c.company || !!c.account_id;
      // A contact is useful if it has a real name AND at least one contact method or company
      return hasName && (hasEmail || hasPhone || hasCompany);
    });
    // Only filter if we'd still have results (don't return empty if all are stale)
    if (useful.length > 0) {
      const staleCount = results.length - useful.length;
      if (staleCount > 0) {
        console.log(`[search_crm] Filtered out ${staleCount} incomplete contacts from results`);
      }
      results = useful;
    }
  }

  return {
    results,
    count: results.length,
    total_count: totalCount ?? results.length,
    entity_type,
    sorted_by: requestedSort,
    sort_direction: ascending ? 'asc' : 'desc',
    __citationRows: results.slice(0, 8),
    __forceNoCitations: results.length === 0,
  };
}

// ============================================================================
// executeEnrichContacts
// ============================================================================

export async function executeEnrichContacts(_supabase: any, args: any, organizationId: string) {
  const { contact_ids } = args;
  if (!contact_ids || contact_ids.length === 0) {
    return { message: 'No contact IDs provided for enrichment.' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return { message: 'Enrichment service not configured.' };
  }

  // Fire-and-forget: enrichment runs async
  fetch(`${supabaseUrl}/functions/v1/enrich-contacts-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      contactIds: contact_ids,
      organizationId,
      trigger: 'user_request',
    }),
  }).catch(err => console.error('[unified-chat] enrich_contacts trigger failed:', err));

  return { message: `Looking up info for ${contact_ids.length} contact(s)... I'll update their records when results come back.` };
}

// ============================================================================
// executeSemanticSearch
// ============================================================================

export async function executeSemanticSearch(supabase: any, args: any, organizationId: string) {
  const { query, entity_types, limit = 10, tags } = args;

  if (!query || query.trim().length === 0) {
    return { results: [], count: 0, error: 'Query is required for semantic search' };
  }

  try {
    // Generate embedding for the search query
    const queryEmbedding = await getQueryEmbedding(query);

    const searchTypes = entity_types || ['account', 'contact', 'deal'];

    // Use unified_search RPC — combines ILIKE + TSVECTOR + vector + lead_score boost
    const { data: results, error } = await supabase.rpc('unified_search', {
      p_query: query,
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_organization_id: organizationId,
      p_entity_types: searchTypes,
      p_tags: tags || null,
      p_limit: limit,
    });

    if (error) {
      console.error('[semantic_search] unified_search RPC error:', error);

      // Fall back to legacy hybrid_search if unified_search not yet deployed
      const { data: hybridResults, error: hybridError } = await supabase.rpc('hybrid_search', {
        p_query: query,
        p_query_embedding: JSON.stringify(queryEmbedding),
        p_organization_id: organizationId,
        p_entity_types: searchTypes,
        p_limit: limit,
      });

      if (hybridError) {
        console.error('[semantic_search] hybrid_search fallback error:', hybridError);

        // Last resort: pure vector search
        const { data: fallbackResults, error: fallbackError } = await supabase.rpc('semantic_search', {
          query_embedding: JSON.stringify(queryEmbedding),
          p_organization_id: organizationId,
          p_entity_types: searchTypes,
          p_similarity_threshold: 0.5,
          p_limit: limit,
        });

        if (fallbackError) {
          console.error('[semantic_search] All search RPCs failed:', fallbackError);
          return { results: [], count: 0, error: 'Semantic search unavailable' };
        }

        return {
          results: fallbackResults || [],
          count: fallbackResults?.length || 0,
          search_type: 'semantic_only',
        };
      }

      return {
        results: hybridResults || [],
        count: hybridResults?.length || 0,
        search_type: 'hybrid_legacy',
      };
    }

    return {
      results: results || [],
      count: results?.length || 0,
      search_type: 'unified',
    };
  } catch (err: any) {
    console.error('[semantic_search] Error:', err.message);
    return { results: [], count: 0, error: err.message };
  }
}
