import test from 'node:test';
import assert from 'node:assert/strict';

import { executeCreateContact } from '../../supabase/functions/unified-chat/tools/crm-create.ts';

function createDuplicateContactSupabaseStub() {
  let pendingPayload = null;
  let updatePayload = null;
  const existingContact = {
    id: 'contact-1',
    full_name: 'Existing Person',
    email: 'existing@example.com',
    phone: null,
    company: 'Example Robotics',
    title: null,
    account_id: 'account-1',
  };

  return {
    get pendingPayload() {
      return pendingPayload;
    },
    get updatePayload() {
      return updatePayload;
    },
    from(table) {
      if (table === 'contacts') {
        const chain = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          ilike() {
            return chain;
          },
          limit() {
            return Promise.resolve({ data: [existingContact], error: null });
          },
        };
        return chain;
      }

      if (table === 'chat_sessions') {
        const chain = {
          update(payload) {
            updatePayload = payload;
            pendingPayload = payload.pending_contact_creation;
            return chain;
          },
          eq() {
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

test('duplicate contact prompts store a resumable pending contact update', async () => {
  const supabase = createDuplicateContactSupabaseStub();

  const result = await executeCreateContact(
    supabase,
    {
      name: 'Jordan Example',
      email: 'existing@example.com',
      company: 'Example Robotics',
    },
    'org-1',
    'user-1',
    'session-1',
    'chat_sessions',
  );

  assert.equal(result.duplicate, true);
  assert.equal(result._needsConfirmation, true);
  assert.equal(result._confirmationType, 'duplicate_contact_update');
  assert.match(result.message, /Reply "yes" to update this contact/);
  assert.deepEqual(result.pending_contact_update, {
    contact_id: 'contact-1',
    updates: {
      first_name: 'Jordan',
      last_name: 'Example',
    },
  });
  assert.deepEqual(supabase.pendingPayload, {
    type: 'duplicate_contact_update',
    existing_contact_id: 'contact-1',
    existing_contact_name: 'Existing Person',
    requested_name: 'Jordan Example',
    requested_email: 'existing@example.com',
    updates: {
      first_name: 'Jordan',
      last_name: 'Example',
    },
  });
  assert.equal(supabase.updatePayload.pending_draft_email, null);
  assert.equal(supabase.updatePayload.pending_draft_email_at, null);
});
