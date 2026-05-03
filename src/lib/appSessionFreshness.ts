export const SESSION_LAST_ACTIVE_KEY = 'koffey_session_last_active';
export const SESSION_LAST_HIDDEN_KEY = 'koffey_session_last_hidden';
export const SESSION_LAST_RESUMED_KEY = 'koffey_session_last_resumed';
export const SESSION_LAST_RESUME_IDLE_MS_KEY = 'koffey_session_last_resume_idle_ms';

const STALE_IDLE_MS = 30 * 60 * 1000;
const RECENT_RESUME_WINDOW_MS = 10 * 60 * 1000;

function safeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readNumber(key: string): number {
  const storage = safeSessionStorage();
  if (!storage) return 0;
  const value = Number(storage.getItem(key) || 0);
  return Number.isFinite(value) ? value : 0;
}

function writeNumber(key: string, value: number) {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.setItem(key, String(value));
}

export function markAppActivity(now = Date.now()) {
  writeNumber(SESSION_LAST_ACTIVE_KEY, now);
}

export function markAppHidden(now = Date.now()) {
  writeNumber(SESSION_LAST_HIDDEN_KEY, now);
}

export function markAppVisible(now = Date.now()) {
  const hiddenAt = readNumber(SESSION_LAST_HIDDEN_KEY);
  writeNumber(SESSION_LAST_RESUMED_KEY, now);

  if (hiddenAt > 0 && now >= hiddenAt) {
    writeNumber(SESSION_LAST_RESUME_IDLE_MS_KEY, now - hiddenAt);
  }
}

export function getSessionFreshnessSnapshot(now = Date.now()) {
  const lastActiveAt = readNumber(SESSION_LAST_ACTIVE_KEY);
  const lastResumedAt = readNumber(SESSION_LAST_RESUMED_KEY);
  const resumeIdleMs = readNumber(SESSION_LAST_RESUME_IDLE_MS_KEY);
  const inactiveForMs = lastActiveAt > 0 && now >= lastActiveAt ? now - lastActiveAt : 0;
  const resumedAgoMs = lastResumedAt > 0 && now >= lastResumedAt ? now - lastResumedAt : Number.POSITIVE_INFINITY;

  return {
    inactiveForMs,
    resumeIdleMs,
    resumedAgoMs,
    isLikelyStaleTab:
      inactiveForMs >= STALE_IDLE_MS ||
      (resumeIdleMs >= STALE_IDLE_MS && resumedAgoMs <= RECENT_RESUME_WINDOW_MS),
  };
}
