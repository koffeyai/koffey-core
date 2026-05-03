import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryAssistSuggestions } from '../../supabase/functions/unified-chat/query-assist-suggestions.mjs';

test('buildQueryAssistSuggestions uses context for missing drafting target suggestions', () => {
  const suggestions = buildQueryAssistSuggestions({
    reason: 'missing_entity',
    intent: { intent: 'drafting' },
    context: {
      resolvedEntityContext: {
        primaryEntity: { type: 'deal', id: 'deal-1', name: 'TechNova' },
        referencedEntities: {
          accounts: [{ id: 'acc-1', name: 'Apex' }],
        },
      },
    },
    message: 'draft a follow-up',
  });

  assert.equal(suggestions.length, 3);
  assert.match(suggestions[0], /Sarah at Apex/);
  assert.match(suggestions[1], /TechNova/);
});

test('buildQueryAssistSuggestions returns entity alternatives for no results', () => {
  const suggestions = buildQueryAssistSuggestions({
    reason: 'no_results',
    intent: { entityHint: 'Johnson', entityType: 'deal' },
    context: {},
    message: 'pull up the johnson deal',
  });

  assert.deepEqual(suggestions, [
    'Who is Johnson?',
    'Tell me about the Johnson account',
    'Show recent messages with Johnson',
  ]);
});

test('buildQueryAssistSuggestions returns common windows for missing time range', () => {
  const suggestions = buildQueryAssistSuggestions({
    reason: 'missing_time_range',
    intent: { intent: 'pipeline_window' },
    context: {},
    message: "what's closing",
  });

  assert.deepEqual(suggestions, [
    "What's closing this quarter",
    "What's closing in the next 30 days",
    "What's closing before end of Q2",
  ]);
});

test('buildQueryAssistSuggestions returns pipeline cleanup hints for repeated pipeline failures', () => {
  const suggestions = buildQueryAssistSuggestions({
    reason: 'repeated_failure',
    intent: { intent: 'pipeline_summary' },
    context: {},
    message: "what's on my plate",
  });

  assert.deepEqual(suggestions, [
    'Show my open deals',
    "What's closing this quarter",
    'Who should I follow up with this week?',
  ]);
});
