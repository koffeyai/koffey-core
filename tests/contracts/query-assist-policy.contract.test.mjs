import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQueryAssist } from '../../supabase/functions/unified-chat/query-assist-policy.mjs';

test('evaluateQueryAssist returns missing_entity for clarification-driven deal lookup', () => {
  const result = evaluateQueryAssist({
    message: 'this deal',
    intent: { intent: 'entity_lookup', entityType: 'deal' },
    retrievalPlan: { path: 'deal_context' },
    clarification: { needsClarification: true, reason: 'missing_entity' },
    groundingState: 'clarification_needed',
    crmOperations: [],
    response: 'Which deal are you asking about?',
    historyEntries: [],
  });

  assert.deepEqual(result, {
    enabled: true,
    reason: 'missing_entity',
    displayMode: 'suggest_examples',
  });
});

test('evaluateQueryAssist returns no_results when grounded lookup finds nothing', () => {
  const result = evaluateQueryAssist({
    message: 'pull up the johnson deal',
    intent: { intent: 'entity_lookup', entityType: 'deal', entityHint: 'Johnson' },
    retrievalPlan: { path: 'deal_context' },
    clarification: { needsClarification: false },
    groundingState: 'no_results',
    crmOperations: [{ tool: 'search_crm', result: { results: [] } }],
    response: 'I searched the CRM but found no matching records for that request.',
    historyEntries: [],
  });

  assert.deepEqual(result, {
    enabled: true,
    reason: 'no_results',
    displayMode: 'suggest_examples',
  });
});

test('evaluateQueryAssist returns missing_time_range for closable pipeline failures', () => {
  const result = evaluateQueryAssist({
    message: "what's closing",
    intent: { intent: 'pipeline_window', resolvedTimeRange: null },
    retrievalPlan: { path: 'pipeline_context' },
    clarification: { needsClarification: false },
    groundingState: 'failure',
    crmOperations: [],
    response: 'I could not retrieve verified CRM data for that request because the data lookup failed.',
    historyEntries: [],
  });

  assert.deepEqual(result, {
    enabled: true,
    reason: 'missing_time_range',
    displayMode: 'suggest_examples',
  });
});

test('evaluateQueryAssist returns unsupported_scope for account lookup fallback failures', () => {
  const result = evaluateQueryAssist({
    message: 'tell me about the johnson account',
    intent: { intent: 'entity_lookup', entityType: 'account', entityHint: 'Johnson' },
    retrievalPlan: { path: 'planner_fallback' },
    clarification: { needsClarification: false },
    groundingState: 'failure',
    crmOperations: [{ tool: 'search_crm', result: { error: true } }],
    response: 'I could not retrieve verified CRM data for that request because the data lookup failed.',
    historyEntries: [],
  });

  assert.deepEqual(result, {
    enabled: true,
    reason: 'unsupported_scope',
    displayMode: 'suggest_examples',
  });
});

test('evaluateQueryAssist returns repeated_failure after multiple recent misses', () => {
  const result = evaluateQueryAssist({
    message: 'who am i supposed to follow up with',
    intent: { intent: 'pipeline_summary' },
    retrievalPlan: { path: 'pipeline_context' },
    clarification: { needsClarification: false },
    groundingState: 'failure',
    crmOperations: [{ tool: 'get_pipeline_context', result: { error: true } }],
    response: 'I could not retrieve verified CRM data for that request because the data lookup failed.',
    historyEntries: [
      { role: 'assistant', content: 'I searched the CRM but found no matching records for that request.' },
      { role: 'assistant', content: "I tried to search your CRM but the query didn't execute properly." },
    ],
  });

  assert.deepEqual(result, {
    enabled: true,
    reason: 'repeated_failure',
    displayMode: 'tip_only',
  });
});

test('evaluateQueryAssist stays disabled for successful grounded answers', () => {
  const result = evaluateQueryAssist({
    message: 'show me everything closing in the next 6 weeks',
    intent: { intent: 'pipeline_window', resolvedTimeRange: { start: '2026-03-08', end: '2026-04-19' } },
    retrievalPlan: { path: 'pipeline_context' },
    clarification: { needsClarification: false },
    groundingState: 'verified',
    crmOperations: [{ tool: 'get_pipeline_context', result: { count: 2, results: [{ id: 'deal-1' }, { id: 'deal-2' }] } }],
    response: 'You have 2 deals closing in the next 6 weeks.',
    historyEntries: [],
  });

  assert.deepEqual(result, {
    enabled: false,
    reason: null,
    displayMode: null,
  });
});
