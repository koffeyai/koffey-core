import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('Contacts page shows all people while Leads stays qualification-filtered', () => {
  const contactsManager = readFileSync(path.join(repoRoot, 'src/components/ContactsManager.tsx'), 'utf8');
  const leadsManager = readFileSync(path.join(repoRoot, 'src/components/LeadsManager.tsx'), 'utf8');
  const enhancedManager = readFileSync(path.join(repoRoot, 'src/components/crm/EnhancedCRMManager.tsx'), 'utf8');

  assert.doesNotMatch(contactsManager, /status_not_in/);
  assert.doesNotMatch(contactsManager, /Exclude lead/);
  assert.match(leadsManager, /status_in:\s*\[\.\.\.LEAD_STATUSES\]/);
  assert.match(enhancedManager, /const defaultContactStatus = isLeadsView \? 'lead' : 'prospect'/);
  assert.match(enhancedManager, /status: defaultContactStatus/);
});

test('chat has a grounded path for Contacts page visibility questions', () => {
  const unifiedChat = readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');

  assert.match(unifiedChat, /extractContactsPageVisibilityQuery/);
  assert.match(unifiedChat, /lookupContactsForVisibility/);
  assert.match(unifiedChat, /extractEmailsNearNameFromText/);
  assert.match(unifiedChat, /contacts_page_visibility/);
  assert.match(unifiedChat, /Contacts now shows all people records/);
  assert.match(unifiedChat, /different contact name/);
});
