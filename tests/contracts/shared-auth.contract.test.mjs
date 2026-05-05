import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

test('shared auth exports organization authorization helper used by edge functions', () => {
  const authSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/_shared/auth.ts'), 'utf8');
  const unifiedChatSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');
  const schedulingEmailSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/send-scheduling-email/index.ts'), 'utf8');

  assert.match(authSource, /export\s+async\s+function\s+resolveAuthorizedOrganization/);
  assert.match(authSource, /\.from\('organization_members'\)/);
  assert.match(authSource, /\.eq\('user_id',\s*normalizedUserId\)/);
  assert.match(authSource, /\.eq\('is_active',\s*true\)/);
  assert.match(unifiedChatSource, /resolveAuthorizedOrganization/);
  assert.match(schedulingEmailSource, /resolveAuthorizedOrganization/);
});
