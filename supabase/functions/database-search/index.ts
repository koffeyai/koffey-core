import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { 
  validateInput, sanitizeInput, checkRateLimit, validateOrganizationAccess,
  createSecureErrorResponse 
} from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

// Legacy value filter interface (for backward compatibility)
interface ValueFilter {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value: number;
  minValue?: number;
  maxValue?: number;
}

// NEW: Structured filters from query planner
interface StructuredFilters {
  amount?: { operator: string; value: number; maxValue?: number };
  stage?: { operator: string; value: string | string[] };
  date?: { field: string; operator: string; value: string; endValue?: string };
  probability?: { operator: string; value: number };
  industry?: { operator: string; value: string | string[] };
}

interface SearchRequest {
  query: string;
  entityType: 'accounts' | 'contacts' | 'deals' | 'all';
  organizationId: string;
  userId: string;
  includeCount?: boolean;
  listAll?: boolean;
  countOnly?: boolean;
  // NEW: Structured filters from query planner
  structuredFilters?: StructuredFilters;
  sortBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  // Legacy filters
  valueFilters?: ValueFilter[];
  // NEW: Telemetry fields for query accuracy logging
  sessionId?: string;
  intent?: string;
  refinementAttempt?: number;
}

interface SearchResult {
  entityType: string;
  found: boolean;
  count: number;
  totalCount?: number;
  isLimited?: boolean;
  exactMatches: any[];
  similarMatches: any[];
  suggestions: string[];
}

/**
 * Calculate the best match score from search results
 * 1.0 = exact match found
 * 0.3-0.99 = fuzzy match quality
 * 0 = no matches
 */
function calculateMatchScore(results: SearchResult[]): number {
  // If any exact matches, score is 1.0
  const hasExactMatch = results.some(r => 
    (r.exactMatches?.length || 0) > 0
  );
  if (hasExactMatch) return 1.0;
  
  // Otherwise, find the highest similarity score from fuzzy matches
  let maxSimilarity = 0;
  for (const result of results) {
    for (const match of result.similarMatches || []) {
      if (match.similarity && match.similarity > maxSimilarity) {
        maxSimilarity = match.similarity;
      }
    }
  }
  return maxSimilarity;
}

/**
 * Database Search - Secure CRM data search with RLS enforcement
 * 
 * SECURITY: Uses X-User-Token header for RLS enforcement when available.
 * Falls back to service role + manual org filter for internal calls without user context.
 */
