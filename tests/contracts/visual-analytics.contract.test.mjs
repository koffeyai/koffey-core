import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisualArtifactPrompts,
  isVisualAnalyticsRequest,
  summarizeVisualArtifacts,
} from '../../src/lib/visualAnalytics.ts';

test('visual analytics intent requires both visual and business language', () => {
  assert.equal(isVisualAnalyticsRequest('give me a pipeline summary'), false);
  assert.equal(isVisualAnalyticsRequest('create a visual dashboard of leading indicators'), true);
  assert.equal(isVisualAnalyticsRequest('generate a dashboard'), true);
  assert.equal(isVisualAnalyticsRequest('open dashboard'), false);
  assert.equal(isVisualAnalyticsRequest('plot sales activity trends'), true);
});

test('dashboard requests fan out into a compact default dashboard', () => {
  const prompts = buildVisualArtifactPrompts(
    'create a visual dashboard of leading indicators',
    new Date('2026-04-25T12:00:00Z'),
  );

  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /2026-04-25/);
  assert.match(prompts.join('\n'), /pipeline value by stage/);
  assert.match(prompts.join('\n'), /activity count by week/);
});

test('artifact summaries call out negative time-series direction', () => {
  const summary = summarizeVisualArtifacts([{
    type: 'artifact',
    config: { entity: 'deals', metrics: ['sum'], groupBy: 'month', chartType: 'line' },
    originalPrompt: 'show revenue trend',
    data: [
      { label: 'Jan', value: 100 },
      { label: 'Feb', value: 70 },
    ],
    title: 'Revenue Trend',
    summary: 'Revenue by month',
    chartType: 'line',
    generatedAt: '2026-04-25T12:00:00Z',
    rowCount: 2,
  }]);

  assert.match(summary, /Generated Revenue Trend/);
  assert.match(summary, /down from Jan to Feb by 30/);
});
