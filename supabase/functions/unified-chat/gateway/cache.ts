import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import {
  normalizeForCache as normalizeForCacheInternal,
  shouldAttemptResponseCache as shouldAttemptResponseCacheInternal,
  buildResponseCacheKeySource,
  getRecencyBucket as getRecencyBucketInternal,
  isReadOnlyToolSet as isReadOnlyToolSetInternal,
} from '../response-cache-utils.mjs';
import { serializeToolResultForPrompt as serializeToolResultForPromptInternal } from '../tool-result-serializer.mjs';
import { isDataOrActionRequest } from '../request-intelligence.mjs';
import type { SkillDomain } from '../skills/types.ts';
import { buildToolOnlyResponseForMessage as buildToolOnlyResponseInternal } from './tool-only-response.mjs';

const STABLE_TOOL_SET = new Set([
  'search_crm',
  'semantic_search',
  'create_deal',
  'create_contact',
  'create_account',
  'create_task',
  'create_activity',
  'get_tasks',
  'update_deal',
  'delete_deal',
  'update_contact',
  'update_account',
  'complete_task',
  'update_stakeholder_role',
  'enrich_contacts',
  'analyze_deal',
  'get_pipeline_stats',
  'get_sales_cycle_analytics',
  'get_activity_stats',
  'get_pipeline_velocity',
  'draft_email',
  'get_deal_context',
  'get_account_context',
  'get_contact_context',
  'get_entity_messages',
  'get_pipeline_context',
  'get_context_resource',
  'check_availability',
  'send_scheduling_email',
  'schedule_meeting',
  'create_calendar_event',
]);

const READ_ONLY_RESPONSE_TOOLS = new Set([
  'search_crm',
  'get_pipeline_stats',
  'get_sales_cycle_analytics',
  'get_pipeline_velocity',
  'get_deal_context',
  'get_account_context',
  'get_contact_context',
  'get_entity_messages',
  'get_pipeline_context',
  'get_context_resource',
]);

const MUTATION_TOOLS = new Set([
  'create_deal',
  'create_contact',
  'create_account',
  'create_task',
  'create_activity',
  'update_deal',
  'delete_deal',
  'update_contact',
  'update_account',
  'complete_task',
  'update_stakeholder_role',
  'enrich_contacts',
  'send_scheduling_email',
  'schedule_meeting',
  'create_calendar_event',
]);

const SYNTHESIS_POLICY = (Deno.env.get('AI_SYNTHESIS_POLICY') || 'adaptive').toLowerCase();
const TOOL_PLAN_CACHE_ENABLED = (Deno.env.get('AI_TOOL_PLAN_CACHE_ENABLED') || 'true').toLowerCase() === 'true';
const TOOL_PLAN_CACHE_TTL_MINUTES = Math.max(5, Number(Deno.env.get('AI_TOOL_PLAN_CACHE_TTL_MINUTES') || '30'));
const MAX_TOOL_RESULTS_FOR_SYNTHESIS = Math.max(3, Number(Deno.env.get('AI_MAX_TOOL_RESULTS_FOR_SYNTHESIS') || '300'));
const MAX_TOOL_RESULT_CHARS = Math.max(1000, Number(Deno.env.get('AI_MAX_TOOL_RESULT_CHARS') || '60000'));
const RESPONSE_CACHE_ENABLED = (Deno.env.get('AI_RESPONSE_CACHE_ENABLED') || 'true').toLowerCase() === 'true';
const RESPONSE_CACHE_TTL_SECONDS = Math.max(60, Number(Deno.env.get('AI_RESPONSE_CACHE_TTL_SECONDS') || '300'));
const RESPONSE_CACHE_BUCKET_SECONDS = Math.max(60, Number(Deno.env.get('AI_RESPONSE_CACHE_BUCKET_SECONDS') || '300'));

export {
  STABLE_TOOL_SET,
  MUTATION_TOOLS,
  READ_ONLY_RESPONSE_TOOLS,
  SYNTHESIS_POLICY,
  TOOL_PLAN_CACHE_ENABLED,
  RESPONSE_CACHE_ENABLED,
  RESPONSE_CACHE_TTL_SECONDS,
  RESPONSE_CACHE_BUCKET_SECONDS,
};

