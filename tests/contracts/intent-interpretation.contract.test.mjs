import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretMessageIntent,
  interpretMessageIntentHeuristic,
  normalizeEntityHint,
} from '../../supabase/functions/unified-chat/intent/interpret-message.mjs';

const FIXED_NOW = new Date('2026-03-08T12:00:00.000Z');

const EXTRACT_CASES = [
  {
    msg: 'what deals do I have for the next 5 months',
    payload: {
      intent: 'pipeline_window',
      entityType: null,
      entityHint: null,
      entityHintRaw: null,
      timeRangeHint: { kind: 'relative_months', raw: 'next 5 months', value: 5 },
      filters: { owner: 'current_user' },
      confidence: 0.91,
    },
    assert(contract) {
      assert.equal(contract.intent, 'pipeline_window');
      assert.equal(contract.classificationSource, 'model');
      assert.equal(contract.timeRangeHint?.kind, 'relative_months');
      assert.equal(contract.resolvedTimeRange?.start, '2026-03-08');
      assert.equal(contract.resolvedTimeRange?.end, '2026-08-08');
      assert.deepEqual(contract.filters, { owner: 'current_user', stages: ['open'] });
    },
  },
  {
    msg: 'whatve i got closing soon',
    payload: {
      intent: 'pipeline_window',
      entityType: null,
      entityHint: null,
      entityHintRaw: null,
      timeRangeHint: { kind: 'soon', raw: 'closing soon' },
      filters: { owner: 'current_user' },
      confidence: 0.83,
    },
    assert(contract) {
      assert.equal(contract.intent, 'pipeline_window');
      assert.equal(contract.resolvedTimeRange?.end, '2026-04-07');
    },
  },
  {
    msg: 'any big ones landing soon',
    payload: {
      intent: 'pipeline_window',
      entityType: null,
      entityHint: null,
      entityHintRaw: null,
      timeRangeHint: { kind: 'soon', raw: 'soon' },
      filters: null,
      confidence: 0.8,
    },
    assert(contract) {
      assert.equal(contract.intent, 'pipeline_window');
      assert.equal(contract.filters?.owner, 'current_user');
    },
  },
  {
    msg: "what's on my plate",
    payload: {
      intent: 'pipeline_summary',
      entityType: null,
      entityHint: null,
      entityHintRaw: null,
      timeRangeHint: null,
      filters: { owner: 'current_user' },
      confidence: 0.76,
    },
    assert(contract) {
      assert.equal(contract.intent, 'pipeline_summary');
      assert.equal(contract.filters?.owner, 'current_user');
      assert.deepEqual(contract.filters?.stages, ['open']);
    },
  },
  {
    msg: 'microsoft dael',
    payload: {
      intent: 'entity_lookup',
      entityType: 'deal',
      entityHintRaw: 'microsoft dael',
      entityHint: 'Microsoft',
      timeRangeHint: null,
      filters: null,
      confidence: 0.79,
    },
    assert(contract) {
      assert.equal(contract.intent, 'entity_lookup');
      assert.equal(contract.entityType, 'deal');
      assert.equal(contract.entityHint, 'Microsoft');
    },
  },
  {
    msg: 'coach me on home depot',
    payload: {
      intent: 'deal_analysis',
      entityType: 'deal',
      entityHintRaw: 'home depot',
      entityHint: 'home depot',
      timeRangeHint: null,
      filters: null,
      confidence: 0.93,
    },
    assert(contract) {
      assert.equal(contract.intent, 'deal_analysis');
      assert.equal(contract.executionPath, 'scoutpad');
      assert.equal(contract.forcePath, true);
      assert.equal(contract.entityHint, 'home depot');
    },
  },
  {
    msg: 'show me recent conversations with pepsi',
    payload: {
      intent: 'message_history',
      entityType: 'account',
      entityHintRaw: 'pepsi',
      entityHint: 'pepsi',
      timeRangeHint: null,
      filters: null,
      confidence: 0.81,
    },
    assert(contract) {
      assert.equal(contract.intent, 'message_history');
      assert.equal(contract.entityType, 'account');
      assert.equal(contract.entityHint, 'pepsi');
    },
  },
  {
    msg: 'draft a follow-up to sarah',
    payload: {
      intent: 'drafting',
      entityType: 'contact',
      entityHintRaw: 'sarah',
      entityHint: 'Sarah',
      timeRangeHint: null,
      filters: null,
      confidence: 0.84,
    },
    assert(contract) {
      assert.equal(contract.intent, 'drafting');
      assert.equal(contract.executionPath, 'standard');
      assert.equal(contract.entityType, 'contact');
    },
  },
  {
    msg: 'hello',
    payload: {
      intent: 'small_talk',
      entityType: null,
      entityHintRaw: null,
      entityHint: null,
      timeRangeHint: null,
      filters: null,
      confidence: 0.99,
    },
    assert(contract) {
      assert.equal(contract.intent, 'small_talk');
      assert.equal(contract.executionPath, 'none');
    },
  },
];

