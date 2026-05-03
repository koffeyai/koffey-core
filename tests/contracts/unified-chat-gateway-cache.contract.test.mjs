import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolOnlyResponse } from '../../supabase/functions/unified-chat/gateway/tool-only-response.mjs';

test('buildToolOnlyResponse preserves pending workflow prompts instead of marking them completed', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'create_deal',
      result: {
        _needsInput: true,
        message: 'Got it — before I create this deal, I still need the expected close date.',
      },
    },
  ]);

  assert.match(response, /expected close date/i);
  assert.doesNotMatch(response, /completed/i);
});
