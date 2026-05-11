/**
 * Context Resource Gateway
 *
 * Normalizes CRM resource requests into typed context skills. This is the
 * first practical slice of a Mirage-like resource layer: agents can ask for
 * a resource URI, while Koffey still executes explicit, permission-scoped
 * CRM tools behind the scenes.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';
import getDealContext from './get-deal-context.ts';
import getAccountContext from './get-account-context.ts';
import getContactContext from './get-contact-context.ts';
import getEntityMessages from './get-entity-messages.ts';
import getPipelineContext from './get-pipeline-context.ts';

export type ContextResourceType =
  | 'deal_context'
  | 'account_context'
  | 'contact_context'
  | 'pipeline_context'
  | 'entity_messages';

export interface ContextResourceRequest {
  resource_uri?: string;
  resource_type?: ContextResourceType;
  entity_type?: 'deal' | 'account' | 'contact';
  entity_id?: string;
  entity_name?: string;
  period_start?: string;
  period_end?: string;
  scope?: 'mine' | 'org';
  limit?: number;
}

export interface NormalizedContextResource {
  uri: string;
  resource_type: ContextResourceType;
  tool: string;
  args: Record<string, unknown>;
}

type ContextResourceCacheMeta = {
  hit: boolean;
  stored?: boolean;
  ttlSeconds?: number;
  expiresAt?: string;
};

const CONTEXT_RESOURCE_SKILLS: Record<ContextResourceType, SkillDefinition> = {
  deal_context: getDealContext,
  account_context: getAccountContext,
  contact_context: getContactContext,
  pipeline_context: getPipelineContext,
  entity_messages: getEntityMessages,
};

function readEnv(key: string): string | undefined {
  try {
    return (globalThis as any).Deno?.env?.get?.(key);
  } catch {
    return undefined;
  }
}

function contextResourceCacheEnabled(): boolean {
  return String(readEnv('CONTEXT_RESOURCE_CACHE_ENABLED') || 'true').toLowerCase() !== 'false';
}

function contextResourceCacheTtlSeconds(resourceType: ContextResourceType): number {
  const specificKey = `CONTEXT_RESOURCE_CACHE_${resourceType.toUpperCase()}_TTL_SECONDS`;
  const raw = readEnv(specificKey) || readEnv('CONTEXT_RESOURCE_CACHE_TTL_SECONDS') || '180';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 180;
  return Math.min(Math.max(parsed, 30), 900);
}

function stableSortObject(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((value) => stableSortObject(value));
  if (!input || typeof input !== 'object') return input;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    out[key] = stableSortObject(value);
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildContextResourceCacheKey(
  ctx: Pick<ToolExecutionContext, 'organizationId' | 'userId'>,
  normalized: NormalizedContextResource,
): Promise<string> {
  return await sha256Hex([
    ctx.organizationId,
    ctx.userId,
    normalized.resource_type,
    normalized.uri,
    JSON.stringify(stableSortObject(normalized.args)),
  ].join('|'));
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, '%252F');
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value || '').trim();
}

function entityCollectionToType(collection: string): 'deal' | 'account' | 'contact' | null {
  const normalized = collection.toLowerCase();
  if (normalized === 'deals') return 'deal';
  if (normalized === 'accounts') return 'account';
  if (normalized === 'contacts') return 'contact';
  return null;
}

function contextTypeForEntity(entityType: 'deal' | 'account' | 'contact'): ContextResourceType {
  if (entityType === 'deal') return 'deal_context';
  if (entityType === 'account') return 'account_context';
  return 'contact_context';
}

function toolArgsForEntityContext(
  resourceType: ContextResourceType,
  entityId?: string,
  entityName?: string,
): Record<string, unknown> {
  switch (resourceType) {
    case 'deal_context':
      return entityId ? { deal_id: entityId } : { deal_name: entityName };
    case 'account_context':
      return entityId ? { account_id: entityId } : { account_name: entityName };
    case 'contact_context':
      return entityId ? { contact_id: entityId } : { contact_name: entityName };
    default:
      return {};
  }
}

function canonicalEntityContextUri(
  resourceType: ContextResourceType,
  entityId?: string,
  entityName?: string,
): string {
  const collection =
    resourceType === 'deal_context' ? 'deals' :
    resourceType === 'account_context' ? 'accounts' :
    'contacts';

  if (entityId) return `crm://${collection}/${encodeSegment(entityId)}/context`;
  return `crm://${collection}/by-name/${encodeSegment(entityName || '')}/context`;
}

function canonicalMessagesUri(entityType: string, entityId?: string, entityName?: string, limit?: number): string {
  const identifier = entityId
    ? encodeSegment(entityId)
    : `by-name/${encodeSegment(entityName || '')}`;
  const limitQuery = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
  return `crm://${entityType}s/${identifier}/messages${limitQuery}`;
}

function canonicalPipelineUri(request: ContextResourceRequest): string {
  const params = new URLSearchParams();
  if (request.period_start) params.set('period_start', request.period_start);
  if (request.period_end) params.set('period_end', request.period_end);
  if (request.scope) params.set('scope', request.scope);
  const query = params.toString();
  return `analytics://pipeline${query ? `?${query}` : ''}`;
}

function parseResourceUri(resourceUri: string): NormalizedContextResource | null {
  const parsed = new URL(resourceUri);
  const protocol = parsed.protocol.replace(':', '').toLowerCase();

  if (protocol === 'analytics' && parsed.hostname.toLowerCase() === 'pipeline') {
    const scope = parsed.searchParams.get('scope') || undefined;
    const args: Record<string, unknown> = {};
    const periodStart = parsed.searchParams.get('period_start');
    const periodEnd = parsed.searchParams.get('period_end');
    if (periodStart) args.period_start = periodStart;
    if (periodEnd) args.period_end = periodEnd;
    if (scope === 'mine' || scope === 'org') args.scope = scope;
    return {
      uri: canonicalPipelineUri(args as ContextResourceRequest),
      resource_type: 'pipeline_context',
      tool: getPipelineContext.name,
      args,
    };
  }

  if (protocol !== 'crm') return null;

  const entityType = entityCollectionToType(parsed.hostname);
  if (!entityType) return null;
  const path = parsed.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (path.length < 2) return null;

  const byName = path[0] === 'by-name';
  const identifier = byName ? path[1] : path[0];
  const action = byName ? path[2] : path[1];
  if (!identifier || !action) return null;

  if (action === 'context') {
    const resourceType = contextTypeForEntity(entityType);
    const args = toolArgsForEntityContext(resourceType, byName ? undefined : identifier, byName ? identifier : undefined);
    return {
      uri: canonicalEntityContextUri(resourceType, byName ? undefined : identifier, byName ? identifier : undefined),
      resource_type: resourceType,
      tool: CONTEXT_RESOURCE_SKILLS[resourceType].name,
      args,
    };
  }

  if (action === 'messages') {
    const limit = Number(parsed.searchParams.get('limit') || '');
    const args: Record<string, unknown> = {
      entity_type: entityType,
      ...(byName ? { entity_name: identifier } : { entity_id: identifier }),
    };
    if (Number.isFinite(limit) && limit > 0) args.limit = Math.min(limit, 25);
    return {
      uri: canonicalMessagesUri(entityType, byName ? undefined : identifier, byName ? identifier : undefined, args.limit as number | undefined),
      resource_type: 'entity_messages',
      tool: getEntityMessages.name,
      args,
    };
  }

  return null;
}

export function normalizeContextResourceRequest(request: ContextResourceRequest): NormalizedContextResource | null {
  const resourceUri = String(request.resource_uri || '').trim();
  if (resourceUri) {
    try {
      const parsed = parseResourceUri(resourceUri);
      if (parsed) return parsed;
    } catch {
      return null;
    }
  }

  const resourceType = request.resource_type;
  if (!resourceType || !CONTEXT_RESOURCE_SKILLS[resourceType]) return null;

  if (resourceType === 'pipeline_context') {
    const args: Record<string, unknown> = {};
    if (request.period_start) args.period_start = request.period_start;
    if (request.period_end) args.period_end = request.period_end;
    if (request.scope) args.scope = request.scope;
    return {
      uri: canonicalPipelineUri(request),
      resource_type: resourceType,
      tool: getPipelineContext.name,
      args,
    };
  }

  if (resourceType === 'entity_messages') {
    const entityType = request.entity_type;
    if (!entityType || (!request.entity_id && !request.entity_name)) return null;
    const args: Record<string, unknown> = {
      entity_type: entityType,
      ...(request.entity_id ? { entity_id: request.entity_id } : { entity_name: request.entity_name }),
    };
    if (request.limit) args.limit = Math.min(Math.max(request.limit, 1), 25);
    return {
      uri: canonicalMessagesUri(entityType, request.entity_id, request.entity_name, args.limit as number | undefined),
      resource_type: resourceType,
      tool: getEntityMessages.name,
      args,
    };
  }

  if (!request.entity_id && !request.entity_name) return null;
  return {
    uri: canonicalEntityContextUri(resourceType, request.entity_id, request.entity_name),
    resource_type: resourceType,
    tool: CONTEXT_RESOURCE_SKILLS[resourceType].name,
    args: toolArgsForEntityContext(resourceType, request.entity_id, request.entity_name),
  };
}

function withResourceMeta(
  resultObject: Record<string, unknown>,
  normalized: NormalizedContextResource,
  cache: ContextResourceCacheMeta,
): Record<string, unknown> {
  return {
    ...resultObject,
    __trusted_context: resultObject.__trusted_context === true,
    __contextResource: {
      uri: normalized.uri,
      resource_type: normalized.resource_type,
      tool: normalized.tool,
      cacheable: true,
      cache,
    },
  };
}

function shouldCacheContextResource(resultObject: Record<string, unknown>): boolean {
  if (resultObject.error === true) return false;
  if (resultObject.success === false) return false;
  if (resultObject._needsInput === true) return false;
  if (resultObject._needsConfirmation === true) return false;
  return resultObject.__trusted_context === true;
}

async function loadCachedContextResource(
  ctx: Omit<ToolExecutionContext, 'args'>,
  normalized: NormalizedContextResource,
): Promise<Record<string, unknown> | null> {
  if (!contextResourceCacheEnabled()) return null;

  const cacheKey = await buildContextResourceCacheKey(ctx, normalized);
  const { data, error } = await ctx.supabase
    .from('context_resource_cache')
    .select('id, payload, hit_count, expires_at')
    .eq('cache_key', cacheKey)
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data?.payload) return null;

  ctx.supabase
    .from('context_resource_cache')
    .update({
      hit_count: (data.hit_count || 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .then(({ error: updateError }: { error: { message?: string } | null }) => {
      if (updateError) console.warn('[unified-chat] context-resource cache hit update failed:', updateError.message);
    });

  const payload = data.payload && typeof data.payload === 'object'
    ? data.payload as Record<string, unknown>
    : { result: data.payload };
  return withResourceMeta(payload, normalized, {
    hit: true,
    ttlSeconds: contextResourceCacheTtlSeconds(normalized.resource_type),
    expiresAt: data.expires_at,
  });
}

async function storeContextResourceCache(
  ctx: Omit<ToolExecutionContext, 'args'>,
  normalized: NormalizedContextResource,
  payload: Record<string, unknown>,
): Promise<{ stored: boolean; expiresAt?: string }> {
  if (!contextResourceCacheEnabled()) return { stored: false };
  if (!shouldCacheContextResource(payload)) return { stored: false };

  const ttlSeconds = contextResourceCacheTtlSeconds(normalized.resource_type);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const cacheKey = await buildContextResourceCacheKey(ctx, normalized);
  const { error } = await ctx.supabase
    .from('context_resource_cache')
    .upsert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      cache_key: cacheKey,
      resource_uri: normalized.uri,
      resource_type: normalized.resource_type,
      source_versions: {
        strategy: 'ttl_plus_org_mutation_invalidation',
      },
      payload,
      hit_count: 0,
      last_accessed_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'cache_key' });

  if (error) {
    console.warn('[unified-chat] context-resource cache store failed:', error.message);
    return { stored: false };
  }

  return { stored: true, expiresAt };
}

export async function invalidateContextResourceCacheForOrganization(
  supabase: ToolExecutionContext['supabase'],
  organizationId: string,
): Promise<void> {
  if (!organizationId) return;
  const { error } = await supabase
    .from('context_resource_cache')
    .delete()
    .eq('organization_id', organizationId);
  if (error) {
    console.warn('[unified-chat] context-resource cache invalidation failed:', error.message);
  }
}

export async function resolveContextResource(
  ctx: Omit<ToolExecutionContext, 'args'>,
  request: ContextResourceRequest,
): Promise<Record<string, unknown>> {
  const normalized = normalizeContextResourceRequest(request);
  if (!normalized) {
    return {
      success: false,
      message:
        'I could not resolve that context resource. Use a supported URI like crm://accounts/{id}/context, crm://deals/{id}/context, crm://contacts/{id}/context, crm://accounts/{id}/messages, or analytics://pipeline.',
    };
  }

  const cached = await loadCachedContextResource(ctx, normalized);
  if (cached) return cached;

  const skill = CONTEXT_RESOURCE_SKILLS[normalized.resource_type];
  const result = await skill.execute({ ...ctx, args: normalized.args });
  const resultObject = (result && typeof result === 'object' ? result : { result }) as Record<string, unknown>;
  const storeResult = await storeContextResourceCache(ctx, normalized, resultObject);

  return withResourceMeta(resultObject, normalized, {
    hit: false,
    stored: storeResult.stored,
    ttlSeconds: contextResourceCacheTtlSeconds(normalized.resource_type),
    expiresAt: storeResult.expiresAt,
  });
}
