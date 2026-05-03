import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicPendingUpdateAccountRenamePlan,
  buildDeterministicUpdateAccountRenamePlan,
  inferPendingAccountRenameFromHistory,
  buildDeterministicCreateAccountThenDealPlan,
  extractCreateDealArgsFromMessage,
  buildDeterministicCreateDealPlan,
  buildDeterministicCreateTaskPlan,
  buildDeterministicScheduleMeetingPlan,
  buildDeterministicPendingScheduleMeetingPlan,
  buildDeterministicCreateContactPlan,
  buildDeterministicDeleteDealPlan,
  buildDeterministicPendingDeleteDealPlan,
  inferPendingDeleteDealFromHistory,
  buildDeterministicPendingDealPlan,
  buildDeterministicPendingDealPlanFromHistory,
  buildDeterministicPendingDraftEmailPlan,
  buildDeterministicPendingSequencePlan,
  inferPendingDealDataFromHistory,
  repairScheduleMeetingArgsFromMessage,
} from '../../supabase/functions/unified-chat/intent/deterministic-mutation-planner.mjs';

test('extractCreateDealArgsFromMessage parses account and amount from create opportunity phrasing', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('please create an opportunity for acme for $20k MRR'),
    { account_name: 'acme', amount: 20000 },
  );
});

test('extractCreateDealArgsFromMessage handles amount-first create deal phrasing', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('new 100k deal with Acme Corp'),
    { account_name: 'Acme Corp', amount: 100000 },
  );
});

test('extractCreateDealArgsFromMessage recovers account after amount and location context', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('Create a 35k opportunity in DC for acme'),
    { account_name: 'acme', amount: 35000 },
  );

  assert.deepEqual(
    extractCreateDealArgsFromMessage('Create a 35k opportunity for acme in DC'),
    { account_name: 'acme', amount: 35000 },
  );

  assert.deepEqual(
    extractCreateDealArgsFromMessage('add a $70k deal with Example Labs in Hong Kong'),
    { account_name: 'Example Labs', amount: 70000 },
  );

  assert.deepEqual(
    extractCreateDealArgsFromMessage('Create a $35,000 opportunity for 35k in DC for acme'),
    { account_name: 'acme', amount: 35000 },
  );
});

test('extractCreateDealArgsFromMessage stops account names before initiative context', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('add a $42k opportunity for QA Pipeline Labs for a US expansion initiative, but I do not know the close date yet'),
    { account_name: 'QA Pipeline Labs', amount: 42000 },
  );
});

test('extractCreateDealArgsFromMessage still routes when the amount is omitted', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('create opportunity for Acme Corp'),
    { account_name: 'Acme Corp' },
  );
});

test('extractCreateDealArgsFromMessage keeps close date and contact when the user provides them up front', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('please create an opportunity for acme for $20k MRR closing 2026-05-20 with primary contact Pat'),
    {
      account_name: 'acme',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Pat',
    },
  );
});

test('extractCreateDealArgsFromMessage keeps contact name when the prompt includes a parenthesized contact email', () => {
  assert.deepEqual(
    extractCreateDealArgsFromMessage('please create an opportunity for acme for $20k MRR closing 2026-05-20 with primary contact Pat Rivera (pat.rivera@example.com)'),
    {
      account_name: 'acme',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Pat Rivera',
      contact_email: 'pat.rivera@example.com',
    },
  );
});

test('extractCreateDealArgsFromMessage does not treat amount-only targets as account names', () => {
  assert.equal(
    extractCreateDealArgsFromMessage('create an opportunity for 12.5k'),
    null,
  );
});

