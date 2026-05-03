function getEnv(name) {
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    return Deno.env.get(name);
  }
  if (typeof process !== 'undefined' && process?.env) {
    return process.env[name];
  }
  return undefined;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stableHashPercent(input) {
  let hash = 0;
  const value = String(input || '');
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

export function getModelIntentMode() {
  const enabledFlag = String(getEnv('UNIFIED_CHAT_MODEL_INTENT_ENABLED') || 'true').toLowerCase() === 'true';
  if (!enabledFlag) return 'off';
  const rawMode = String(getEnv('UNIFIED_CHAT_MODEL_INTENT_MODE') || 'off').toLowerCase();
  return ['off', 'shadow', 'live'].includes(rawMode) ? rawMode : 'off';
}

export function isModelIntentEnabled({ organizationId, userId }) {
  return resolveModelIntentRollout({ organizationId, userId }).enabled;
}

export function resolveModelIntentRollout({ organizationId, userId }) {
  const mode = getModelIntentMode();
  if (mode === 'off') {
    return { mode, enabled: false, cohortPercent: 0 };
  }

  const safeUserId = String(userId || '').trim();
  const safeOrgId = String(organizationId || '').trim();
  if (!safeUserId || !safeOrgId) {
    return { mode, enabled: false, cohortPercent: 0 };
  }

  const denylist = new Set(parseCsv(getEnv('UNIFIED_CHAT_MODEL_INTENT_DENYLIST')));
  if (denylist.has(safeUserId)) {
    return { mode, enabled: false, cohortPercent: 0, reason: 'denylist' };
  }

  const allowlist = new Set(parseCsv(getEnv('UNIFIED_CHAT_MODEL_INTENT_ALLOWLIST')));
  if (allowlist.has(safeUserId)) {
    return { mode, enabled: true, cohortPercent: 100, reason: 'allowlist' };
  }

  const rolloutPercent = Math.max(0, Math.min(100, Number(getEnv('UNIFIED_CHAT_MODEL_INTENT_ROLLOUT_PERCENT') || '10') || 0));
  const bucket = stableHashPercent(`${safeOrgId}:${safeUserId}`);
  return {
    mode,
    enabled: bucket < rolloutPercent,
    cohortPercent: rolloutPercent,
    bucket,
    reason: 'bucket',
  };
}
