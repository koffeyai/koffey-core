import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModelIntentMode,
  isModelIntentEnabled,
  resolveModelIntentRollout,
} from '../../supabase/functions/unified-chat/intent/intent-rollout.mjs';

function withEnv(pairs, fn) {
  const original = {};
  for (const [key, value] of Object.entries(pairs)) {
    original[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('shadow-disabled user does not enable extractor', () => {
  withEnv({ UNIFIED_CHAT_MODEL_INTENT_MODE: 'off', UNIFIED_CHAT_MODEL_INTENT_ENABLED: 'true' }, () => {
    assert.equal(getModelIntentMode(), 'off');
    assert.equal(isModelIntentEnabled({ organizationId: 'org-1', userId: 'user-1' }), false);
  });
});

test('shadow-enabled user joins cohort deterministically', () => {
  withEnv({
    UNIFIED_CHAT_MODEL_INTENT_MODE: 'shadow',
    UNIFIED_CHAT_MODEL_INTENT_ENABLED: 'true',
    UNIFIED_CHAT_MODEL_INTENT_ROLLOUT_PERCENT: '100',
  }, () => {
    const result = resolveModelIntentRollout({ organizationId: 'org-1', userId: 'user-1' });
    assert.equal(result.mode, 'shadow');
    assert.equal(result.enabled, true);
  });
});

test('allowlist overrides rollout bucket', () => {
  withEnv({
    UNIFIED_CHAT_MODEL_INTENT_MODE: 'shadow',
    UNIFIED_CHAT_MODEL_INTENT_ENABLED: 'true',
    UNIFIED_CHAT_MODEL_INTENT_ROLLOUT_PERCENT: '0',
    UNIFIED_CHAT_MODEL_INTENT_ALLOWLIST: 'user-1',
  }, () => {
    assert.equal(isModelIntentEnabled({ organizationId: 'org-1', userId: 'user-1' }), true);
  });
});

test('denylist disables extractor even when rollout is 100%', () => {
  withEnv({
    UNIFIED_CHAT_MODEL_INTENT_MODE: 'live',
    UNIFIED_CHAT_MODEL_INTENT_ENABLED: 'true',
    UNIFIED_CHAT_MODEL_INTENT_ROLLOUT_PERCENT: '100',
    UNIFIED_CHAT_MODEL_INTENT_DENYLIST: 'user-1',
  }, () => {
    const result = resolveModelIntentRollout({ organizationId: 'org-1', userId: 'user-1' });
    assert.equal(result.mode, 'live');
    assert.equal(result.enabled, false);
  });
});