test('buildDeterministicCreateAccountThenDealPlan sequences create_account and create_deal for compound asks', () => {
  const plan = buildDeterministicCreateAccountThenDealPlan(
    'can you add an account for example.net as a new account, and an opportunity for 12.5k',
    {
      intent: 'crm_mutation',
      entityType: 'deal',
      domains: ['create'],
    },
    new Set(['create_account', 'create_deal', 'search_crm']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-create-account-deal');
  assert.equal(plan?.toolCalls?.length, 2);
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_account');
  assert.equal(plan?.toolCalls?.[1]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      name: 'example.net',
      domain: 'example.net',
      website: 'example.net',
    },
  );
  assert.deepEqual(
    JSON.parse(plan.toolCalls[1].function.arguments),
    {
      account_name: 'example.net',
      amount: 12500,
    },
  );
});

test('buildDeterministicUpdateAccountRenamePlan handles account rename asks', () => {
  const plan = buildDeterministicUpdateAccountRenamePlan(
    'can you change the 12.5k account name to example?',
    {
      intent: 'crm_mutation',
      entityType: 'account',
      domains: ['update'],
    },
    new Set(['update_account', 'search_crm']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-update-account-rename');
  assert.equal(plan?.toolCalls?.length, 1);
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'update_account');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: '12.5k',
      updates: { name: 'example' },
    },
  );
});

test('inferPendingAccountRenameFromHistory recovers rename intent after account-not-found clarification', () => {
  assert.deepEqual(
    inferPendingAccountRenameFromHistory([
      { role: 'user', content: 'can you change the 12.k account name to example?' },
      { role: 'assistant', content: `Action status:\n- update_account: I couldn't find an account matching "12k".` },
    ]),
    {
      pending_account_name: '12.k',
      target_name: 'example',
    },
  );
});

test('buildDeterministicPendingUpdateAccountRenamePlan resumes rename flow from terse follow-up', () => {
  const plan = buildDeterministicPendingUpdateAccountRenamePlan(
    "sorry, it's 12.5k",
    [
      { role: 'user', content: 'can you change the 12.k account name to example?' },
      { role: 'assistant', content: `Action status:\n- update_account: I couldn't find an account matching "12k".` },
    ],
    new Set(['update_account', 'search_crm']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-pending-update-account-rename');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'update_account');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: '12.5k',
      updates: { name: 'example' },
    },
  );
});

test('buildDeterministicCreateDealPlan returns a create_deal tool call for simple create requests', () => {
  const plan = buildDeterministicCreateDealPlan(
    'please create an opportunity for acme for $20k MRR',
    {
      intent: 'crm_mutation',
      entityType: 'deal',
      domains: ['create'],
    },
    new Set(['create_deal', 'search_crm']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-create-deal');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    { account_name: 'acme', amount: 20000 },
  );
});

test('buildDeterministicCreateDealPlan still routes when upstream intent classification drifts', () => {
  const plan = buildDeterministicCreateDealPlan(
    'please create an opportunity for acme for $20k MRR',
    {
      intent: 'entity_lookup',
      entityType: 'account',
      domains: ['context'],
    },
    new Set(['create_deal', 'search_crm']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    { account_name: 'acme', amount: 20000 },
  );
});

test('buildDeterministicCreateDealPlan stays off for non-create CRM lookups', () => {
  const plan = buildDeterministicCreateDealPlan(
    'tell me about acme',
    {
      intent: 'entity_lookup',
      entityType: 'account',
      domains: ['context'],
    },
    new Set(['create_deal', 'search_crm']),
  );

  assert.equal(plan, null);
});

test('buildDeterministicCreateDealPlan stays off for instructional create-deal asks', () => {
  const plan = buildDeterministicCreateDealPlan(
    'how do i create an opportunity for acme for $20k MRR',
    null,
    new Set(['create_deal', 'search_crm']),
  );

  assert.equal(plan, null);
});

test('buildDeterministicCreateTaskPlan routes explicit follow-up tasks away from draft_email', () => {
  const plan = buildDeterministicCreateTaskPlan(
    'create a follow-up task for QA Chat Smoke Test due tomorrow to send a pilot recap from ETH Denver',
    {
      intent: 'drafting',
      entityType: null,
      domains: ['create', 'intelligence'],
    },
    new Set(['create_task', 'draft_email']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-create-task');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_task');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      title: 'Send a pilot recap from ETH Denver',
      due_date: 'tomorrow',
      account_name: 'QA Chat Smoke Test',
    },
  );
});

test('buildDeterministicScheduleMeetingPlan routes compound scheduling asks to schedule_meeting', () => {
  const plan = buildDeterministicScheduleMeetingPlan(
    'Schedule call for acme - $20K. Check my calendar availability and help me send a scheduling email to the contact.',
    {
      intent: 'crm_mutation',
      entityType: 'deal',
      domains: ['scheduling', 'email'],
    },
    new Set(['schedule_meeting', 'check_availability', 'send_scheduling_email']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-schedule-meeting');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'schedule_meeting');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
    },
  );
});

test('buildDeterministicScheduleMeetingPlan carries contact email from initial scheduling asks', () => {
  const plan = buildDeterministicScheduleMeetingPlan(
    'Schedule call for acme - $20K with qa.schedule.person.430@example.com. Check my calendar availability and help me send a scheduling email.',
    {
      intent: 'crm_mutation',
      entityType: 'deal',
      domains: ['scheduling', 'email'],
    },
    new Set(['schedule_meeting', 'check_availability', 'send_scheduling_email']),
  );

  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'schedule_meeting');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      contact_email: 'qa.schedule.person.430@example.com',
      deal_name: 'acme - $20K',
      account_name: 'acme',
    },
  );
});

