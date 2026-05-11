import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const routingModuleUrl = pathToFileURL(path.join(repoRoot, 'supabase/functions/unified-chat/gateway/routing.ts')).href;

function installDenoEnv(env = {}) {
  globalThis.Deno = {
    env: {
      get(key) {
        return env[key];
      },
    },
  };
}

test('planner fallback does not block deterministic mutation planning', async () => {
  installDenoEnv();
  const { shouldDeferDeterministicMutationPlan } = await import(`${routingModuleUrl}?t=planner-fallback`);
  assert.equal(shouldDeferDeterministicMutationPlan({
    intentConfidence: 0.98,
    retrievalPlan: { path: 'planner_fallback' },
  }), false);
});

test('concrete retrieval plans still block deterministic mutation planning', async () => {
  installDenoEnv();
  const { shouldDeferDeterministicMutationPlan } = await import(`${routingModuleUrl}?t=concrete-path`);
  assert.equal(shouldDeferDeterministicMutationPlan({
    intentConfidence: 0.98,
    retrievalPlan: { path: 'deal_context' },
  }), true);
});

test('low-confidence retrieval plans do not block deterministic mutation planning', async () => {
  installDenoEnv();
  const { shouldDeferDeterministicMutationPlan } = await import(`${routingModuleUrl}?t=low-confidence`);
  assert.equal(shouldDeferDeterministicMutationPlan({
    intentConfidence: 0.4,
    retrievalPlan: { path: 'deal_context' },
  }), false);
});

test('pending deal context prevents concrete retrieval plans from blocking deterministic mutation planning', async () => {
  installDenoEnv();
  const { shouldDeferDeterministicMutationPlan } = await import(`${routingModuleUrl}?t=pending-deal-context`);
  assert.equal(shouldDeferDeterministicMutationPlan({
    intentConfidence: 0.98,
    retrievalPlan: { path: 'contact_context' },
    hasPendingDealContext: true,
  }), false);
});

test('pending deal plans outrank forced retrieval shortcuts', async () => {
  installDenoEnv();
  const { shouldUseLiveForcedRetrievalPlan } = await import(`${routingModuleUrl}?t=pending-outranks-forced`);
  assert.equal(shouldUseLiveForcedRetrievalPlan({
    shouldHonorRetrievalPlan: true,
    retrievalPlan: { path: 'contact_context', forcedTool: 'get_contact_context' },
    deterministicPendingDealPlanAvailable: true,
  }), false);
});

test('forced retrieval shortcuts still run when no pending mutation plan is available', async () => {
  installDenoEnv();
  const { shouldUseLiveForcedRetrievalPlan } = await import(`${routingModuleUrl}?t=forced-still-runs`);
  assert.equal(shouldUseLiveForcedRetrievalPlan({
    shouldHonorRetrievalPlan: true,
    retrievalPlan: { path: 'contact_context', forcedTool: 'get_contact_context' },
    deterministicPendingDealPlanAvailable: false,
  }), true);
});

test('account context retrieval requires tools and can use forced shortcut', async () => {
  installDenoEnv();
  const {
    shouldRetrievalPlanRequireTools,
    shouldUseLiveForcedRetrievalPlan,
  } = await import(`${routingModuleUrl}?t=account-context`);

  assert.equal(shouldRetrievalPlanRequireTools({ path: 'account_context' }), true);
  assert.equal(shouldUseLiveForcedRetrievalPlan({
    shouldHonorRetrievalPlan: true,
    retrievalPlan: { path: 'account_context', forcedTool: 'get_account_context' },
    deterministicPendingDealPlanAvailable: false,
  }), true);
});

test('pending deal context disables preferred retrieval tool narrowing', async () => {
  installDenoEnv();
  const { shouldApplyPreferredRetrievalToolFilter } = await import(`${routingModuleUrl}?t=pending-preferred-filter`);
  assert.equal(shouldApplyPreferredRetrievalToolFilter({
    shouldHonorRetrievalPlan: true,
    retrievalPlan: { preferredTools: ['get_contact_context'] },
    hasPendingDealContext: true,
  }), false);
});

test('preferred retrieval tool narrowing still applies without pending deal context', async () => {
  installDenoEnv();
  const { shouldApplyPreferredRetrievalToolFilter } = await import(`${routingModuleUrl}?t=preferred-filter-without-pending`);
  assert.equal(shouldApplyPreferredRetrievalToolFilter({
    shouldHonorRetrievalPlan: true,
    retrievalPlan: { preferredTools: ['get_contact_context'] },
    hasPendingDealContext: false,
  }), true);
});
