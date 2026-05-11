import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migration = fs.readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260508123000_add_context_resource_cache.sql'),
  'utf8',
);
const gateway = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/unified-chat/skills/context/resource-gateway.ts'),
  'utf8',
);
const unifiedChat = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'),
  'utf8',
);

test('context resource cache migration defines the table used by the gateway', () => {
  assert.match(gateway, /\.from\('context_resource_cache'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.context_resource_cache/i);
  assert.match(migration, /organization_id UUID NOT NULL REFERENCES public\.organizations\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /user_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /cache_key TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /resource_uri TEXT NOT NULL/i);
  assert.match(migration, /payload JSONB NOT NULL/i);
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_context_resource_cache_org_resource/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_context_resource_cache_user_type/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_context_resource_cache_expires/i);
});

test('context resource cache is service-role only and invalidated after mutations', () => {
  assert.match(migration, /ALTER TABLE public\.context_resource_cache ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY "Service role full access to context resource cache"/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.context_resource_cache FROM PUBLIC/i);
  assert.match(migration, /GRANT ALL ON TABLE public\.context_resource_cache TO service_role/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cleanup_context_resource_cache\(\)/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.cleanup_context_resource_cache\(\) TO service_role/i);
  assert.match(unifiedChat, /invalidateContextResourceCacheForOrganization/);
  assert.match(unifiedChat, /contextResourceCacheInvalidated/);
});
