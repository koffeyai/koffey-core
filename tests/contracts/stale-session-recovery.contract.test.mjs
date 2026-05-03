import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  SESSION_LAST_RESUME_IDLE_MS_KEY,
  getSessionFreshnessSnapshot,
  markAppActivity,
  markAppHidden,
  markAppVisible,
} from '../../src/lib/appSessionFreshness.ts';

const repoRoot = process.cwd();

function installSessionStorage() {
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
      clear() {
        values.clear();
      },
    },
  };
  return values;
}

test('session freshness marks long-hidden tabs as stale after resume', () => {
  const storage = installSessionStorage();
  const hiddenAt = 1_000;
  const resumedAt = hiddenAt + 31 * 60 * 1000;

  markAppActivity(hiddenAt);
  markAppHidden(hiddenAt);
  markAppVisible(resumedAt);

  assert.equal(Number(storage.get(SESSION_LAST_RESUME_IDLE_MS_KEY)), 31 * 60 * 1000);
  assert.equal(getSessionFreshnessSnapshot(resumedAt + 1_000).isLikelyStaleTab, true);
});

test('session freshness does not mark ordinary active tabs stale', () => {
  installSessionStorage();
  const now = 10_000;

  markAppActivity(now);

  assert.equal(getSessionFreshnessSnapshot(now + 5 * 60 * 1000).isLikelyStaleTab, false);
});

test('error boundary has one-time stale-tab recovery copy and guard', () => {
  const source = readFileSync(path.join(repoRoot, 'src/components/common/EnhancedErrorBoundary.tsx'), 'utf8');

  assert.match(source, /IDLE_ERROR_RELOAD_KEY/);
  assert.match(source, /getSessionFreshnessSnapshot\(\)\.isLikelyStaleTab/);
  assert.match(source, /Workspace Refresh Needed/);
  assert.match(source, /Reload Workspace/);
});