test('repairScheduleMeetingArgsFromMessage rehydrates contact email before scheduling execution', () => {
  const repaired = repairScheduleMeetingArgsFromMessage(
    {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
    },
    'Schedule call for acme - $20K with qa.schedule.person.501@example.com. Check my calendar availability and help me send a scheduling email.',
  );

  assert.deepEqual(repaired, {
    meeting_type: 'call',
    deal_name: 'acme - $20K',
    account_name: 'acme',
    contact_email: 'qa.schedule.person.501@example.com',
  });
});

test('repairScheduleMeetingArgsFromMessage rehydrates required new-contact details', () => {
  const repaired = repairScheduleMeetingArgsFromMessage(
    {
      meeting_type: 'call',
      account_name: 'acme',
      contact_email: 'pat.rivera@example.com',
    },
    'Use Pat Rivera, title VP Sales, email pat.rivera@example.com',
  );

  assert.deepEqual(repaired, {
    meeting_type: 'call',
    account_name: 'acme',
    contact_email: 'pat.rivera@example.com',
    contact_first_name: 'Pat',
    contact_last_name: 'Rivera',
    contact_title: 'VP Sales',
    contact_name: 'Pat Rivera',
  });
});

test('buildDeterministicScheduleMeetingPlan supports scheduling directly with an email address', () => {
  const plan = buildDeterministicScheduleMeetingPlan(
    'Schedule a call with qa.direct.schedule@example.com tomorrow afternoon.',
    {
      intent: 'crm_mutation',
      entityType: 'contact',
      domains: ['scheduling'],
    },
    new Set(['schedule_meeting']),
  );

  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'schedule_meeting');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      contact_email: 'qa.direct.schedule@example.com',
      proposed_date: 'tomorrow',
      time_preference: 'afternoon',
    },
  );
});

test('buildDeterministicPendingScheduleMeetingPlan resumes confirmed scheduling previews', () => {
  const plan = buildDeterministicPendingScheduleMeetingPlan(
    'yes',
    {
      type: 'schedule_meeting_confirmation',
      args: {
        meeting_type: 'call',
        deal_name: 'acme - $20K',
        account_name: 'acme',
      },
      preview: {
        available_slots: [
          { start: '2026-04-28T14:00:00.000Z', label: 'Tue Apr 28, 10:00 AM' },
        ],
      },
    },
    new Set(['schedule_meeting']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-pending-schedule-meeting');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'schedule_meeting');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
      confirmed: true,
    },
  );
});

test('buildDeterministicPendingScheduleMeetingPlan carries selected slot into confirmation', () => {
  const plan = buildDeterministicPendingScheduleMeetingPlan(
    'Use slot 2 and send the scheduling email.',
    {
      type: 'schedule_meeting_confirmation',
      args: {
        meeting_type: 'call',
        deal_name: 'acme - $20K',
        account_name: 'acme',
      },
      preview: {
        available_slots: [
          { start: '2026-04-28T14:00:00.000Z', label: 'Tue Apr 28, 10:00 AM' },
          { start: '2026-04-28T18:00:00.000Z', label: 'Tue Apr 28, 2:00 PM' },
        ],
      },
    },
    new Set(['schedule_meeting']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
      confirmed: true,
      selected_start_iso: '2026-04-28T18:00:00.000Z',
    },
  );
});

