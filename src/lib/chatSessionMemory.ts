export const CHAT_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_CHAT_SESSION_STORAGE_PREFIX = 'koffey_active_chat_session';

interface StoredActiveChatSession {
  sessionId: string;
  userId: string;
  organizationId: string;
  updatedAt: number;
}

export function getActiveChatSessionStorageKey(userId: string, organizationId: string): string {
  return `${ACTIVE_CHAT_SESSION_STORAGE_PREFIX}:${userId}:${organizationId}`;
}

export function isChatSessionWithinMemoryWindow(updatedAt: number | string | null | undefined, now = Date.now()): boolean {
  const timestamp = typeof updatedAt === 'number'
    ? updatedAt
    : Date.parse(String(updatedAt || ''));
  return Number.isFinite(timestamp) && now - timestamp <= CHAT_CONTEXT_WINDOW_MS;
}

function parseStoredActiveChatSession(value: string | null): StoredActiveChatSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredActiveChatSession>;
    if (
      typeof parsed.sessionId === 'string'
      && typeof parsed.userId === 'string'
      && typeof parsed.organizationId === 'string'
      && Number.isFinite(Number(parsed.updatedAt))
    ) {
      return {
        sessionId: parsed.sessionId,
        userId: parsed.userId,
        organizationId: parsed.organizationId,
        updatedAt: Number(parsed.updatedAt),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function readStoredActiveChatSession(
  userId: string,
  organizationId: string,
  storage: Storage | undefined = globalThis.localStorage,
  now = Date.now(),
): string | null {
  try {
    const key = getActiveChatSessionStorageKey(userId, organizationId);
    const stored = parseStoredActiveChatSession(storage?.getItem(key) || null);
    if (
      stored
      && stored.userId === userId
      && stored.organizationId === organizationId
      && isChatSessionWithinMemoryWindow(stored.updatedAt, now)
    ) {
      return stored.sessionId;
    }
    storage?.removeItem(key);
  } catch {
    return null;
  }
  return null;
}

export function writeStoredActiveChatSession(
  userId: string,
  organizationId: string,
  sessionId: string,
  storage: Storage | undefined = globalThis.localStorage,
  now = Date.now(),
): void {
  try {
    storage?.setItem(
      getActiveChatSessionStorageKey(userId, organizationId),
      JSON.stringify({ sessionId, userId, organizationId, updatedAt: now }),
    );
  } catch {
    // Storage can be unavailable in private windows or test environments.
  }
}

export function clearStoredActiveChatSession(
  userId: string,
  organizationId: string,
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    storage?.removeItem(getActiveChatSessionStorageKey(userId, organizationId));
  } catch {
    // Storage can be unavailable in private windows or test environments.
  }
}
