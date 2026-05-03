import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClarificationPolicy } from '../../supabase/functions/unified-chat/intent/clarification-policy.mjs';
import { resolveRetrievalPlan } from '../../supabase/functions/unified-chat/intent/intent-router.mjs';

const CASES = [
  {
    label: 'this deal with resolved context does not clarify',
    contract: { intent: 'deal_analysis', entityId: null, entityHint: null, confidence: 0.9 },
    context: { resolvedEntityContext: { primaryEntity: { type: 'deal', id: 'deal-1', name: 'Acme' } } },
    expected: false,
  },
  {
    label: 'deal analysis without target clarifies',
    contract: { intent: 'deal_analysis', entityId: null, entityHint: null, confidence: 0.9 },
    context: {},
    expected: true,
  },
  {
    label: 'drafting with page-context deal does not clarify',
    contract: { intent: 'drafting', entityId: null, entityHint: null, entityType: null, confidence: 0.8 },
    context: { resolvedEntityContext: { primaryEntity: { type: 'deal', id: 'deal-2', name: 'Pepsi Expansion' } } },
    expected: false,
  },
  {
    label: 'message history without target clarifies',
    contract: { intent: 'message_history', entityId: null, entityHint: null, entityType: null, confidence: 0.9 },
    context: {},
    expected: true,
  },
];

for (const { label, contract, context, expected } of CASES) {
  test(`evaluateClarificationPolicy: ${label}`, () => {
    const plan = resolveRetrievalPlan(contract);
    const result = evaluateClarificationPolicy(contract, plan, context);
    assert.equal(result.needsClarification, expected);
  });
}
