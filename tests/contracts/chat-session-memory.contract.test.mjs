import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIVE_CHAT_SESSION_STORAGE_PREFIX,
  CHAT_CONTEXT_WINDOW_MS,
  clearStoredActiveChatSession,
  getActiveChatSessionStorageKey,
  isChatSessionWithinMemoryWindow,
  readStoredActiveChatSession,
  writeStoredActiveChatSession,
} from '../../src/lib/chatSessionMemory.ts';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

function createStorage() {
  const values = new Map();
  return {
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
    key(index) {
      return Array.from(values.keys())[index] || null;
    },
    get length() {
      return values.size;
    },
  };
}

test('active chat session memory survives reloads for one day', () => {
  const storage = createStorage();
  const now = Date.parse('2026-05-07T14:00:00Z');

  writeStoredActiveChatSession('user-1', 'org-1', 'session-1', storage, now);

  assert.equal(getActiveChatSessionStorageKey('user-1', 'org-1'), `${ACTIVE_CHAT_SESSION_STORAGE_PREFIX}:user-1:org-1`);
  assert.equal(readStoredActiveChatSession('user-1', 'org-1', storage, now + 60_000), 'session-1');
  assert.equal(isChatSessionWithinMemoryWindow(now, now + CHAT_CONTEXT_WINDOW_MS - 1), true);
});

test('active chat session memory expires after one day and can be cleared', () => {
  const storage = createStorage();
  const now = Date.parse('2026-05-07T14:00:00Z');

  writeStoredActiveChatSession('user-1', 'org-1', 'session-1', storage, now);

  assert.equal(readStoredActiveChatSession('user-1', 'org-1', storage, now + CHAT_CONTEXT_WINDOW_MS + 1), null);
  assert.equal(storage.length, 0);

  writeStoredActiveChatSession('user-1', 'org-1', 'session-2', storage, now);
  clearStoredActiveChatSession('user-1', 'org-1', storage);
  assert.equal(readStoredActiveChatSession('user-1', 'org-1', storage, now), null);
});

test('chat context is restored from persisted same-day messages when client state is stale', () => {
  const unifiedChat = readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');
  const useChat = readFileSync(path.join(repoRoot, 'src/hooks/useChat.ts'), 'utf8');
  const chatPanelStore = readFileSync(path.join(repoRoot, 'src/stores/chatPanelStore.ts'), 'utf8');
  const logger = readFileSync(path.join(repoRoot, 'supabase/functions/conversation-logger/index.ts'), 'utf8');
  const migration = readFileSync(path.join(repoRoot, 'supabase/migrations/20260507120000_touch_chat_session_on_message.sql'), 'utf8');

  assert.match(unifiedChat, /loadEffectiveConversationHistory/);
  assert.match(unifiedChat, /from\('chat_messages'\)/);
  assert.match(unifiedChat, /gte\('created_at', cutoffIso\)/);
  assert.match(unifiedChat, /currentRequestId/);
  assert.match(useChat, /readStoredActiveChatSession/);
  assert.match(useChat, /writeStoredActiveChatSession/);
  assert.match(useChat, /gte\('updated_at', cutoffIso\)/);
  const implementationStart = chatPanelStore.indexOf('openPanel: (message?: string, context?: any) => set({');
  const implementationEnd = chatPanelStore.indexOf('  closePanel:', implementationStart);
  const openPanelBlock = chatPanelStore.slice(implementationStart, implementationEnd);
  assert.doesNotMatch(openPanelBlock, /activeSessionId:\s*null/);
  assert.match(logger, /from\('chat_sessions'\)/);
  assert.match(logger, /updated_at: new Date\(\)\.toISOString\(\)/);
  assert.match(migration, /CREATE TRIGGER touch_chat_session_on_message/);
});
