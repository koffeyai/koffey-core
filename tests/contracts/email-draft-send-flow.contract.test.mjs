import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('email draft card sends through direct audited send path instead of chat reinterpretation', () => {
  const chatUi = readFileSync(path.join(repoRoot, 'src/components/chat/UnifiedChatInterface.tsx'), 'utf8');
  const useChat = readFileSync(path.join(repoRoot, 'src/hooks/useChat.ts'), 'utf8');
  const googleAuth = readFileSync(path.join(repoRoot, 'src/components/auth/GoogleAuth.tsx'), 'utf8');

  assert.match(chatUi, /onSend=\{sendEmailDraft\}/);
  assert.doesNotMatch(chatUi, /onApplyVoiceNotes=\{/);
  assert.match(useChat, /voice_notes\?: string/);
  assert.match(useChat, /style_profile\?:/);
  assert.match(useChat, /emailDraft: emailDraft \|\| null/);
  assert.doesNotMatch(chatUi, /Send the email to \$\{draft\.to_name\}/);
  assert.match(useChat, /functions\.invoke\('send-scheduling-email'/);
  assert.match(useChat, /crmOperations: \[\{ tool: 'send_scheduling_email'/);
  assert.match(useChat, /needsScopeUpgrade: requiredScope/);
  assert.match(useChat, /buildEmailSendFeedback/);
  assert.match(useChat, /Gmail send access is not connected yet/);
  assert.match(useChat, /I logged the email activity in CRM/);
  assert.match(chatUi, /connectGoogleScope\(/);
  assert.match(chatUi, /Gmail permission needed/);
  assert.match(chatUi, /Reconnect Gmail/);
  assert.doesNotMatch(chatUi, /\/api\/auth\/google/);
  assert.match(googleAuth, /GMAIL_READ_SCOPE[\s\S]+GMAIL_SEND_SCOPE/);
  assert.match(googleAuth, /missingScopes/);
  assert.ok(googleAuth.includes('const missingScopes = [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE].filter((scope) => !scopes.includes(scope));'));
});

test('draft email metadata survives backend response and message persistence', () => {
  const unifiedChat = readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');
  const conversationLogger = readFileSync(path.join(repoRoot, 'supabase/functions/conversation-logger/index.ts'), 'utf8');

  assert.match(unifiedChat, /function buildEmailDraftMeta/);
  assert.match(unifiedChat, /attachEmailDraftMeta\(meta, result\)/);
  assert.match(unifiedChat, /if \(!meta\.emailDraft && successfulDraftEmailOp\)/);
  assert.match(conversationLogger, /out\.emailDraft = \{/);
  assert.match(conversationLogger, /style_profile: styleProfile/);
  assert.match(conversationLogger, /deal_context: dealContext/);
});

test('audited email sender distinguishes missing scopes from bad Google tokens', () => {
  const sender = readFileSync(path.join(repoRoot, 'supabase/functions/send-scheduling-email/index.ts'), 'utf8');
  const googleAuth = readFileSync(path.join(repoRoot, 'supabase/functions/_shared/google-auth.ts'), 'utf8');

  assert.match(googleAuth, /refreshAccessTokenWithDiagnostics/);
  assert.match(sender, /GOOGLE_RECONNECT_REQUIRED/);
  assert.match(sender, /GOOGLE_OAUTH_CONFIGURATION_ERROR/);
  assert.match(sender, /NEEDS_GMAIL_SCOPE/);
  assert.match(sender, /missingScopes: \[GMAIL_SEND_SCOPE\]/);
  assert.match(sender, /GMAIL_SEND_FAILED/);
  assert.doesNotMatch(sender, /TOKEN_EXPIRED/);
});
