import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migration = fs.readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260504150000_add_edge_request_controls.sql'),
  'utf8',
);
const requestControls = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/_shared/request-controls.ts'),
  'utf8',
);

test('edge request controls migration defines durable rate limit RPC used by functions', () => {
  assert.match(requestControls, /rpc\('consume_edge_rate_limit'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.edge_rate_limits/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.consume_edge_rate_limit/i);
  assert.match(migration, /p_rate_key TEXT/);
  assert.match(migration, /p_max_requests INTEGER/);
  assert.match(migration, /p_window_seconds INTEGER/);
  assert.match(migration, /p_block_seconds INTEGER/);
  assert.match(migration, /RETURNS TABLE/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.consume_edge_rate_limit/i);
});

test('edge request controls migration defines idempotency table used by functions', () => {
  assert.match(requestControls, /\.from\('edge_idempotency_keys'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.edge_idempotency_keys/i);
  assert.match(migration, /UNIQUE \(organization_id, scope, idempotency_key\)/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'in_progress'/);
  assert.match(migration, /GRANT ALL ON TABLE public\.edge_idempotency_keys TO service_role/i);
});
