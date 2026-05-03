import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRelevantDomains } from '../../supabase/functions/unified-chat/skills/domain-estimator.mjs';

test('maps scheduling phrases to scheduling domain', () => {
  const domains = estimateRelevantDomains('schedule a meeting with Marco next week');
  assert.equal(domains.includes('scheduling'), true);
});

test('maps pipeline language to analytics domain', () => {
  const domains = estimateRelevantDomains("what's my pipeline forecast for this quarter?");
  assert.equal(domains.includes('analytics'), true);
});

test('maps create intents to create domain', () => {
  const domains = estimateRelevantDomains('create a new deal for Gucci');
  assert.equal(domains.includes('create'), true);
});

test('maps update intents to update domain', () => {
  const domains = estimateRelevantDomains('update the deal close date to march 31');
  assert.equal(domains.includes('update'), true);
});

test('maps scoutpad coaching asks to coaching domain', () => {
  const domains = estimateRelevantDomains('run scoutpad analysis on this deal');
  assert.equal(domains.includes('coaching'), true);
});

test('maps noun-form deal analysis asks to coaching domain', () => {
  const analysisDomains = estimateRelevantDomains('analysis of the coca cola deal');
  const evaluationDomains = estimateRelevantDomains('evaluation of the pepsi opportunity');

  assert.equal(analysisDomains.includes('coaching'), true);
  assert.equal(evaluationDomains.includes('coaching'), true);
});

test('maps intelligence asks to intelligence domain', () => {
  const domains = estimateRelevantDomains('draft a follow-up email and summarize next best action');
  assert.equal(domains.includes('intelligence'), true);
});

test('maps product queries to product domain', () => {
  const domains = estimateRelevantDomains('suggest upsell bundles and pricing');
  assert.equal(domains.includes('product'), true);
});

test('maps lead scoring/enrichment asks to leads domain', () => {
  const domains = estimateRelevantDomains('enrich these leads and score leads by BANT');
  assert.equal(domains.includes('leads'), true);
});

test('maps cadence language to sequences domain', () => {
  const domains = estimateRelevantDomains('enroll these contacts into a cadence sequence');
  assert.equal(domains.includes('sequences'), true);
});

test('maps admin language to admin domain', () => {
  const domains = estimateRelevantDomains('show audit logs and custom fields');
  assert.equal(domains.includes('admin'), true);
});

test('maps slides/deck requests to presentation domain', () => {
  const domains = estimateRelevantDomains('generate a presentation deck for this account');
  assert.equal(domains.includes('presentation'), true);
});

test('maps quarter follow-up fragments to analytics/search domains', () => {
  const domains = estimateRelevantDomains('what about this quarter?');
  assert.equal(domains.includes('analytics'), true);
});

test('returns empty list for empty message', () => {
  assert.deepEqual(estimateRelevantDomains('   '), []);
});