const handler = async (req: Request): Promise<Response> => {
  // Capture start time for telemetry
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    const requestBody = await req.json();
    
    const validation = validateInput(requestBody, {
      type: 'object',
      required: ['query', 'entityType', 'organizationId', 'userId']
    });

    if (!validation.isValid) {
      return createSecureErrorResponse(
        new Error('Invalid input'),
        `Invalid request: ${validation.errors.join(', ')}`,
        400
      );
    }

    const { 
      query, 
      entityType, 
      organizationId, 
      userId, 
      includeCount = true, 
      listAll, 
      countOnly, 
      structuredFilters,
      sortBy,
      limit,
      valueFilters = [],
      // Telemetry fields
      sessionId,
      intent,
      refinementAttempt = 1
    }: SearchRequest = validation.sanitizedData;

    // ====== SECURITY: Create RLS-enforced client when possible ======
    const userToken = req.headers.get('X-User-Token');
    let supabase;
    let usingRLS = false;

    if (userToken) {
      // Use user's JWT - RLS will be enforced by Postgres
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
          global: { headers: { Authorization: `Bearer ${userToken}` } }
        }
      );
      usingRLS = true;
      console.log('🔒 Using RLS-enforced client');
    } else {
      // Fallback: Service role + manual organization filter
      // This is used for internal calls (e.g., from cron jobs) without user context
      console.warn('⚠️ No user token - using service role with manual org filter');
      supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      // Validate organization access manually when not using RLS
      const hasAccess = await validateOrganizationAccess(supabase, userId, organizationId);
      if (!hasAccess) {
        return createSecureErrorResponse(
          new Error('Access denied'),
          'Access to organization denied',
          403
        );
      }
    }

    // Create service role client for telemetry logging (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Perform grounded database search
    const searchResults = await performGroundedSearch(
      supabase, 
      query, 
      entityType, 
      organizationId, 
      listAll, 
      countOnly, 
      structuredFilters,
      sortBy,
      limit,
      valueFilters,
      usingRLS
    );

    // ====== TELEMETRY: Log query accuracy metrics ======
    const endTime = Date.now();
    const timeToResultMs = endTime - startTime;

    const totalResults = searchResults.reduce((sum, r) => 
      sum + (r.exactMatches?.length || 0) + (r.similarMatches?.length || 0), 0);
    const exactCount = searchResults.reduce((sum, r) => 
      sum + (r.exactMatches?.length || 0), 0);
    const similarCount = searchResults.reduce((sum, r) => 
      sum + (r.similarMatches?.length || 0), 0);
    const matchScore = calculateMatchScore(searchResults);

    // Insert log entry and get ID for click tracking (fire-and-forget, non-blocking)
    let logId: string | null = null;
    try {
      const { data: logEntry } = await supabaseAdmin
        .from('query_accuracy_logs')
        .insert({
          session_id: sessionId || null,
          organization_id: organizationId,
          user_id: userId,
          intent: intent || 'unknown',
          search_query: query,
          expected_entity_type: entityType,
          result_count: totalResults,
          exact_match_count: exactCount,
          similar_match_count: similarCount,
          match_score: matchScore,
          time_to_result_ms: timeToResultMs,
          refinement_attempt: refinementAttempt
        })
        .select('id')
        .single();
      
      logId = logEntry?.id || null;
      console.log('📊 Query logged:', { 
        query: query.substring(0, 50), 
        resultCount: totalResults, 
        timeMs: timeToResultMs, 
        matchScore,
        logId 
      });
    } catch (err) {
      console.error('Failed to log query accuracy:', err);
    }

    // Include logId in response for click tracking
    return new Response(
      JSON.stringify({
        ...searchResults.reduce((acc, r) => {
          acc[r.entityType] = r;
          return acc;
        }, {} as Record<string, SearchResult>),
        results: searchResults,
        _meta: { logId, timeMs: timeToResultMs }
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('Database search error:', error);
    return createSecureErrorResponse(error, 'Search failed', 500);
  }
};

async function performGroundedSearch(
  supabase: any,
  query: string,
  entityType: string,
  organizationId: string,
  listAll?: boolean,
  countOnly?: boolean,
  structuredFilters?: StructuredFilters,
  sortBy?: { field: string; direction: 'asc' | 'desc' },
  limit?: number,
  valueFilters: ValueFilter[] = [],
  usingRLS: boolean = false
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const cleanQuery = query.toLowerCase().trim();
  
  // Note: When usingRLS is true, Postgres RLS policies automatically filter by organization
  // When usingRLS is false, we must manually add .eq('organization_id', organizationId)
  
  if (entityType === 'accounts' || entityType === 'all') {
    const accountResult = await searchAccounts(supabase, cleanQuery, organizationId, listAll, countOnly, structuredFilters, sortBy, limit, usingRLS);
    results.push(accountResult);
  }

  if (entityType === 'contacts' || entityType === 'all') {
    const contactResult = await searchContacts(supabase, cleanQuery, organizationId, listAll, countOnly, structuredFilters, sortBy, limit, usingRLS);
    results.push(contactResult);
  }

  if (entityType === 'deals' || entityType === 'all') {
    const dealResult = await searchDeals(supabase, cleanQuery, organizationId, listAll, countOnly, structuredFilters, sortBy, limit, valueFilters, usingRLS);
    results.push(dealResult);
  }

  return results;
}

async function searchAccounts(
  supabase: any, 
  query: string, 
  organizationId: string, 
  listAll?: boolean, 
  countOnly?: boolean,
  structuredFilters?: StructuredFilters,
  sortBy?: { field: string; direction: 'asc' | 'desc' },
  limit?: number,
  usingRLS: boolean = false
): Promise<SearchResult> {
  try {
    // Build count query
    let countQuery = supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true });
    
    // Always filter by org (RLS may also enforce this, but explicit filter is safer)
    countQuery = countQuery.eq('organization_id', organizationId);

    // Apply industry filter if present
    if (structuredFilters?.industry) {
      const { operator, value } = structuredFilters.industry;
      if (operator === 'eq') {
        countQuery = countQuery.ilike('industry', value as string);
      } else if (operator === 'in' && Array.isArray(value)) {
        countQuery = countQuery.in('industry', value);
      } else if (operator === 'contains') {
        countQuery = countQuery.ilike('industry', `%${value}%`);
      }
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    if (countOnly) {
      console.log(`📊 COUNT ONLY mode: ${count} accounts found`);
      return {
        entityType: 'accounts',
        found: (count || 0) > 0,
        count: count || 0,
        totalCount: count || 0,
        exactMatches: [],
        similarMatches: [],
        suggestions: []
      };
    }

    let exactMatches = [];
    let similarMatches = [];
    const resultLimit = limit || 50;

    if (listAll) {
      console.log(`📋 LIST ALL mode: Fetching accounts (max ${resultLimit} of ${count} total)`);
      let listQuery = supabase
        .from('accounts')
        .select('name, id, industry, website')
        .eq('organization_id', organizationId);
      
      // Apply sorting
      if (sortBy) {
        listQuery = listQuery.order(sortBy.field, { ascending: sortBy.direction === 'asc' });
      } else {
        listQuery = listQuery.order('created_at', { ascending: false });
      }
      
      listQuery = listQuery.limit(resultLimit);
      
      const { data: allAccounts, error: allError } = await listQuery;
      if (allError) throw allError;
      exactMatches = allAccounts || [];
      
      const isLimited = (count || 0) > resultLimit;
      const suggestions = exactMatches.length > 0 
        ? isLimited 
          ? [`Showing ${resultLimit} of ${count} accounts.`]
          : [`Here are all ${exactMatches.length} accounts:`]
        : ["No accounts found", "Would you like to create one?"];
      
      return {
        entityType: 'accounts',
        found: exactMatches.length > 0,
        count: exactMatches.length,
        totalCount: count || 0,
        isLimited,
        exactMatches,
        similarMatches: [],
        suggestions
      };
    }

    if (query && query.trim()) {
      console.log('🔍 Searching accounts:', query);
      
      const { data: exact, error: exactError } = await supabase
        .from('accounts')
        .select('id, name, industry, website, created_at')
        .eq('organization_id', organizationId)
        .ilike('name', query)
        .limit(5);
      
      if (exactError) throw exactError;

      const { data: similar, error: similarError } = await supabase
        .from('accounts')
        .select('id, name, industry, website, created_at')
        .eq('organization_id', organizationId)
        .ilike('name', `%${query}%`)
        .not('name', 'ilike', query)
        .limit(10);

      if (similarError) throw similarError;

      exactMatches = exact || [];
      similarMatches = similar || [];
      
      // Fuzzy search fallback
      if (exactMatches.length === 0 && similarMatches.length === 0) {
        console.log('🔮 Trying fuzzy search...');
        const { data: fuzzyMatches, error: fuzzyError } = await supabase
          .rpc('fuzzy_search_accounts', { 
            search_query: query, 
            org_id: organizationId,
            min_similarity: 0.3
          });
        
        if (!fuzzyError && fuzzyMatches?.length > 0) {
          console.log('🔮 Fuzzy matches found:', fuzzyMatches.length);
          similarMatches = fuzzyMatches;
        }
      }
    }

    const suggestions = [];
    if (!exactMatches?.length && !similarMatches?.length) {
      suggestions.push(`No accounts found matching "${query}"`);
      suggestions.push(`Would you like to create a new account?`);
    }

    return {
      entityType: 'accounts',
      found: (exactMatches?.length || 0) > 0,
      count: count || 0,
      exactMatches: exactMatches || [],
      similarMatches: similarMatches || [],
      suggestions
    };
  } catch (error) {
    console.error('Account search error:', error);
    return {
      entityType: 'accounts',
      found: false,
      count: 0,
      exactMatches: [],
      similarMatches: [],
      suggestions: ['Error searching accounts']
    };
  }
}

