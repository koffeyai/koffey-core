import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompoundCreateSummary,
  buildCompoundCreateToolCalls,
} from '../../supabase/functions/unified-chat/compound-create-router.mjs';

test('compound create router emits account, contact, then deal tool calls', () => {
  const calls = buildCompoundCreateToolCalls(
    'For QA chat testing only, create an account named QA Chat Compound Account, create a contact named QA Chat Contact with email qa.chat@example.com at that account, and create a $25,000 deal named QA Chat Compound Deal for that account in prospecting with expected close date 2026-06-30 and primary contact QA Chat Contact. Do not send emails or calendar invites.',
    new Set(['create_account', 'create_contact', 'create_deal']),
  );

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.function.name), ['create_account', 'create_contact', 'create_deal']);

  assert.deepEqual(JSON.parse(calls[0].function.arguments), {
    name: 'QA Chat Compound Account',
    associated_contacts: 'QA Chat Contact <qa.chat@example.com>',
  });
  assert.deepEqual(JSON.parse(calls[1].function.arguments), {
    name: 'QA Chat Contact',
    email: 'qa.chat@example.com',
    company: 'QA Chat Compound Account',
    confirmed: true,
  });
  assert.deepEqual(JSON.parse(calls[2].function.arguments), {
    account_name: 'QA Chat Compound Account',
    amount: 25000,
    name: 'QA Chat Compound Deal',
    stage: 'prospecting',
    close_date: '2026-06-30',
    contact_name: 'QA Chat Contact',
    contact_email: 'qa.chat@example.com',
  });
});

test('compound create router handles natural account/contact/opportunity phrasing with notes', () => {
  const calls = buildCompoundCreateToolCalls(
    'QA compound test: create an account named QA Pipeline Labs with website qapipeline.example, add contact Quinn Tester at quinn.tester@example.com, create an $18k opportunity closing 2026-07-31, add a note saying budget approved, security review pending, champion asked for ROI proof, and then act like my pipeline-review manager.',
    new Set(['create_account', 'create_contact', 'create_deal']),
  );

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.function.name), ['create_account', 'create_contact', 'create_deal']);
  assert.deepEqual(JSON.parse(calls[0].function.arguments), {
    name: 'QA Pipeline Labs',
    website: 'qapipeline.example',
    domain: 'qapipeline.example',
    associated_contacts: 'Quinn Tester <quinn.tester@example.com>',
  });
  assert.deepEqual(JSON.parse(calls[1].function.arguments), {
    name: 'Quinn Tester',
    email: 'quinn.tester@example.com',
    company: 'QA Pipeline Labs',
    confirmed: true,
  });
  assert.deepEqual(JSON.parse(calls[2].function.arguments), {
    account_name: 'QA Pipeline Labs',
    amount: 18000,
    stage: 'prospecting',
    close_date: '2026-07-31',
    contact_name: 'Quinn Tester',
    contact_email: 'quinn.tester@example.com',
    notes: 'budget approved, security review pending, champion asked for ROI proof',
  });
});

test('compound create router declines incomplete deal requests', () => {
  const calls = buildCompoundCreateToolCalls(
    'Create an account named QA Co, create a contact named QA Person with email qa@example.com, and create a $25,000 deal named QA Deal.',
    new Set(['create_account', 'create_contact', 'create_deal']),
  );

  assert.equal(calls, null);
});

test('compound create summary is human-readable and specific', () => {
  const summary = buildCompoundCreateSummary([
    { tool: 'create_account', result: { id: 'a1', name: 'QA Account' } },
    { tool: 'create_contact', result: { id: 'c1', full_name: 'QA Contact' } },
    { tool: 'create_deal', result: { id: 'd1', name: 'QA Deal' } },
  ]);

  assert.equal(summary, 'Created account "QA Account", contact "QA Contact", and deal "QA Deal".');
});
