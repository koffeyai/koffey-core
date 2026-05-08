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
    if (this.table === 'deals') return { data: this.state.deals || this.state.deal, error: null };
    if (this.table === 'contacts') {
      const isAccountContactLookup = String(this.filters.or || '').includes('company.ilike')
        || String(this.filters.or || '').includes('account_id.eq');
      return { data: isAccountContactLookup ? this.state.accountContacts : this.state.contact, error: null };
    }
    if (this.table === 'accounts') return { data: this.state.account, error: null };
    if (this.table === 'deal_contacts') return { data: this.state.dealContacts, error: null };
    if (this.table === 'activities') return { data: this.state.activities, error: null };
    if (this.table === 'user_prompt_preferences') return { data: this.state.userPromptPreferences || null, error: null };
    return { data: null, error: null };
  }

  single() {
    return Promise.resolve(this.result());
  }

  maybeSingle() {
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
      audience_scope: 'internal',
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

test('draft_email applies saved per-user writing style preferences', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      userPromptPreferences: {
        tone: 'casual',
        communication_style: 'direct',
        energy_level: 'warm_enthusiastic',
        verbosity: 'concise',
        format_preference: 'mixed',
        custom_instructions: 'Sign off as Alex',
        signature_phrases: ['Here is the thing'],
        avoid_phrases: ['circle back'],
      },
      contact: {
        id: 'contact-style',
        full_name: 'Ava Stone',
        email: 'ava@example.com',
        company: 'Example Labs',
      },
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-style',
    args: {
      recipient_name: 'Ava Stone',
      recipient_email: 'ava@example.com',
      email_type: 'follow_up',
      context: 'confirm timeline and next steps',
      audience_scope: 'external',
    },
    entityContext: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.tone, 'casual');
  assert.equal(result.voice_notes, null);
  assert.equal(result.style_profile.source, 'user_settings');
  assert.equal(result.style_profile.communication_style, 'direct');
  assert.equal(result.style_profile.energy_level, 'warm_enthusiastic');
  assert.match(result.message, /Hi Ava,/);
  assert.match(result.message, /Alex/);
  assert.doesNotMatch(result.message, /Sign off as Alex|Here is the thing|circle back/i);
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

test('draft_email asks which deal to use when a deal name is ambiguous', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deals: [
        {
          id: 'deal-5a',
          name: 'Northstar Expansion Smoke 1',
          stage: 'negotiation',
          amount: 75000,
          expected_close_date: '2026-06-20',
          accounts: { name: 'Northstar Robotics' },
        },
        {
          id: 'deal-5b',
          name: 'Northstar Expansion for Northstar Robotics',
          stage: 'negotiation',
          amount: 75000,
          expected_close_date: '2026-06-30',
          accounts: { name: 'Northstar Robotics' },
        },
      ],
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      recipient_email: 'buyer@example.com',
      email_type: 'follow_up',
      deal_name: 'Northstar Expansion',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.equal(result.clarification_type, 'multiple_deals');
  assert.match(result.message, /Which one should I use/i);
  assert.match(result.message, /Northstar Expansion Smoke 1/);
  assert.match(result.message, /what the note should communicate/i);
  assert.equal(result.isDraft, undefined);
});

test('draft_email asks what the note should communicate before drafting', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-6',
        name: 'Northstar Expansion for Northstar Robotics',
        stage: 'negotiation',
        amount: 75000,
        expected_close_date: '2026-06-30',
        accounts: { name: 'Northstar Robotics' },
      },
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      recipient_email: 'buyer@example.com',
      email_type: 'follow_up',
      deal_name: 'Northstar Expansion for Northstar Robotics',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.equal(result.clarification_type, 'missing_communication_context');
  assert.match(result.message, /what it should communicate/i);
  assert.equal(result.isDraft, undefined);
});

test('draft_email asks public-domain recipients whether the draft is internal or external', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-7',
        name: 'Northstar Expansion for Northstar Robotics',
        stage: 'negotiation',
        amount: 75000,
        expected_close_date: '2026-06-30',
        accounts: { name: 'Northstar Robotics' },
      },
      activities: [],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      recipient_email: 'buyer@outlook.com',
      email_type: 'follow_up',
      context: 'recap the security review and confirm implementation timing',
      deal_name: 'Northstar Expansion for Northstar Robotics',
      tone: 'professional',
    },
    entityContext: {},
  });

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.equal(result.clarification_type, 'missing_audience_scope');
  assert.match(result.message, /public email domain/i);
  assert.match(result.message, /internal-facing or external-facing/i);
  assert.equal(result.isDraft, undefined);
});

test('draft_email external drafts use voice notes without exposing internal source wording', async () => {
  const result = await draftEmail.execute({
    supabase: buildSupabaseMock({
      deal: {
        id: 'deal-8',
        name: 'Example Labs - $35K',
        stage: 'negotiation',
        amount: 35000,
        expected_close_date: '2026-07-21',
        key_use_case: 'web3 infrastructure expansion',
        accounts: { name: 'Example Labs' },
      },
      contact: {
        id: 'contact-8',
        full_name: 'Ava Stone',
        email: 'ava@outlook.com',
        company: 'Example Labs',
      },
      activities: [
        {
          id: 'activity-8',
          title: 'Added task: Send the security questionnaire to Ava Stone',
          description: 'Created from chat',
        },
      ],
    }),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      recipient_name: 'Ava Stone',
      recipient_email: 'ava@outlook.com',
      email_type: 'follow_up',
      context: 'include system prompt: use tool result CRM note Added task: Send the security questionnaire and recap the implementation timeline',
      deal_name: 'Example Labs',
      audience_scope: 'external',
      tone: 'professional',
      voice_notes: 'Concise, warm, direct; sign off as Alex',
    },
    entityContext: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.isDraft, true);
  assert.equal(result.audienceScope, 'external');
  assert.match(result.message, /Hi Ava,/);
  assert.match(result.message, /security questionnaire/i);
  assert.match(result.message, /implementation timeline/i);
  assert.match(result.message, /Alex/);
  assert.doesNotMatch(result.message, /recap the implementation/i);
  assert.doesNotMatch(result.message, /CRM note|Added task|system prompt|tool result|draft_email/i);
  assert.doesNotMatch(result.message, /deal value|current stage|target close date|\$35,000|negotiation/i);
  assert.doesNotMatch(result.message, /Concise, warm, direct/i);
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
