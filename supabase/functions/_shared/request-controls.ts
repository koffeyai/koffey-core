import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.50.0';

export interface PersistentRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  blockedUntil?: string | null;
}

export interface IdempotencyClaim {
  state: 'claimed' | 'completed' | 'in_progress' | 'conflict' | 'failed';
  responsePayload?: unknown;
  errorMessage?: string | null;
}

export function getTraceId(req: Request, prefix = 'edge'): string {
  const incoming = req.headers.get('x-trace-id') || req.headers.get('x-request-id');
  const cleanIncoming = String(incoming || '').trim();
  if (cleanIncoming && cleanIncoming.length <= 120) return cleanIncoming;
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function stableRequestHash(value: unknown): Promise<string> {
  return sha256Hex(stableStringify(value));
}

export async function checkPersistentRateLimit(
  supabase: SupabaseClient,
  key: string,
  limits: {
    requests: number;
    windowMs: number;
    blockDurationMs?: number;
  }
): Promise<PersistentRateLimitResult> {
  const { data, error } = await supabase.rpc('consume_edge_rate_limit', {
    p_rate_key: key,
    p_max_requests: limits.requests,
    p_window_seconds: Math.max(1, Math.ceil(limits.windowMs / 1000)),
    p_block_seconds: Math.max(1, Math.ceil((limits.blockDurationMs ?? 300000) / 1000)),
  });

  if (error) {
    throw new Error(`rate_limit_unavailable: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const resetAt = row?.reset_at ? new Date(row.reset_at).getTime() : Date.now() + limits.windowMs;

  return {
    allowed: row?.allowed === true,
    remaining: Number(row?.remaining ?? 0),
    resetTime: resetAt,
    blockedUntil: row?.blocked_until || null,
  };
}

export async function claimIdempotencyKey(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    scope: string;
    key: string;
    requestHash: string;
    traceId?: string | null;
    ttlSeconds?: number;
  }
): Promise<IdempotencyClaim> {
  const expiresAt = new Date(Date.now() + (params.ttlSeconds ?? 86400) * 1000).toISOString();
  const baseRecord = {
    organization_id: params.organizationId,
    user_id: params.userId,
    scope: params.scope,
    idempotency_key: params.key,
    request_hash: params.requestHash,
    status: 'in_progress',
    trace_id: params.traceId || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  const { error: insertError } = await supabase
    .from('edge_idempotency_keys')
    .insert(baseRecord);

  if (!insertError) {
    return { state: 'claimed' };
  }

  if (insertError.code !== '23505') {
    throw new Error(`idempotency_claim_failed: ${insertError.message}`);
  }

  const { data: existing, error: selectError } = await supabase
    .from('edge_idempotency_keys')
    .select('id, request_hash, status, response_payload, error_message, expires_at')
    .eq('organization_id', params.organizationId)
    .eq('scope', params.scope)
    .eq('idempotency_key', params.key)
    .maybeSingle();

  if (selectError) {
    throw new Error(`idempotency_lookup_failed: ${selectError.message}`);
  }

  if (!existing) {
    throw new Error('idempotency_lookup_failed: record not found after conflict');
  }

  if (existing.request_hash !== params.requestHash) {
    return {
      state: 'conflict',
      errorMessage: 'This idempotency key was already used for a different operation.',
    };
  }

  if (existing.status === 'completed') {
    return { state: 'completed', responsePayload: existing.response_payload };
  }

  if (existing.status === 'failed') {
    return {
      state: 'failed',
      responsePayload: existing.response_payload,
      errorMessage: existing.error_message,
    };
  }

  const expiresAtMs = existing.expires_at ? new Date(existing.expires_at).getTime() : 0;
  if (expiresAtMs > Date.now()) {
    return {
      state: 'in_progress',
      errorMessage: 'The original operation is still processing.',
    };
  }

  const { error: updateError } = await supabase
    .from('edge_idempotency_keys')
    .update(baseRecord)
    .eq('id', existing.id);

  if (updateError) {
    throw new Error(`idempotency_reclaim_failed: ${updateError.message}`);
  }

  return { state: 'claimed' };
}

export async function completeIdempotencyKey(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    scope: string;
    key: string;
    responsePayload: unknown;
  }
): Promise<void> {
  const { error } = await supabase
    .from('edge_idempotency_keys')
    .update({
      status: 'completed',
      response_payload: params.responsePayload,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', params.organizationId)
    .eq('scope', params.scope)
    .eq('idempotency_key', params.key);

  if (error) {
    console.warn('[request-controls] Failed to complete idempotency key:', error.message);
  }
}

export async function failIdempotencyKey(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    scope: string;
    key: string;
    errorMessage: string;
    responsePayload?: unknown;
  }
): Promise<void> {
  const { error } = await supabase
    .from('edge_idempotency_keys')
    .update({
      status: 'failed',
      response_payload: params.responsePayload ?? null,
      error_message: params.errorMessage.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', params.organizationId)
    .eq('scope', params.scope)
    .eq('idempotency_key', params.key);

  if (error) {
    console.warn('[request-controls] Failed to fail idempotency key:', error.message);
  }
}

function stableStringify(value: unknown): string {
  if (typeof value === 'undefined') {
    return 'null';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item !== 'undefined')
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