async function searchContacts(
  supabase: any, 
  query: string, 
  organizationId: string, 
  listAll?: boolean, 
  countOnly?: boolean,
  structuredFilters?: StructuredFilters,
  sortBy?: { field: string; direction: 'asc' | 'desc' },
  limit?: number,
  usingRLS: boolean = false
): Promise<SearchResult> {
  try {
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (countOnly) {
      console.log(`📊 COUNT ONLY mode: ${count} contacts found`);
      return {
        entityType: 'contacts',
        found: (count || 0) > 0,
        count: count || 0,
        totalCount: count || 0,
        exactMatches: [],
        similarMatches: [],
        suggestions: []
      };
    }

    let exactMatches = [];
    let similarMatches = [];
    const resultLimit = limit || 50;

    if (listAll) {
      console.log(`📋 LIST ALL mode: Fetching contacts (max ${resultLimit} of ${count} total)`);
      let listQuery = supabase
        .from('contacts')
        .select('full_name, first_name, last_name, email, id, company, position')
        .eq('organization_id', organizationId);
      
      if (sortBy) {
        listQuery = listQuery.order(sortBy.field, { ascending: sortBy.direction === 'asc' });
      } else {
        listQuery = listQuery.order('created_at', { ascending: false });
      }
      
      listQuery = listQuery.limit(resultLimit);
      
      const { data: allContacts, error: allError } = await listQuery;
      if (allError) throw allError;
      exactMatches = allContacts || [];
      
      const isLimited = (count || 0) > resultLimit;
      const suggestions = exactMatches.length > 0 
        ? isLimited 
          ? [`Showing ${resultLimit} of ${count} contacts.`]
          : [`Here are all ${exactMatches.length} contacts:`]
        : ["No contacts found"];
      
      return {
        entityType: 'contacts',
        found: exactMatches.length > 0,
        count: exactMatches.length,
        totalCount: count || 0,
        isLimited,
        exactMatches,
        similarMatches: [],
        suggestions
      };
    }

    if (query && query.trim()) {
      const { data: exact, error: exactError } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, company, title')
        .eq('organization_id', organizationId)
        .or(`full_name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(5);

      if (exactError) throw exactError;

      const { data: similar, error: similarError } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, company, title')
        .eq('organization_id', organizationId)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`)
        .limit(10);

      if (similarError) throw similarError;

      exactMatches = exact || [];
      similarMatches = similar || [];
      
      // Fuzzy search fallback
      if (exactMatches.length === 0 && similarMatches.length === 0) {
        const { data: fuzzyMatches, error: fuzzyError } = await supabase
          .rpc('fuzzy_search_contacts', { 
            search_query: query, 
            org_id: organizationId,
            min_similarity: 0.3
          });
        
        if (!fuzzyError && fuzzyMatches?.length > 0) {
          similarMatches = fuzzyMatches;
        }
      }
    }

    const suggestions = [];
    if (!exactMatches?.length && !similarMatches?.length) {
      suggestions.push(`No contacts found matching "${query}"`);
    }

    return {
      entityType: 'contacts',
      found: (exactMatches?.length || 0) > 0,
      count: count || 0,
      exactMatches: exactMatches || [],
      similarMatches: similarMatches || [],
      suggestions
    };
  } catch (error) {
    console.error('Contact search error:', error);
    return {
      entityType: 'contacts',
      found: false,
      count: 0,
      exactMatches: [],
      similarMatches: [],
      suggestions: ['Error searching contacts']
    };
  }
}

