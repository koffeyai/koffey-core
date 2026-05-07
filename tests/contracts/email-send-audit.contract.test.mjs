import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migration = fs.readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260504151000_add_email_send_audit.sql'),
  'utf8',
);
const sender = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/send-scheduling-email/index.ts'),
  'utf8',
);
const bounceMigration = fs.readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260507124500_add_email_bounce_tracking.sql'),
  'utf8',
);

test('send-scheduling-email has the email_sends audit table it requires', () => {
  assert.match(sender, /\.from\('email_sends'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.email_sends/i);
  assert.match(migration, /recipient_email TEXT NOT NULL/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration, /provider_message_id TEXT/);
  assert.match(migration, /trace_id TEXT/);
  assert.match(migration, /GRANT ALL ON TABLE public\.email_sends TO service_role/i);
  assert.match(bounceMigration, /'bounced'/);
  assert.match(bounceMigration, /idx_email_sends_recipient_status/);
});
