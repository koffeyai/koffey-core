import test from 'node:test';
import assert from 'node:assert/strict';

import draftEmail from '../../supabase/functions/unified-chat/skills/intelligence/draft-email.ts';

class QueryMock {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = {};
  }

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  or(value) {
    this.filters.or = value;
    return this;
  }
  ilike(field, value) {
    this.filters[field] = value;
    return this;
  }
  eq(field, value) {
    this.filters[field] = value;
    return this;
  }

  result() {
    if (this.table === 'deals') return { data: this.state.deal, error: null };
    if (this.table === 'contacts') {
      const isAccountContactLookup = String(this.filters.or || '').includes('company.ilike')
        || String(this.filters.or || '').includes('account_id.eq');
      return { data: isAccountContactLookup ? this.state.accountContacts : this.state.contact, error: null };
    }
    if (this.table === 'accounts') return { data: this.state.account, error: null };
    if (this.table === 'deal_contacts') return { data: this.state.dealContacts, error: null };
    if (this.table === 'activities') return { data: this.state.activities, error: null };
    return { data: null, error: null };
  }

  single() {
    return Promise.resolve(this.result());
  }

  then(resolve, reject) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

function buildSupabaseMock(state) {
  return {
    from(table) {
      return new QueryMock(table, state);
    },
  };
}

test('draft_email returns a complete structured draft for the chat approval card', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-1',
        name: 'Example Labs - $35K',
        stage: 'prospecting',
        amount: 35000,
        expected_close_date: '2026-07-21',
        key_use_case: 'web3 infrastructure expansion',
        accounts: { name: 'Example Labs' },
      },
      contact: {
        id: 'contact-1',
        full_name: 'Ava Stone',
        email: 'ava@example.com',
        company: 'Example Labs',
      },
      activities: [
        {
          id: 'activity-1',
          title: 'Added deal: Example Labs - $35K',
          description: 'Created from chat',
        },
      ],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      recipient_name: 'Ava Stone',
      email_type: 'follow_up',
      context: 'confirm technical stakeholders and next steps',
      deal_name: 'Example Labs',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.isDraft, true);
  assert.equal(result.recipientName, 'Ava Stone');
  assert.equal(result.recipientEmail, 'ava@example.com');
  assert.match(result.subject, /Example Labs/);
  assert.match(result.message, /Hi Ava,/);
  assert.match(result.message, /\$35,000/);
  assert.match(result.message, /prospecting/);
  assert.match(result.message, /web3 infrastructure expansion/);
  assert.deepEqual(result.dealContext, {
    id: 'deal-1',
    name: 'Example Labs - $35K',
    stage: 'prospecting',
  });
});

test('draft_email uses associated deal contact when the prompt omits a recipient', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-2',
        name: 'Swarm QA Systems - $9.5K',
        stage: 'discovery',
        amount: 9500,
        expected_close_date: '2026-06-15',
        accounts: { name: 'Swarm QA Systems' },
      },
      dealContacts: [
        {
          contact_id: 'contact-2',
          role: 'Champion',
          is_primary: true,
          contact: {
            id: 'contact-2',
            full_name: 'Quinn Tester',
            email: 'quinn@example.com',
            company: 'Swarm QA Systems',
          },
        },
      ],
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      email_type: 'follow_up',
      context: 'recap pilot success criteria',
      deal_name: 'Swarm QA Systems',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.isDraft, true);
  assert.equal(result.recipientName, 'Quinn Tester');
  assert.equal(result.recipientEmail, 'quinn@example.com');
  assert.match(result.message, /Hi Quinn,/);
});

test('draft_email asks for recipient details before creating an unsendable draft', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-3',
        name: 'Example Labs - $35K',
        stage: 'prospecting',
        amount: 35000,
        expected_close_date: '2026-07-23',
        accounts: { name: 'Example Labs' },
      },
      dealContacts: [],
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      email_type: 'follow_up',
      context: 'advance the deal this week',
      deal_name: 'Example Labs',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.equal(result.isDraft, undefined);
  assert.match(result.message, /need a recipient email/i);
  assert.match(result.follow_up_prompt, /recipient name\/email/i);
});

test('draft_email can use account contacts when no deal stakeholder is linked', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-4',
        name: 'Example Labs - $35K',
        stage: 'prospecting',
        amount: 35000,
        expected_close_date: '2026-07-23',
        accounts: { id: 'account-1', name: 'Example Labs' },
      },
      dealContacts: [],
      accountContacts: [
        {
          id: 'contact-4',
          full_name: 'QA Pipeline Reviewer',
          email: 'qa.pipeline.reviewer@example.com',
          company: 'Example Labs',
        },
      ],
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      email_type: 'follow_up',
      context: 'Mention timeline, budget owner, and next technical validation call.',
      deal_name: 'Advance Example Labs - $35K this week',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.recipientName, 'QA Pipeline Reviewer');
  assert.equal(result.recipientEmail, 'qa.pipeline.reviewer@example.com');
  assert.match(result.message, /aligned on timeline, budget owner, and next technical validation call/i);
  assert.doesNotMatch(result.message, /Mention timeline/i);
});