test('buildDeterministicPendingScheduleMeetingPlan does not resend canceled scheduling previews', () => {
  const plan = buildDeterministicPendingScheduleMeetingPlan(
    'Cancel the scheduling email.',
    {
      type: 'schedule_meeting_confirmation',
      args: {
        meeting_type: 'call',
        deal_name: 'acme - $20K',
        account_name: 'acme',
      },
      preview: {
        available_slots: [
          { start: '2026-04-28T14:00:00.000Z', label: 'Tue Apr 28, 10:00 AM' },
        ],
      },
    },
    new Set(['schedule_meeting']),
  );

  assert.equal(plan, null);
});

test('buildDeterministicPendingScheduleMeetingPlan resumes when user supplies missing contact email', () => {
  const plan = buildDeterministicPendingScheduleMeetingPlan(
    'Use pat.rivera@example.com',
    {
      type: 'schedule_meeting_missing_contact_email',
      args: {
        meeting_type: 'call',
        deal_name: 'acme - $20K',
        account_name: 'acme',
      },
      contact_id: 'contact-123',
      contact_name: 'Pat Rivera',
    },
    new Set(['schedule_meeting']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-pending-schedule-contact-email');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'schedule_meeting');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
      contact_email: 'pat.rivera@example.com',
      contact_id: 'contact-123',
      contact_name: 'Pat Rivera',
    },
  );
});

test('buildDeterministicPendingScheduleMeetingPlan captures new contact minimum details', () => {
  const plan = buildDeterministicPendingScheduleMeetingPlan(
    'Pat Rivera, VP Sales, pat.rivera@example.com',
    {
      type: 'schedule_meeting_missing_contact_details',
      args: {
        meeting_type: 'call',
        deal_name: 'acme - $20K',
        account_name: 'acme',
      },
    },
    new Set(['schedule_meeting']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-pending-schedule-contact-details');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'schedule_meeting');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
      contact_email: 'pat.rivera@example.com',
      contact_first_name: 'Pat',
      contact_last_name: 'Rivera',
      contact_title: 'VP Sales',
    },
  );
});

test('buildDeterministicCreateContactPlan extracts contact, account, email, and title', () => {
  const plan = buildDeterministicCreateContactPlan(
    'add Pat QA as a contact for QA Chat Smoke Test with email pat.qa@example.com and title CTO',
    {
      intent: 'crm_mutation',
      entityType: 'contact',
      domains: ['create'],
    },
    new Set(['create_contact']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_contact');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      name: 'Pat QA',
      email: 'pat.qa@example.com',
      company: 'QA Chat Smoke Test',
      title: 'CTO',
    },
  );
});

