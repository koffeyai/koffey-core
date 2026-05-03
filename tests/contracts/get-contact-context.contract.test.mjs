import test from 'node:test';
import assert from 'node:assert/strict';
import getContactContext, {
  buildMissingContactDetailsPrompt,
} from '../../supabase/functions/unified-chat/skills/context/get-contact-context.ts';

function emptyContactsSupabase() {
  const chain = {
    select() { return this; },
    eq() { return this; },
    or() { return this; },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
  };
  return {
    from(table) {
      assert.equal(table, 'contacts');
      return chain;
    },
  };
}

test('get_contact_context asks for full contact details when lookup misses by email', async () => {
  const result = await getContactContext.execute({
    args: { contact_name: 'buyer@example.com' },
    supabase: emptyContactsSupabase(),
    organizationId: 'org_1',
  });

  assert.equal(result.success, false);
  assert.equal(result.clarification_type, 'missing_contact_details');
  assert.deepEqual(result.missing, ['first_name', 'last_name', 'title']);
  assert.equal(result.proposed_contact.email, 'buyer@example.com');
  assert.match(result.message, /first name, last name, and title/i);
});

test('missing contact prompt asks to add a new person with CRM minimum fields', () => {
  const message = buildMissingContactDetailsPrompt('Jane Buyer');

  assert.match(message, /I can add them/);
  assert.match(message, /first name, last name, title, and email/i);
});