export function safeJsonParse(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function shouldRunSynthesis(_message: string, _tier: 'lite' | 'standard' | 'pro', toolCount: number): boolean {
  if (SYNTHESIS_POLICY === 'never') return false;
  if (SYNTHESIS_POLICY === 'always') return true;
  return toolCount > 0;
}

export function buildToolOnlyResponse(operations: Array<{ tool: string; result: any }>, message = ''): string {
  return buildToolOnlyResponseInternal(operations, message);
}

export function normalizeForCache(input: string, maxLen?: number): string {
  return normalizeForCacheInternal(input, maxLen);
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function stableSortObject(input: any): any {
  if (Array.isArray(input)) return input.map((v) => stableSortObject(v));
  if (!input || typeof input !== 'object') return input;
  const out: Record<string, any> = {};
  for (const key of Object.keys(input).sort()) {
    const val = (input as Record<string, any>)[key];
    if (val === undefined || val === null) continue;
    out[key] = stableSortObject(val);
  }
  return out;
}

export function serializeToolResultForPrompt(result: any): string {
  return serializeToolResultForPromptInternal(result, {
    maxChars: MAX_TOOL_RESULT_CHARS,
    maxResults: MAX_TOOL_RESULTS_FOR_SYNTHESIS,
  });
}

export function extractCacheableToolCalls(toolCalls: any[]): Array<{ name: string; args: Record<string, any> }> {
  const parsed: Array<{ name: string; args: Record<string, any> }> = [];
  for (const tc of (toolCalls || []).slice(0, 6)) {
    const name = String(tc?.function?.name || '').trim();
    if (!name || !STABLE_TOOL_SET.has(name)) continue;
    const args = safeJsonParse(tc?.function?.arguments || '{}');
    parsed.push({
      name,
      args: stableSortObject(args && typeof args === 'object' ? args : {}),
    });
  }
  return parsed;
}

export function toToolCallsFromCache(calls: Array<{ name: string; args: Record<string, any> }>): any[] {
  return calls.map((c, idx) => ({
    id: `cache_tool_${idx + 1}`,
    type: 'function',
    function: {
      name: c.name,
      arguments: JSON.stringify(c.args || {}),
    },
  }));
}

export function shouldAttemptToolPlanCache(message: string, followUpLike: boolean, compoundLike: boolean, historyText: string): boolean {
  if (!TOOL_PLAN_CACHE_ENABLED) return false;
  if (followUpLike || compoundLike) return false;
  const normalized = normalizeForCache(message);
  if (!normalized || normalized.length < 4) return false;
  if (normalized.length > 220) return false;
  if (!isDataOrActionRequest(message, historyText)) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)\b/.test(normalized)) return false;
  return true;
}

export async function buildToolPlanCacheKey(
  organizationId: string,
  channel: string,
  tier: 'lite' | 'standard' | 'pro',
  message: string,
  domains: SkillDomain[],
  contextKey = ''
): Promise<string> {
  const cacheDateBucket = new Date().toISOString().slice(0, 10);
  const normalized = normalizeForCache(message);
  const normalizedContext = normalizeForCache(contextKey, 220) || 'noctx';
  return await sha256Hex([
    organizationId,
    channel,
    tier,
    domains.slice().sort().join(','),
    cacheDateBucket,
    normalized,
    normalizedContext,
  ].join('|'));
}