async function searchDeals(
  supabase: any, 
  query: string, 
  organizationId: string, 
  listAll?: boolean, 
  countOnly?: boolean,
  structuredFilters?: StructuredFilters,
  sortBy?: { field: string; direction: 'asc' | 'desc' },
  limit?: number,
  valueFilters: ValueFilter[] = [],
  usingRLS: boolean = false
): Promise<SearchResult> {
  try {
    // Merge structured filters with legacy value filters
    const hasStructuredFilters = structuredFilters && Object.keys(structuredFilters).length > 0;
    const hasValueFilters = valueFilters.length > 0;
    const hasAnyFilters = hasStructuredFilters || hasValueFilters;
    
    // Build base count query
    let countQuery = supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    
    // Apply structured filters to count query
    if (structuredFilters) {
      countQuery = applyStructuredFilters(countQuery, structuredFilters);
    }
    
    // Apply legacy value filters
    if (hasValueFilters) {
      for (const filter of valueFilters) {
        if (filter.field === 'amount') {
          countQuery = applyAmountFilter(countQuery, filter);
        }
      }
    }
    
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    if (countOnly && !hasAnyFilters) {
      console.log(`📊 COUNT ONLY mode: ${count} deals found`);
      return {
        entityType: 'deals',
        found: (count || 0) > 0,
        count: count || 0,
        totalCount: count || 0,
        exactMatches: [],
        similarMatches: [],
        suggestions: []
      };
    }

    let exactMatches = [];
    let similarMatches = [];
    const resultLimit = limit || 50;

    // If we have filters or listAll mode, get the actual data
    if (hasAnyFilters || listAll) {
      console.log(`📋 Fetching deals with filters (max ${resultLimit})`);
      
      let dataQuery = supabase
        .from('deals')
        .select('id, name, amount, stage, probability, close_date, expected_close_date, account_id, created_at')
        .eq('organization_id', organizationId);
      
      // Apply structured filters
      if (structuredFilters) {
        dataQuery = applyStructuredFilters(dataQuery, structuredFilters);
      }
      
      // Apply legacy value filters
      if (hasValueFilters) {
        for (const filter of valueFilters) {
          if (filter.field === 'amount') {
            dataQuery = applyAmountFilter(dataQuery, filter);
          }
        }
      }
      
      // Apply sorting
      if (sortBy) {
        dataQuery = dataQuery.order(sortBy.field, { ascending: sortBy.direction === 'asc' });
      } else {
        dataQuery = dataQuery.order('amount', { ascending: false });
      }
      
      dataQuery = dataQuery.limit(resultLimit);
      
      const { data: deals, error: dealsError } = await dataQuery;
      if (dealsError) throw dealsError;
      
      exactMatches = deals || [];
      
      const isLimited = (count || 0) > resultLimit;
      const filterDescription = describeFilters(structuredFilters, valueFilters);
      
      return {
        entityType: 'deals',
        found: exactMatches.length > 0,
        count: exactMatches.length,
        totalCount: count || 0,
        isLimited,
        exactMatches,
        similarMatches: [],
        suggestions: exactMatches.length > 0 
          ? isLimited 
            ? [`Showing ${resultLimit} of ${count} deals${filterDescription}.`]
            : [`Found ${exactMatches.length} deals${filterDescription}.`]
          : [`No deals found${filterDescription}.`]
      };
    }

    // Text search mode
    if (query && query.trim()) {
      console.log('🔍 Searching deals:', query);
      
      const { data: exact, error: exactError } = await supabase
        .from('deals')
        .select('id, name, amount, stage, probability, close_date, expected_close_date')
        .eq('organization_id', organizationId)
        .ilike('name', `%${query}%`)
        .limit(10);

      if (exactError) throw exactError;
      exactMatches = exact || [];
    }

    const suggestions = [];
    if (!exactMatches?.length) {
      suggestions.push(`No deals found matching "${query}"`);
    }

    return {
      entityType: 'deals',
      found: (exactMatches?.length || 0) > 0,
      count: count || 0,
      exactMatches: exactMatches || [],
      similarMatches: similarMatches || [],
      suggestions
    };
  } catch (error) {
    console.error('Deal search error:', error);
    return {
      entityType: 'deals',
      found: false,
      count: 0,
      exactMatches: [],
      similarMatches: [],
      suggestions: ['Error searching deals']
    };
  }
}