test('buildDeterministicDeleteDealPlan asks delete_deal to confirm rather than closing lost', () => {
  const plan = buildDeterministicDeleteDealPlan(
    'delete the acme deal',
    {
      intent: 'crm_mutation',
      entityType: 'deal',
      domains: ['update'],
    },
    new Set(['delete_deal', 'update_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'delete_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    { deal_name: 'acme' },
  );
});

test('buildDeterministicPendingDeleteDealPlan resumes confirmed destructive deletion', () => {
  const history = [
    { role: 'user', content: 'delete the acme deal' },
    { role: 'assistant', content: `Action status:\n- delete_deal: You're asking to permanently delete **Acme Corp - $20K**. Reply "yes" to confirm deletion.` },
  ];

  assert.deepEqual(inferPendingDeleteDealFromHistory(history), { deal_name: 'Acme Corp - $20K' });

  const plan = buildDeterministicPendingDeleteDealPlan(
    'yes',
    history,
    new Set(['delete_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'delete_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    { deal_name: 'Acme Corp - $20K', confirmed: true },
  );
});

test('buildDeterministicPendingDealPlan resumes pending deal creation from follow-up details', () => {
  const plan = buildDeterministicPendingDealPlan(
    'close date is 5/20 and primary contact name is eugene',
    {
      account_name: 'Acme Corp',
      amount: 20000,
      stage: 'prospecting',
    },
    new Set(['create_deal', 'get_deal_context']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'Acme Corp',
      amount: 20000,
      stage: 'prospecting',
      close_date: '5/20',
      contact_name: 'eugene',
    },
  );
});

test('buildDeterministicPendingDealPlan extracts casual follow-up details for pending deals', () => {
  const plan = buildDeterministicPendingDealPlan(
    '5/20 and Pat',
    {
      account_name: 'Acme Corp',
      amount: 20000,
      stage: 'prospecting',
    },
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'Acme Corp',
      amount: 20000,
      stage: 'prospecting',
      close_date: '5/20',
      contact_name: 'Pat',
    },
  );
});

test('buildDeterministicPendingDealPlan handles pronoun contact and middle-of-month date follow-ups', () => {
  const plan = buildDeterministicPendingDealPlan(
    'its Pat and close date is middle of may',
    {
      account_name: 'Acme Corp',
      amount: 35000,
      stage: 'prospecting',
    },
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'Acme Corp',
      amount: 35000,
      stage: 'prospecting',
      close_date: 'middle of may',
      contact_name: 'Pat',
    },
  );
});

test('buildDeterministicPendingDealPlan handles use-as-contact follow-up with month-day date', () => {
  const plan = buildDeterministicPendingDealPlan(
    'Use Ava Stone as the contact and Aug 30 as the close date.',
    {
      account_name: 'Example Cloud',
      amount: 6000,
      stage: 'prospecting',
    },
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'Example Cloud',
      amount: 6000,
      stage: 'prospecting',
      close_date: 'Aug 30',
      contact_name: 'Ava Stone',
    },
  );
});

test('buildDeterministicPendingDealPlan refreshes contact details during contact-resolution follow-ups', () => {
  const plan = buildDeterministicPendingDealPlan(
    'eugene peresvyetov pat.rivera@example.com',
    {
      account_name: 'Acme Corp',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Pat',
      confirmation_type: 'contact_resolution',
    },
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'Acme Corp',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'eugene peresvyetov',
      contact_email: 'pat.rivera@example.com',
    },
  );
});

test('buildDeterministicPendingSequencePlan resumes contact clarification for sequence enrollment', () => {
  const plan = buildDeterministicPendingSequencePlan(
    'Pat Rivera pat.rivera@example.com',
    {
      action: 'enroll',
      sequence_id: 'seq_1',
      sequence_name: 'Follow-up Sequence',
      contact_name: 'Pat',
      confirmation_type: 'contact_resolution',
    },
    new Set(['manage_sequence']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'manage_sequence');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      action: 'enroll',
      sequence_id: 'seq_1',
      sequence_name: 'Follow-up Sequence',
      contact_name: 'Pat Rivera',
      contact_email: 'pat.rivera@example.com',
    },
  );
});

test('inferPendingDealDataFromHistory recovers pending deal context from recent chat history', () => {
  assert.deepEqual(
    inferPendingDealDataFromHistory([
      { role: 'user', content: 'please create an opportunity for acme for $20k MRR' },
      { role: 'assistant', content: 'create_deal: Got it — $20K deal with acme. Before I create it, I need:\n• expected close date\n• primary contact name' },
    ]),
    {
      account_name: 'acme',
      amount: 20000,
      close_date: null,
      contact_name: null,
      contact_email: null,
    },
  );
});

test('buildDeterministicPendingDealPlanFromHistory resumes casual follow-ups without persisted pending state', () => {
  const plan = buildDeterministicPendingDealPlanFromHistory(
    '5/20 and Pat',
    [
      { role: 'user', content: 'please create an opportunity for acme for $20k MRR' },
      { role: 'assistant', content: 'create_deal: Got it — $20K deal with acme. Before I create it, I need:\n• expected close date\n• primary contact name' },
    ],
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'acme',
      amount: 20000,
      close_date: '5/20',
      contact_name: 'Pat',
    },
  );
});

