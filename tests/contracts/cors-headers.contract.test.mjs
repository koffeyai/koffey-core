import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const corsSource = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/_shared/cors.ts'),
  'utf8',
);

test('shared Edge Function CORS allows browser trace headers used by chat', () => {
  const match = corsSource.match(/'Access-Control-Allow-Headers':\s*'([^']+)'/);
  assert.ok(match, 'Access-Control-Allow-Headers should be declared');

  const allowedHeaders = match[1]
    .split(',')
    .map((header) => header.trim().toLowerCase());

  assert.ok(allowedHeaders.includes('authorization'));
  assert.ok(allowedHeaders.includes('apikey'));
  assert.ok(allowedHeaders.includes('content-type'));
  assert.ok(allowedHeaders.includes('x-trace-id'));
  assert.ok(allowedHeaders.includes('x-request-id'));
});
