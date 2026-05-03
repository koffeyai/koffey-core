import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretMessageIntent } from '../../supabase/functions/unified-chat/intent/interpret-message.mjs';
import { resolveRetrievalPlan } from '../../supabase/functions/unified-chat/intent/intent-router.mjs';

const NOW = new Date('2026-03-08T12:00:00.000Z');

const CORPUS = [
  {
    input: 'what deals do I have for the next 5 months',
    payload: { intent: 'pipeline_window', entityType: null, entityHint: null, entityHintRaw: null, timeRangeHint: { kind: 'relative_months', raw: 'next 5 months', value: 5 }, filters: { owner: 'current_user' }, confidence: 0.91 },
    expected: { intent: 'pipeline_window', path: 'pipeline_context', timeRangeKind: 'relative_months' },
  },
  {
    input: 'whatve i got closing soon',
    payload: { intent: 'pipeline_window', entityType: null, entityHint: null, entityHintRaw: null, timeRangeHint: { kind: 'soon', raw: 'closing soon' }, filters: { owner: 'current_user' }, confidence: 0.82 },
    expected: { intent: 'pipeline_window', path: 'pipeline_context', timeRangeKind: 'soon' },
  },
  {
    input: 'any big ones landing soon',
    payload: { intent: 'pipeline_window', entityType: null, entityHint: null, entityHintRaw: null, timeRangeHint: { kind: 'soon', raw: 'landing soon' }, filters: null, confidence: 0.8 },
    expected: { intent: 'pipeline_window', path: 'pipeline_context', timeRangeKind: 'soon' },
  },
  {
    input: 'what\'s on my plate',
    payload: { intent: 'pipeline_summary', entityType: null, entityHint: null, entityHintRaw: null, timeRangeHint: null, filters: { owner: 'current_user' }, confidence: 0.76 },
    expected: { intent: 'pipeline_summary', path: 'pipeline_context' },
  },
  {
    input: 'microsoft dael',
    payload: { intent: 'entity_lookup', entityType: 'deal', entityHintRaw: 'microsoft dael', entityHint: 'Microsoft', timeRangeHint: null, filters: null, confidence: 0.79 },
    expected: { intent: 'entity_lookup', path: 'deal_context' },
  },
  {
    input: 'coach me on home depot',
    payload: { intent: 'deal_analysis', entityType: 'deal', entityHintRaw: 'home depot', entityHint: 'home depot', timeRangeHint: null, filters: null, confidence: 0.93 },
    expected: { intent: 'deal_analysis', path: 'scoutpad' },
  },
  {
    input: 'show me recent conversations with pepsi',
    payload: { intent: 'message_history', entityType: 'account', entityHintRaw: 'pepsi', entityHint: 'pepsi', timeRangeHint: null, filters: null, confidence: 0.81 },
    expected: { intent: 'message_history', path: 'entity_messages' },
  },
  {
    input: 'tell me about technova',
    payload: { intent: 'entity_lookup', entityType: null, entityHintRaw: 'technova', entityHint: 'technova', timeRangeHint: null, filters: null, confidence: 0.8 },
    expected: { intent: 'entity_lookup', path: 'planner_fallback' },
  },
  {
    input: 'hows it going with apex',
    payload: { intent: 'entity_lookup', entityType: null, entityHintRaw: 'apex', entityHint: 'apex', timeRangeHint: null, filters: null, confidence: 0.8 },
    expected: { intent: 'entity_lookup', path: 'planner_fallback' },
  },
  {
    input: 'show me recent convos with pepsi',
    payload: { intent: 'message_history', entityType: 'account', entityHintRaw: 'pepsi', entityHint: 'pepsi', timeRangeHint: null, filters: null, confidence: 0.81 },
    expected: { intent: 'message_history', path: 'entity_messages' },
  },
  {
    input: 'draft a follow-up to sarah',
    payload: { intent: 'drafting', entityType: 'contact', entityHintRaw: 'sarah', entityHint: 'Sarah', timeRangeHint: null, filters: null, confidence: 0.84 },
    expected: { intent: 'drafting', path: 'draft_with_context' },
  },
  {
    input: 'hello',
    payload: { intent: 'small_talk', entityType: null, entityHint: null, entityHintRaw: null, timeRangeHint: null, filters: null, confidence: 0.99 },
    expected: { intent: 'small_talk', path: 'none' },
  },
];

for (const { input, payload, expected } of CORPUS) {
  test(`language replay: ${input}`, async () => {
    const contract = await interpretMessageIntent(
      input,
      {},
      { now: NOW, extractor: async () => payload },
    );
    const retrieval = resolveRetrievalPlan(contract);

    assert.equal(contract.intent, expected.intent);
    assert.equal(retrieval.path, expected.path);
    if (expected.timeRangeKind) {
      assert.equal(contract.timeRangeHint?.kind, expected.timeRangeKind);
    }
  });
}