test('buildDeterministicPendingDealPlanFromHistory resumes current create-deal clarification wording', () => {
  const history = [
    { role: 'user', content: 'Create a $35,000 opportunity for 35k in DC for acme' },
    { role: 'assistant', content: 'Action status:\n- create_deal: Got it — $35,000 opportunity for acme. Before I create it, I need the expected close date so this is forecastable. If you know the primary contact, include that too and I will attach it.' },
  ];

  assert.deepEqual(
    inferPendingDealDataFromHistory(history),
    {
      account_name: 'acme',
      amount: 35000,
      close_date: null,
      contact_name: null,
      contact_email: null,
    },
  );

  const plan = buildDeterministicPendingDealPlanFromHistory(
    'its Pat and close date is middle of may',
    history,
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'acme',
      amount: 35000,
      close_date: 'middle of may',
      contact_name: 'Pat',
    },
  );
});

test('buildDeterministicPendingDealPlanFromHistory resumes alternate close-date clarification wording', () => {
  const history = [
    { role: 'user', content: 'Create a 35k opportunity for acme in DC' },
    { role: 'assistant', content: 'Action status:\n- create_deal: I still need the expected close date before I can create that. If you know the primary contact, include it too.' },
  ];

  assert.deepEqual(
    inferPendingDealDataFromHistory(history),
    {
      account_name: 'acme',
      amount: 35000,
      close_date: null,
      contact_name: null,
      contact_email: null,
    },
  );

  const plan = buildDeterministicPendingDealPlanFromHistory(
    'Pat, May 15',
    history,
    new Set(['create_deal']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'create_deal');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      account_name: 'acme',
      amount: 35000,
      close_date: 'May 15',
      contact_name: 'Pat',
    },
  );
});

test('buildDeterministicPendingDraftEmailPlan resumes missing-recipient draft follow-ups', () => {
  const plan = buildDeterministicPendingDraftEmailPlan(
    'Use QA Pipeline Reviewer. Mention timeline, budget owner, and next technical validation call.',
    [
      { role: 'user', content: 'Draft an email for Example Labs - $35K with next steps' },
      { role: 'assistant', content: 'Action status:\n- draft_email: I can draft the email for Example Labs - $35K, but I need a recipient email before it becomes actionable. Who should this go to?' },
    ],
    new Set(['draft_email']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-pending-draft-email');
  assert.equal(plan?.toolCalls?.[0]?.function?.name, 'draft_email');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      deal_name: 'Example Labs - $35K',
      account_name: 'Example Labs',
      email_type: 'follow_up',
      context: 'next steps; timeline, budget owner, and next technical validation call',
      recipient_name: 'QA Pipeline Reviewer',
    },
  );
});

test('buildDeterministicPendingDraftEmailPlan resumes recipient email follow-ups with deal context', () => {
  const plan = buildDeterministicPendingDraftEmailPlan(
    'Send it to QA Pipeline Reviewer at qa.pipeline.reviewer@example.com. Mention confirming next steps and implementation timing.',
    [
      { role: 'user', content: 'Draft a next step email for Example Labs - $35K' },
      { role: 'assistant', content: 'Action status:\n- draft_email: I can draft the email for Example Labs, but I need a recipient email before it becomes actionable. Who should this go to? You can reply with a contact name/email and any notes or context to include.' },
    ],
    new Set(['draft_email']),
  );

  assert.equal(plan?.provider, 'deterministic');
  assert.equal(plan?.model, 'deterministic-pending-draft-email');
  assert.deepEqual(
    JSON.parse(plan.toolCalls[0].function.arguments),
    {
      deal_name: 'Example Labs - $35K',
      account_name: 'Example Labs',
      email_type: 'follow_up',
      context: 'next steps; confirming next steps and implementation timing',
      recipient_name: 'QA Pipeline Reviewer',
      recipient_email: 'qa.pipeline.reviewer@example.com',
    },
  );
});
