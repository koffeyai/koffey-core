import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(new URL('../../', import.meta.url).pathname);

test('hallucination guard treats resolved pending deal updates as tool data', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/gateway/verification.ts'), 'utf8');

  assert.match(source, /r\.deal_id \|\| r\.account_id \|\| r\.contact_id \|\| r\.task_id/);
  assert.match(source, /r\.pending_update\?\.deal_id \|\| r\.pending_delete\?\.deal_id/);
});
