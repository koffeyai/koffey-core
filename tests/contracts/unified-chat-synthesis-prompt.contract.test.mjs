import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSynthesisToolResultsMessage } from '../../supabase/functions/unified-chat/gateway/synthesis-prompt.mjs';

test('synthesis prompt packages CRM tool results as regular text context', () => {
  const message = buildSynthesisToolResultsMessage([
    {
      tool: 'search_crm',
      args: {
        entity_type: 'deals',
        filters: { stage_not_in: ['closed_won', 'closed_lost'] },
      },
      result: {
        count: 1,
        results: [
          {
            id: 'deal-1',
            name: 'QA Calendar Two-Way Sync Deal',
            stage: 'prospecting',
            amount: 12000,
          },
        ],
      },
    },
  ]);

  assert.match(message, /CRM tool results for THIS request/);
  assert.match(message, /Tool 1: search_crm/);
  assert.match(message, /QA Calendar Two-Way Sync Deal/);
  assert.match(message, /prospecting/);
  assert.match(message, /Do not include internal UUIDs/);
  assert.match(message, /Prefer business-facing names/);
  assert.equal(message.includes('"role":"tool"'), false);
});

test('synthesis prompt is bounded for large result sets', () => {
  const message = buildSynthesisToolResultsMessage([
    {
      tool: 'search_crm',
      args: { entity_type: 'deals' },
      result: {
        results: Array.from({ length: 50 }).map((_, index) => ({
          id: `deal-${index}`,
          name: `Large Deal ${index}`,
          notes: 'x'.repeat(1000),
        })),
      },
    },
  ]);

  assert.equal(message.length < 13000, true);
  assert.doesNotThrow(() => {
    const resultLine = message.split('\n').find((line) => line.startsWith('Result: '));
    JSON.parse(resultLine.replace(/^Result: /, ''));
  });
});
