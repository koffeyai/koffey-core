/**
 * Pure helpers for response-cache gating and key shaping.
 * Kept JS-only for fast contract tests in Node.
 */

export function normalizeForCache(input, maxLen = 500) {
  return (input || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function shouldAttemptResponseCache({
  message,
  followUpLike,
  compoundLike,
  dataOrActionRequest,
  minLen = 6,
  maxLen = 260,
}) {
  if (!dataOrActionRequest) return false;
  if (followUpLike || compoundLike) return false;

  const normalized = normalizeForCache(message);
  if (!normalized || normalized.length < minLen) return false;
  if (normalized.length > maxLen) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)\b/.test(normalized)) return false;
  return true;
}

export function getRecencyBucket(seconds, nowMs = Date.now()) {
  const safeSeconds = Math.max(1, Number(seconds || 1));
  return Math.floor(nowMs / (safeSeconds * 1000));
}

export function buildResponseCacheKeySource({
  organizationId,
  userId,
  message,
  bucket,
  contextKey = '',
}) {
  const normalized = normalizeForCache(message);
  const normalizedContext = normalizeForCache(contextKey, 220) || 'noctx';
  return `${organizationId}|${userId}|${normalized}|${normalizedContext}|${bucket}`;
}

export function isReadOnlyToolSet(crmOperations, readOnlyToolNames) {
  if (!Array.isArray(crmOperations) || crmOperations.length === 0) return false;
  const allow = new Set(readOnlyToolNames || []);
  return crmOperations.every((op) => {
    const tool = String(op?.tool || '');
    if (!allow.has(tool)) return false;
    if (op?.result?.error) return false;
    return true;
  });
}
