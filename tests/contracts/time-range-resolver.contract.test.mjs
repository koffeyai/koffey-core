import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimeRangeHint } from '../../supabase/functions/unified-chat/intent/time-range-resolver.mjs';

const NOW = new Date('2026-03-08T12:00:00.000Z');

const CASES = [
  {
    label: 'relative months',
    input: { kind: 'relative_months', raw: 'next 5 months', value: 5 },
    expected: { start: '2026-03-08', end: '2026-08-08', resolution: 'month' },
  },
  {
    label: 'relative weeks',
    input: { kind: 'relative_weeks', raw: 'next 2 weeks', value: 2 },
    expected: { start: '2026-03-08', end: '2026-03-22', resolution: 'week' },
  },
  {
    label: 'soon',
    input: { kind: 'soon', raw: 'soon' },
    expected: { start: '2026-03-08', end: '2026-04-07', resolution: 'day' },
  },
  {
    label: 'quarter end',
    input: { kind: 'quarter_end', raw: 'end of q3', quarter: 3 },
    expected: { start: '2026-03-08', end: '2026-09-30', resolution: 'quarter' },
  },
  {
    label: 'season',
    input: { kind: 'season', raw: 'through summer', season: 'summer' },
    expected: { start: '2026-03-08', end: '2026-08-31', resolution: 'season' },
  },
  {
    label: 'absolute month',
    input: { kind: 'absolute_month', raw: 'by august', month: 8 },
    expected: { start: '2026-03-08', end: '2026-08-31', resolution: 'month' },
  },
  {
    label: 'absolute range',
    input: { kind: 'absolute_range', raw: 'march', start: '2026-03-08', end: '2026-03-31' },
    expected: { start: '2026-03-08', end: '2026-03-31', resolution: 'range' },
  },
];

for (const { label, input, expected } of CASES) {
  test(`resolveTimeRangeHint: ${label}`, () => {
    assert.deepEqual(resolveTimeRangeHint(input, { now: NOW }), expected);
  });
}

test('resolveTimeRangeHint returns null for unspecified hints', () => {
  assert.equal(resolveTimeRangeHint({ kind: 'unspecified', raw: 'later' }, { now: NOW }), null);
});
