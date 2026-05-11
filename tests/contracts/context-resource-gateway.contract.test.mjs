import test from 'node:test';
import assert from 'node:assert/strict';
import {
  invalidateContextResourceCacheForOrganization,
  normalizeContextResourceRequest,
  resolveContextResource,
} from '../../supabase/functions/unified-chat/skills/context/resource-gateway.ts';

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

function installDenoEnv(env = {}) {
  globalThis.Deno = {
    env: {
      get(key) {
        return env[key];
      },
    },
  };
}

class ContextResourceCacheQuery {
  constructor(state) {
    this.state = state;
    this.filters = {};
    this.mode = 'select';
    this.updatePayload = null;
  }

  select() {
    this.mode = 'select';
    return this;
  }

  eq(field, value) {
    this.filters[field] = value;
    return this;
  }

  gt(field, value) {
    this.filters[`${field}:gt`] = value;
    return this;
  }

  maybeSingle() {
    const row = [...this.state.cacheRows.values()].find((candidate) => {
      return (
        candidate.cache_key === this.filters.cache_key &&
        candidate.organization_id === this.filters.organization_id &&
        candidate.user_id === this.filters.user_id &&
        candidate.expires_at > this.filters['expires_at:gt']
      );
    });
    return Promise.resolve({ data: row || null, error: null });
  }

  update(payload) {
    this.mode = 'update';
    this.updatePayload = payload;
    return this;
  }