// ====== FILTER HELPERS ======

function applyStructuredFilters(query: any, filters: StructuredFilters): any {
  let q = query;
  
  // Amount filter
  if (filters.amount) {
    const { operator, value, maxValue } = filters.amount;
    switch (operator) {
      case 'gt': q = q.gt('amount', value); break;
      case 'gte': q = q.gte('amount', value); break;
      case 'lt': q = q.lt('amount', value); break;
      case 'lte': q = q.lte('amount', value); break;
      case 'between': 
        q = q.gte('amount', value);
        if (maxValue) q = q.lte('amount', maxValue);
        break;
    }
  }
  
  // Stage filter
  if (filters.stage) {
    const { operator, value } = filters.stage;
    if (operator === 'eq') {
      q = q.ilike('stage', value as string);
    } else if (operator === 'in' && Array.isArray(value)) {
      q = q.in('stage', value);
    } else if (operator === 'not_in' && Array.isArray(value)) {
      // Use not.in for excluding stages
      for (const v of value) {
        q = q.not('stage', 'ilike', v);
      }
    }
  }
  
  // Date filter
  if (filters.date) {
    const { field, operator, value, endValue } = filters.date;
    switch (operator) {
      case 'after': q = q.gte(field, value); break;
      case 'before': q = q.lte(field, value); break;
      case 'between':
        q = q.gte(field, value);
        if (endValue) q = q.lte(field, endValue);
        break;
    }
  }
  
  // Probability filter
  if (filters.probability) {
    const { operator, value } = filters.probability;
    switch (operator) {
      case 'gt': q = q.gt('probability', value); break;
      case 'gte': q = q.gte('probability', value); break;
      case 'lt': q = q.lt('probability', value); break;
      case 'lte': q = q.lte('probability', value); break;
    }
  }
  
  return q;
}

