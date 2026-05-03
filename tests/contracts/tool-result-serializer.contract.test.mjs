import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeToolResultForPrompt } from '../../supabase/functions/unified-chat/tool-result-serializer.mjs';

function makeRows(count) {
  return Array.from({ length: count }).map((_, i) => ({
    id: `deal-${i + 1}`,
    name: `Deal ${i + 1}`,
    stage: i % 2 === 0 ? 'negotiation' : 'prospecting',
    amount: 50000 + i * 1000,
    probability: 20 + (i % 6) * 10,
    expected_close_date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
    huge_blob: 'x'.repeat(800),
  }));
}

test('serializer returns valid JSON under max char budget for large result sets', () => {
  const input = {
    message: 'ok',
    results: makeRows(30),
  };

  const output = serializeToolResultForPrompt(input, { maxChars: 1000, maxResults: 8 });
  assert.equal(output.length <= 1000, true);

  const parsed = JSON.parse(output);
  assert.equal(typeof parsed, 'object');
  if (Array.isArray(parsed.results)) {
    assert.equal(parsed.results.length <= 8, true);
  }
});

test('serializer never emits broken JSON when trimming oversized payloads', () => {
  const input = {
    error: false,
    message: 'm'.repeat(12000),
    results: makeRows(20),
    deals: makeRows(20),
  };

  const output = serializeToolResultForPrompt(input, { maxChars: 1000, maxResults: 8 });
  assert.equal(output.length <= 1000, true);
  assert.doesNotThrow(() => JSON.parse(output));
});

test('serializer falls back to minimal structure for pathological objects', () => {
  const input = {
    unexpected: {
      deeply: {
        nested: {
          blob: 'z'.repeat(30000),
        },
      },
    },
    message: 'summary '.repeat(500),
  };

  const output = serializeToolResultForPrompt(input, { maxChars: 1000, maxResults: 8 });
  const parsed = JSON.parse(output);
  assert.equal(typeof parsed, 'object');
  assert.equal(output.length <= 1000, true);
});