for (const entry of EXTRACT_CASES) {
  test(`interpretMessageIntent model fixture: ${entry.msg}`, async () => {
    const contract = await interpretMessageIntent(
      entry.msg,
      {},
      {
        now: FIXED_NOW,
        extractor: async () => entry.payload,
      },
    );
    entry.assert(contract);
  });
}

test('interpretMessageIntent falls back to heuristics when extractor throws', async () => {
  const contract = await interpretMessageIntent(
    'analyze the coca cola deal',
    {},
    {
      now: FIXED_NOW,
      extractor: async () => {
        throw new Error('boom');
      },
    },
  );

  assert.equal(contract.intent, 'deal_analysis');
  assert.equal(contract.classificationSource, 'heuristic');
  assert.equal(contract.forcePath, true);
});

test('interpretMessageIntent uses context when model leaves entity unresolved', async () => {
  const contract = await interpretMessageIntent(
    'how is this deal looking',
    {
      entityContext: {
        primaryEntity: { type: 'deal', id: 'deal-1', name: 'Acme Expansion' },
      },
    },
    {
      now: FIXED_NOW,
      extractor: async () => ({
        intent: 'deal_analysis',
        entityType: 'deal',
        entityHintRaw: null,
        entityHint: null,
        timeRangeHint: null,
        filters: null,
        confidence: 0.9,
      }),
    },
  );

  assert.equal(contract.intent, 'deal_analysis');
  assert.equal(contract.classificationSource, 'hybrid');
  assert.equal(contract.entityId, 'deal-1');
  assert.equal(contract.entityHint, 'Acme Expansion');
});

test('interpretMessageIntentHeuristic preserves current scoutpad routing behavior', () => {
  const contract = interpretMessageIntentHeuristic('can you run an analysis of the coca cola deal?');
  assert.equal(contract.intent, 'deal_analysis');
  assert.equal(contract.executionPath, 'scoutpad');
  assert.equal(contract.entityHint, 'coca cola');
});

test('interpretMessageIntentHeuristic classifies unresolved deictic deal references for clarification', () => {
  const contract = interpretMessageIntentHeuristic('this deal');
  assert.equal(contract.intent, 'entity_lookup');
  assert.equal(contract.entityType, 'deal');
  assert.equal(contract.entityId, null);
});

test('interpretMessageIntentHeuristic treats natural entity lookup phrasing as CRM lookup', () => {
  const contract = interpretMessageIntentHeuristic('tell me about technova');
  assert.equal(contract.intent, 'entity_lookup');
  assert.equal(contract.entityHint, 'technova');
});

test('interpretMessageIntentHeuristic treats conversational status asks as CRM lookup', () => {
  const contract = interpretMessageIntentHeuristic('hows it going with apex');
  assert.equal(contract.intent, 'entity_lookup');
  assert.equal(contract.entityHint, 'apex');
});

test('interpretMessageIntentHeuristic treats closable-quarter asks as pipeline window requests', () => {
  const contract = interpretMessageIntentHeuristic("what's closable this quarter", {}, { now: FIXED_NOW });
  assert.equal(contract.intent, 'pipeline_window');
  assert.equal(contract.resolvedTimeRange?.start, '2026-03-08');
  assert.equal(contract.resolvedTimeRange?.end, '2026-03-31');
});

test('interpretMessageIntentHeuristic treats send-a-note requests as drafting, not CRM mutation', () => {
  const contract = interpretMessageIntentHeuristic('send a note to buyer@example.com, its associated with northstar robotics');

  assert.equal(contract.intent, 'drafting');
  assert.equal(contract.executionPath, 'standard');
  assert.equal(contract.domains.includes('intelligence'), true);
});

const NORMALIZE_CASES = [
  { input: 'coca cola deal', options: { entityType: 'deal' }, expected: 'coca cola' },
  { input: 'the Acme Corp', options: { entityType: 'deal' }, expected: 'Acme Corp' },
  { input: 'Home Depot - Q1 2026', options: { entityType: 'deal' }, expected: 'Home Depot' },
  { input: '**Pepsi** - $500K', options: { entityType: 'deal' }, expected: 'Pepsi' },
  { input: 'coca cola opportunity', options: { entityType: 'deal' }, expected: 'coca cola' },
  { input: 'the deal', options: { entityType: 'deal' }, expected: null },
  { input: 'The Honest Company', options: { entityType: 'account' }, expected: 'The Honest Company' },
];

for (const { input, options, expected } of NORMALIZE_CASES) {
  test(`normalizeEntityHint: ${input}`, () => {
    assert.equal(normalizeEntityHint(input, options), expected);
  });
}