  upsert(payload, options) {
    assert.equal(options.onConflict, 'cache_key');
    const existing = this.state.cacheRows.get(payload.cache_key);
    this.state.cacheRows.set(payload.cache_key, {
      ...(existing || {}),
      ...payload,
      id: existing?.id || `cache-${this.state.cacheRows.size + 1}`,
    });
    this.state.upserts.push(payload);
    return Promise.resolve({ error: null });
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  then(resolve, reject) {
    if (this.mode === 'update') {
      const row = [...this.state.cacheRows.values()].find((candidate) => candidate.id === this.filters.id);
      if (row) Object.assign(row, this.updatePayload);
      this.state.updates.push({ filters: this.filters, payload: this.updatePayload });
      return Promise.resolve({ error: null }).then(resolve, reject);
    }

    if (this.mode === 'delete') {
      for (const [key, row] of this.state.cacheRows.entries()) {
        if (row.organization_id === this.filters.organization_id) {
          this.state.deleted.push(row);
          this.state.cacheRows.delete(key);
        }
      }
      return Promise.resolve({ error: null }).then(resolve, reject);
    }

    return this.maybeSingle().then(resolve, reject);
  }
}

function createCachedAccountContextSupabase() {
  const state = {
    rpcCalls: 0,
    rpcArgs: null,
    cacheRows: new Map(),
    updates: [],
    upserts: [],
    deleted: [],
  };

  return {
    state,
    from(table) {
      assert.equal(table, 'context_resource_cache');
      return new ContextResourceCacheQuery(state);
    },
    rpc(name, args) {
      assert.equal(name, 'get_account_context_for_llm');
      state.rpcCalls += 1;
      state.rpcArgs = args;
      return Promise.resolve({
        data: {
          account: { id: args.p_account_id, name: 'Northstar Robotics' },
          deal_summary: { total_deals: 1, open_deals: 1 },
        },
        error: null,
      });
    },
  };
}

test('context resource gateway normalizes account context URI', () => {
  const normalized = normalizeContextResourceRequest({
    resource_uri: `crm://accounts/${ACCOUNT_ID}/context`,
  });

  assert.equal(normalized.resource_type, 'account_context');
  assert.equal(normalized.tool, 'get_account_context');
  assert.deepEqual(normalized.args, { account_id: ACCOUNT_ID });
  assert.equal(normalized.uri, `crm://accounts/${ACCOUNT_ID}/context`);
});

test('context resource gateway normalizes structured pipeline resources', () => {
  const normalized = normalizeContextResourceRequest({
    resource_type: 'pipeline_context',
    scope: 'org',
    period_start: '2026-05-01',
    period_end: '2026-05-31',
  });

  assert.equal(normalized.resource_type, 'pipeline_context');
  assert.equal(normalized.tool, 'get_pipeline_context');
  assert.deepEqual(normalized.args, {
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    scope: 'org',
  });
  assert.equal(normalized.uri, 'analytics://pipeline?period_start=2026-05-01&period_end=2026-05-31&scope=org');
});

test('context resource gateway resolves account resources through typed skill', async () => {
  installDenoEnv({ CONTEXT_RESOURCE_CACHE_ENABLED: 'false' });

  const supabase = {
    state: { rpcArgs: null },
    rpc(name, args) {
      assert.equal(name, 'get_account_context_for_llm');
      this.state.rpcArgs = args;
      return Promise.resolve({
        data: {
          account: { id: args.p_account_id, name: 'Northstar Robotics' },
          deal_summary: { total_deals: 1, open_deals: 1 },
        },
        error: null,
      });
    },
  };

  const result = await resolveContextResource(
    {
      supabase,
      organizationId: 'org-1',
      userId: 'user-1',
    },
    {
      resource_uri: `crm://accounts/${ACCOUNT_ID}/context`,
    },
  );

  assert.equal(result.__trusted_context, true);
  assert.equal(result.account.name, 'Northstar Robotics');
  assert.equal(result.__contextResource.tool, 'get_account_context');
  assert.equal(result.__contextResource.resource_type, 'account_context');
  assert.equal(supabase.state.rpcArgs.p_account_id, ACCOUNT_ID);
});

test('context resource gateway stores and reuses cacheable account context resources', async () => {
  installDenoEnv({ CONTEXT_RESOURCE_CACHE_ENABLED: 'true', CONTEXT_RESOURCE_CACHE_TTL_SECONDS: '120' });
  const supabase = createCachedAccountContextSupabase();
  const ctx = {
    supabase,
    organizationId: '11111111-1111-4111-8111-111111111111',
    userId: '33333333-3333-4333-8333-333333333333',
  };

  const first = await resolveContextResource(ctx, {
    resource_uri: `crm://accounts/${ACCOUNT_ID}/context`,
  });

  assert.equal(first.account.name, 'Northstar Robotics');
  assert.equal(first.__contextResource.cache.hit, false);
  assert.equal(first.__contextResource.cache.stored, true);
  assert.equal(first.__contextResource.cache.ttlSeconds, 120);
  assert.equal(supabase.state.rpcCalls, 1);
  assert.equal(supabase.state.upserts.length, 1);

  const second = await resolveContextResource(ctx, {
    resource_type: 'account_context',
    entity_id: ACCOUNT_ID,
  });

  assert.equal(second.account.name, 'Northstar Robotics');
  assert.equal(second.__contextResource.cache.hit, true);
  assert.equal(second.__contextResource.cache.ttlSeconds, 120);
  assert.equal(supabase.state.rpcCalls, 1);
  assert.equal(supabase.state.updates.length, 1);
  assert.equal([...supabase.state.cacheRows.values()][0].hit_count, 1);
});

test('context resource gateway invalidates organization cache after mutations', async () => {
  installDenoEnv({ CONTEXT_RESOURCE_CACHE_ENABLED: 'true' });
  const supabase = createCachedAccountContextSupabase();
  const ctx = {
    supabase,
    organizationId: '11111111-1111-4111-8111-111111111111',
    userId: '33333333-3333-4333-8333-333333333333',
  };

  await resolveContextResource(ctx, {
    resource_uri: `crm://accounts/${ACCOUNT_ID}/context`,
  });
  assert.equal(supabase.state.cacheRows.size, 1);

  await invalidateContextResourceCacheForOrganization(supabase, ctx.organizationId);

  assert.equal(supabase.state.cacheRows.size, 0);
  assert.equal(supabase.state.deleted.length, 1);
});