function applyAmountFilter(query: any, filter: ValueFilter): any {
  let q = query;
  switch (filter.operator) {
    case 'gt': q = q.gt('amount', filter.value); break;
    case 'gte': q = q.gte('amount', filter.value); break;
    case 'lt': q = q.lt('amount', filter.value); break;
    case 'lte': q = q.lte('amount', filter.value); break;
    case 'between':
      q = q.gte('amount', filter.minValue || filter.value);
      if (filter.maxValue) q = q.lte('amount', filter.maxValue);
      break;
  }
  return q;
}

function describeFilters(structuredFilters?: StructuredFilters, valueFilters?: ValueFilter[]): string {
  const parts: string[] = [];
  
  if (structuredFilters?.amount) {
    const { operator, value, maxValue } = structuredFilters.amount;
    if (operator === 'gt') parts.push(`over $${value.toLocaleString()}`);
    if (operator === 'lt') parts.push(`under $${value.toLocaleString()}`);
    if (operator === 'between') parts.push(`between $${value.toLocaleString()} and $${maxValue?.toLocaleString()}`);
  }
  
  if (structuredFilters?.stage) {
    const { value } = structuredFilters.stage;
    parts.push(`in ${Array.isArray(value) ? value.join('/') : value} stage`);
  }
  
  if (structuredFilters?.date) {
    const { value, endValue } = structuredFilters.date;
    if (endValue) {
      parts.push(`from ${value} to ${endValue}`);
    }
  }
  
  return parts.length > 0 ? ` ${parts.join(', ')}` : '';
}

serve(handler);
