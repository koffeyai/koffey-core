import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeBriefingResponse } from '../../src/lib/briefingNormalizer.ts';

test('briefing normalizer converts model-drift context into render-safe arrays', () => {
  const normalized = normalizeBriefingResponse({
    briefing: {
      greeting: 'Good morning',
      momentum: {
        summary: 'Pipeline moving',
        wins: [
          {
            deal_name: 'Acme',
            achievement: 'Moved forward',
            context: ['Champion replied', 'Budget confirmed'],
          },
        ],
        quota_status: { percentage: '25', message: '25%' },
      },
      priority_play: {
        headline: 'Advance Acme',
        deal_name: 'Acme',
        deal_id: 'deal-1',
        why_this_matters: 'Largest open deal',
        context: 'Amount: $10K\nStage: Qualified',
        action: { label: 'Schedule call', type: 'schedule_lunch' },
      },
      available_plays: [
        {
          deal_name: 'Beta',
          deal_id: 'deal-2',
          status: 'unknown',
          headline: 'Progress Beta',
          context: ['Qualified', '$5K'],
          suggested_action: { label: 'Follow up', type: 'email' },
        },
      ],
      in_motion: [],
      todays_meetings: [],
    },
    cached: true,
    generated_at: '2026-04-28T00:00:00.000Z',
  });

  assert.deepEqual(normalized.briefing.priority_play?.context, ['Amount: $10K', 'Stage: Qualified']);
  assert.equal(normalized.briefing.priority_play?.action.type, 'schedule');
  assert.equal(normalized.briefing.available_plays[0].context, 'Qualified • $5K');
  assert.equal(normalized.briefing.available_plays[0].status, 'play_available');
  assert.equal(normalized.briefing.momentum.quota_status.percentage, 25);
});