export async function loadCachedToolPlan(
  supabase: ReturnType<typeof createClient>,
  cacheKey: string
): Promise<Array<{ name: string; args: Record<string, any> }> | null> {
  const { data, error } = await supabase
    .from('query_plan_cache')
    .select('id, query_plan, hit_count')
    .eq('query_hash', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data?.query_plan) return null;
  const rawToolCalls = Array.isArray((data.query_plan as any)?.toolCalls)
    ? (data.query_plan as any).toolCalls
    : [];
  const parsed = rawToolCalls
    .map((c: any) => ({
      name: String(c?.name || ''),
      args: stableSortObject(c?.args && typeof c.args === 'object' ? c.args : {}),
    }))
    .filter((c: any) => !!c.name && STABLE_TOOL_SET.has(c.name));

  if (parsed.length === 0) return null;

  supabase
    .from('query_plan_cache')
    .update({
      hit_count: (data.hit_count || 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .then(({ error: updateError }) => {
      if (updateError) console.warn('[unified-chat] tool-plan cache hit update failed:', updateError.message);
    });

  return parsed;
}

export async function storeToolPlanCache(
  supabase: ReturnType<typeof createClient>,
  cacheKey: string,
  toolCalls: Array<{ name: string; args: Record<string, any> }>
): Promise<void> {
  if (!toolCalls.length || !TOOL_PLAN_CACHE_ENABLED) return;
  const expiresAt = new Date(Date.now() + TOOL_PLAN_CACHE_TTL_MINUTES * 60_000).toISOString();
  const { error } = await supabase
    .from('query_plan_cache')
    .upsert({
      query_hash: cacheKey,
      query_plan: { toolCalls },
      hit_count: 1,
      last_accessed_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'query_hash' });
  if (error) {
    console.warn('[unified-chat] tool-plan cache store failed:', error.message);
  }
}

export function getRecencyBucket(seconds: number): number {
  return getRecencyBucketInternal(seconds);
}

export function shouldAttemptResponseCache(message: string, followUpLike: boolean, compoundLike: boolean, dataOrActionRequest: boolean): boolean {
  if (!RESPONSE_CACHE_ENABLED) return false;
  return shouldAttemptResponseCacheInternal({
    message,
    followUpLike,
    compoundLike,
    dataOrActionRequest,
  });
}

export async function buildResponseCacheKey(
  organizationId: string,
  userId: string,
  message: string,
  bucketSeconds: number,
  contextKey = ''
): Promise<string> {
  const bucket = getRecencyBucket(bucketSeconds);
  const keySource = buildResponseCacheKeySource({
    organizationId,
    userId,
    message,
    bucket,
    contextKey,
  });
  return await sha256Hex(keySource);
}

export async function loadCachedResponse(
  supabase: ReturnType<typeof createClient>,
  cacheKey: string,
  organizationId: string,
  userId: string
): Promise<any | null> {
  const { data, error } = await supabase
    .from('chat_response_cache')
    .select('id, response_payload, hit_count')
    .eq('query_hash', cacheKey)
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data?.response_payload) return null;

  supabase
    .from('chat_response_cache')
    .update({
      hit_count: (data.hit_count || 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .then(({ error: updateError }) => {
      if (updateError) console.warn('[unified-chat] response cache hit update failed:', updateError.message);
    });

  return data.response_payload;
}

export async function hasValidRetrievedCitationRows(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  citations: any[]
): Promise<boolean> {
  const retrieved = Array.isArray(citations)
    ? citations.filter((c) => c?.kind === 'retrieved' && c?.table && c?.rowId)
    : [];
  if (retrieved.length === 0) return false;

  const grouped = new Map<string, Set<string>>();
  for (const citation of retrieved.slice(0, 120)) {
    const table = String(citation.table || '').trim();
    const rowId = String(citation.rowId || '').trim();
    if (!table || !rowId) continue;
    if (!grouped.has(table)) grouped.set(table, new Set());
    grouped.get(table)?.add(rowId);
  }

  if (grouped.size === 0) return false;

  for (const [table, idsSet] of grouped.entries()) {
    const ids = Array.from(idsSet).slice(0, 200);
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', ids);

    if (error) {
      console.warn('[unified-chat] cache citation validation query failed:', table, error.message);
      return false;
    }

    const found = new Set((data || []).map((row: any) => String(row.id)));
    for (const id of ids) {
      if (!found.has(id)) return false;
    }
  }

  return true;
}

export function isReadOnlyToolSet(crmOperations: Array<{ tool: string; result: any }>): boolean {
  return isReadOnlyToolSetInternal(crmOperations, Array.from(READ_ONLY_RESPONSE_TOOLS));
}

export async function storeResponseCache(
  supabase: ReturnType<typeof createClient>,
  params: {
    cacheKey: string;
    organizationId: string;
    userId: string;
    message: string;
    payload: any;
    toolNames: string[];
    traceId?: string | null;
  }
): Promise<void> {
  if (!RESPONSE_CACHE_ENABLED) return;
  const expiresAt = new Date(Date.now() + RESPONSE_CACHE_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabase
    .from('chat_response_cache')
    .upsert({
      organization_id: params.organizationId,
      user_id: params.userId,
      query_hash: params.cacheKey,
      query_text: normalizeForCache(params.message),
      response_payload: params.payload,
      cache_type: 'read_only_response',
      tool_names: params.toolNames,
      trace_id: params.traceId || null,
      hit_count: 1,
      last_accessed_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'query_hash' });

  if (error) {
    console.warn('[unified-chat] response cache store failed:', error.message);
  }
}

export async function invalidateResponseCacheForOrganization(
  supabase: ReturnType<typeof createClient>,
  organizationId: string
): Promise<void> {
  if (!RESPONSE_CACHE_ENABLED) return;
  const { error } = await supabase
    .from('chat_response_cache')
    .delete()
    .eq('organization_id', organizationId);
  if (error) {
    console.warn('[unified-chat] response cache invalidation failed:', error.message);
  }
}
