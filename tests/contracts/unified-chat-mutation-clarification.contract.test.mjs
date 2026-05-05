import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(new URL('../../', import.meta.url).pathname);

test('unified chat lets deterministic mutation cues bypass pre-tool clarification', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');

  assert.match(source, /const deterministicMutationOverride = hasDeterministicMutationCue\(message\)/);
  assert.match(source, /const shouldReturnClarification = !deterministicMutationOverride\s+&& !hasPendingMutationContext/);
});

test('unified chat routes pending deal update confirmations through tools', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');

  assert.match(source, /inferPendingUpdateDealFromHistory/);
  assert.match(source, /pending_deal_update, pending_deal_update_at/);
  assert.match(source, /storePendingDealUpdate/);
  assert.match(source, /const hasPendingUpdateDealContext = !!effectivePendingUpdateDealData/);
  assert.match(source, /hasPendingDeleteDealContext \|\| hasPendingUpdateDealContext \|\| hasPendingDraftEmailContext/);
  assert.match(source, /hasPendingUpdateDealContext && domainFilter && !domainFilter\.includes\('update'\)/);
});
