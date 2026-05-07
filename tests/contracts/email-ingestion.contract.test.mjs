import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { estimateRelevantDomains } from '../../supabase/functions/unified-chat/skills/domain-estimator.mjs';
import { inferMutationIntent } from '../../supabase/functions/unified-chat/routing-policy.mjs';

const repoRoot = process.cwd();

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

test('email sync creates CRM activities for any matched CRM record', () => {
  const source = read('supabase/functions/sync-email-to-crm/index.ts');
  const matchingSection = source.slice(
    source.indexOf('const hasCrmMatch'),
    source.indexOf('// Insert email message record'),
  );
  const activitySection = source.slice(
    source.indexOf('async function createEmailActivity'),
    source.indexOf('// ============================================================================', source.indexOf('// Engagement Stats Update')),
  );

  assert.match(matchingSection, /Boolean\(match\.contactId \|\| match\.accountId \|\| match\.dealId\)/);
  assert.match(matchingSection, /if \(hasCrmMatch\)/);
  assert.match(matchingSection, /stats\.matched\+\+/);
  assert.match(activitySection, /assigned_to:\s*userId/);
  assert.match(activitySection, /subject:\s*msg\.subject/);
  assert.match(activitySection, /activity_date:\s*msg\.receivedAt/);
  assert.match(activitySection, /completed:\s*true/);
});

test('email sync notifies on bounces instead of dropping delivery failures', () => {
  const source = read('supabase/functions/sync-email-to-crm/index.ts');
  const providerSource = read('supabase/functions/_shared/email-provider-gmail.ts');
  const sendAuditMigration = read('supabase/migrations/20260507124500_add_email_bounce_tracking.sql');

  assert.match(providerSource, /BOUNCE_SENDER_PATTERN/);
  assert.match(providerSource, /BOUNCE_SUBJECT_PATTERN/);
  assert.match(providerSource, /bouncedRecipientEmail:\s*bounceInfo\.recipientEmail/);
  assert.match(source, /if \(msg\.isBounce\) \{/);
  assert.match(source, /processBounceMessage\(msg, userId, organizationId, provider\.name\)/);
  assert.match(source, /type:\s*'email_bounced'/);
  assert.match(source, /match_status:\s*'ignored'/);
  assert.match(source, /match_method:\s*'bounce'/);
  assert.match(source, /\.from\('email_sends'\)[\s\S]*?status:\s*'bounced'/);
  assert.match(source, /\.from\('suggested_actions'\)[\s\S]*?trigger_event:\s*'email_bounce'/);
  assert.match(sendAuditMigration, /'bounced'/);
});

test('email search and manual linking stay scoped to the current user inbox', () => {
  const searchSource = read('supabase/functions/unified-chat/skills/email/search-emails.ts');
  const linkSource = read('supabase/functions/unified-chat/skills/email/link-email-to-crm.ts');

  assert.match(searchSource, /\.from\('email_messages'\)[\s\S]*?\.eq\('organization_id', ctx\.organizationId\)[\s\S]*?\.eq\('user_id', ctx\.userId\)/);
  assert.match(linkSource, /\.from\('email_messages'\)[\s\S]*?\.eq\('organization_id', ctx\.organizationId\)[\s\S]*?\.eq\('user_id', ctx\.userId\)/);
  assert.match(linkSource, /\.update\(\{[\s\S]*?match_method:\s*'manual'[\s\S]*?\.eq\('organization_id', ctx\.organizationId\)[\s\S]*?\.eq\('user_id', ctx\.userId\)[\s\S]*?\.eq\('id', foundEmail\.email\.id\)/);
  assert.match(linkSource, /rpc\('create_email_activity_for_message'/);
});

test('manual email linking is registered and classified as an email CRM mutation', () => {
  const registry = read('supabase/functions/unified-chat/skills/registry.ts');

  assert.match(registry, /import linkEmailToCrm from '\.\/email\/link-email-to-crm\.ts'/);
  assert.match(registry, /linkEmailToCrm/);
  assert.equal(estimateRelevantDomains('link the unmatched email to the Acme Corp deal').includes('email'), true);
  assert.equal(inferMutationIntent({ message: 'attach this email to the Acme Corp deal', domains: ['email'] }), true);
});

test('email CRM linking migration backfills activities and enforces same-user manual links', () => {
  const sql = read('supabase/migrations/20260427150000_harden_email_crm_linking.sql');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_email_activity_for_message/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.refresh_email_engagement_stats_for_contact/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.link_email_message_to_crm/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /email_row\.user_id <> requester_id/);
  assert.match(sql, /match_method = 'backfill'/);
  assert.match(sql, /PERFORM public\.create_email_activity_for_message\(linked_email_id\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.link_email_message_to_crm\(UUID, UUID, UUID, UUID\) TO authenticated, service_role/);
});
