import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForCache,
  shouldAttemptResponseCache,
  buildResponseCacheKeySource,
  getRecencyBucket,
  isReadOnlyToolSet,
} from '../../supabase/functions/unified-chat/response-cache-utils.mjs';

test('normalizeForCache trims and lowercases consistently', () => {
  const normalized = normalizeForCache('   What   Deals   Close In Q1?   ');
  assert.equal(normalized, 'what deals close in q1?');
});

test('shouldAttemptResponseCache allows standalone data/action asks', () => {
  const shouldCache = shouldAttemptResponseCache({
    message: "what's my pipeline this quarter",
    followUpLike: false,
    compoundLike: false,
    dataOrActionRequest: true,
  });
  assert.equal(shouldCache, true);
});

test('shouldAttemptResponseCache blocks follow-ups and conversational snippets', () => {
  assert.equal(shouldAttemptResponseCache({
    message: 'what about this quarter?',
    followUpLike: true,
    compoundLike: false,
    dataOrActionRequest: true,
  }), false);

  assert.equal(shouldAttemptResponseCache({
    message: 'thanks',
    followUpLike: false,
    compoundLike: false,
    dataOrActionRequest: false,
  }), false);
});

test('buildResponseCacheKeySource is user-scoped', () => {
  const sourceA = buildResponseCacheKeySource({
    organizationId: 'org-1',
    userId: 'user-a',
    message: 'show my top deals',
    bucket: 12345,
  });
  const sourceB = buildResponseCacheKeySource({
    organizationId: 'org-1',
    userId: 'user-b',
    message: 'show my top deals',
    bucket: 12345,
  });
  assert.notEqual(sourceA, sourceB);
});

test('buildResponseCacheKeySource includes explicit page context when present', () => {
  const sourceA = buildResponseCacheKeySource({
    organizationId: 'org-1',
    userId: 'user-a',
    message: 'draft an email for this deal',
    bucket: 12345,
    contextKey: 'deal:abc|type:email',
  });
  const sourceB = buildResponseCacheKeySource({
    organizationId: 'org-1',
    userId: 'user-a',
    message: 'draft an email for this deal',
    bucket: 12345,
    contextKey: 'deal:def|type:email',
  });
  assert.notEqual(sourceA, sourceB);
});

test('isReadOnlyToolSet only passes for read-only tools with no errors', () => {
  const readOnlyOps = [
    { tool: 'search_crm', result: { count: 3 } },
    { tool: 'get_pipeline_stats', result: { totalDeals: 7 } },
  ];
  assert.equal(
    isReadOnlyToolSet(readOnlyOps, ['search_crm', 'get_pipeline_stats']),
    true
  );

  const withMutation = [
    { tool: 'search_crm', result: { count: 3 } },
    { tool: 'create_deal', result: { id: 'deal-1' } },
  ];
  assert.equal(
    isReadOnlyToolSet(withMutation, ['search_crm', 'get_pipeline_stats']),
    false
  );
});

test('getRecencyBucket is deterministic for a fixed timestamp', () => {
  const now = Date.UTC(2026, 1, 24, 12, 0, 0); // Feb 24, 2026 12:00:00 UTC
  const bucketA = getRecencyBucket(300, now);
  const bucketB = getRecencyBucket(300, now + 299_000);
  const bucketC = getRecencyBucket(300, now + 301_000);

  assert.equal(bucketA, bucketB);
  assert.equal(bucketC, bucketA + 1);
});
