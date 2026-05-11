import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRetrievalPlan } from '../../supabase/functions/unified-chat/intent/intent-router.mjs';

const CASES = [
  {
    label: 'deal analysis routes to analyze_deal',
    contract: { intent: 'deal_analysis', entityId: 'deal-1', entityType: 'deal' },
    expected: { path: 'scoutpad', forcedTool: 'analyze_deal', args: { deal_id: 'deal-1' } },
  },
  {
    label: 'pipeline window routes to pipeline context with exact dates',
    contract: {
      intent: 'pipeline_window',
      resolvedTimeRange: { start: '2026-03-08', end: '2026-08-08' },
    },
    expected: {
      path: 'pipeline_context',
      forcedTool: 'get_context_resource',
      args: { resource_type: 'pipeline_context', period_start: '2026-03-08', period_end: '2026-08-08' },
    },
  },
  {
    label: 'entity lookup deal routes to deal context',
    contract: { intent: 'entity_lookup', entityType: 'deal', entityHint: 'Acme' },
    expected: { path: 'deal_context', forcedTool: 'get_context_resource', args: { resource_type: 'deal_context', entity_name: 'Acme' } },
  },
  {
    label: 'entity lookup contact routes to contact context',
    contract: { intent: 'entity_lookup', entityType: 'contact', entityHint: 'Sarah' },
    expected: { path: 'contact_context', forcedTool: 'get_context_resource', args: { resource_type: 'contact_context', entity_name: 'Sarah' } },
  },
  {
    label: 'entity lookup account routes to account context',
    contract: { intent: 'entity_lookup', entityType: 'account', entityHint: 'Pepsi' },
    expected: { path: 'account_context', forcedTool: 'get_context_resource', args: { resource_type: 'account_context', entity_name: 'Pepsi' } },
  },
  {
    label: 'message history routes to entity messages',
    contract: { intent: 'message_history', entityType: 'account', entityHint: 'Pepsi' },
    expected: { path: 'entity_messages', forcedTool: 'get_context_resource', args: { resource_type: 'entity_messages', entity_type: 'account', entity_name: 'Pepsi' } },
  },
  {
    label: 'drafting uses preferred tools path',
    contract: { intent: 'drafting' },
    expected: { path: 'draft_with_context', forcedTool: null },
  },
];

for (const { label, contract, expected } of CASES) {
  test(`resolveRetrievalPlan: ${label}`, () => {
    const result = resolveRetrievalPlan(contract);
    assert.equal(result.path, expected.path);
    assert.equal(result.forcedTool ?? null, expected.forcedTool);
    if (expected.args) assert.deepEqual(result.args, expected.args);
  });
}
