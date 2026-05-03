import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trimHistory,
  parseQuarterRequest,
  parsePeriodBounds,
  buildDirectPipelineSummaryFromDeals,
  isDirectPipelineSummaryRequest,
  isPipelineFollowUpRequest,
  isLikelyFollowUpMessage,
  isCompoundRequest,
  augmentFollowUpMessage,
  isDataOrActionRequest,
  isClosed,
} from '../../supabase/functions/unified-chat/request-intelligence.mjs';

const SAMPLE_DEALS = [
  {
    id: 'd1',
    name: 'TechNova Inc - Enterprise Plan',
    amount: 150000,
    probability: 50,
    stage: 'negotiation',
    expected_close_date: '2026-03-15',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'd2',
    name: 'Acme - TestDeal',
    amount: 500000,
    probability: 40,
    stage: 'negotiation',
    expected_close_date: null,
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'd3',
    name: 'Stripe - API Monitoring Solution',
    amount: 200000,
    probability: 20,
    stage: 'qualified',
    expected_close_date: '2026-03-31',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'd4',
    name: 'Closed Won Deal',
    amount: 120000,
    probability: 100,
    stage: 'closed_won',
    expected_close_date: '2026-02-15',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'd5',
    name: 'April Expansion - Renewal',
    amount: 320000,
    probability: 35,
    stage: 'prospecting',
    expected_close_date: '2026-04-22',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

test('parseQuarterRequest resolves shorthand q1 and defaults year when omitted', () => {
  const now = new Date('2026-02-24T12:00:00Z');
  const parsed = parseQuarterRequest("what's slatted to close in q1?", now);
  assert.equal(parsed.quarter, 1);
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.explicitYear, false);
});

test('parsePeriodBounds resolves explicit quarter/year correctly', () => {
  const now = new Date('2026-02-24T12:00:00Z');
  const period = parsePeriodBounds('top deals in Q2 2027', now);
  assert.equal(period.label, 'Q2 2027');
  assert.equal(period.start.toISOString().startsWith('2027-04-01'), true);
  assert.equal(period.end.toISOString().startsWith('2027-06-30'), true);
  assert.equal(period.assumption, undefined);
});

test('parsePeriodBounds resolves month-name periods and defaults to current year', () => {
  const now = new Date('2026-03-02T08:00:00Z');
  const period = parsePeriodBounds("what's my pipeline for april?", now);
  assert.equal(period.label, 'April 2026');
  assert.equal(period.start.toISOString().startsWith('2026-04-01'), true);
  assert.equal(period.end.toISOString().startsWith('2026-04-30'), true);
  assert.match(period.assumption, /current calendar year/i);
});

test('buildDirectPipelineSummaryFromDeals scopes by quarter without mixing in missing-close-date inventory', () => {
  const { response, dealLinks } = buildDirectPipelineSummaryFromDeals(SAMPLE_DEALS, "what's slated to close in q1?");
  assert.match(response, /Deals Slated To Close \(Q1 2026\)/);
  assert.match(response, /TechNova Inc - Enterprise Plan/);
  assert.match(response, /Stripe - API Monitoring Solution/);
  assert.equal(/Deals missing close dates/.test(response), false);
  assert.equal(dealLinks.some((d) => d.name === 'Closed Won Deal'), false);
});

test('buildDirectPipelineSummaryFromDeals scopes by month-name period', () => {
  const { response, citationDealIds } = buildDirectPipelineSummaryFromDeals(SAMPLE_DEALS, "what's my pipeline for april?");
  assert.match(response, /\(April 2026\)/);
  assert.match(response, /April Expansion - Renewal/);
  assert.equal(/TechNova Inc - Enterprise Plan/.test(response), false);
  assert.equal(Array.isArray(citationDealIds), true);
  assert.equal(citationDealIds.includes('d5'), true);
  assert.equal(citationDealIds.includes('d2'), false);
});

test('buildDirectPipelineSummaryFromDeals omits missing close dates for time-windowed asks unless requested', () => {
  const { response } = buildDirectPipelineSummaryFromDeals(SAMPLE_DEALS, "what's closable this quarter?");
  assert.equal(/Deals missing close dates/.test(response), false);
});

test('pipeline summary classifier avoids generic deal/contact messages', () => {
  assert.equal(isDirectPipelineSummaryRequest("what's my pipeline this quarter?"), true);
  assert.equal(isDirectPipelineSummaryRequest('show me top deals this month'), true);
  assert.equal(isDirectPipelineSummaryRequest('what closes in april?'), true);
  assert.equal(isDirectPipelineSummaryRequest("what's closable this quarter?"), true);
  assert.equal(isDirectPipelineSummaryRequest("what's on my plate"), true);
  assert.equal(isDirectPipelineSummaryRequest('is there a deal with pepsi?'), false);
  assert.equal(isDirectPipelineSummaryRequest("tom smith, vp of infrastructure, that's all i got"), false);
});

test('pipeline follow-up classifier requires explicit follow-up cues', () => {
  const historyText = 'pipeline summary current pipeline top deals stale deals';
  assert.equal(isPipelineFollowUpRequest('what about this quarter?', historyText), true);
  assert.equal(isPipelineFollowUpRequest('what about april?', historyText), true);
  assert.equal(isPipelineFollowUpRequest("that's all i got", historyText), false);
});

test('follow-up detector catches short contextual fragments', () => {
  assert.equal(isLikelyFollowUpMessage('what about this quarter?'), true);
  assert.equal(isLikelyFollowUpMessage('this deal'), true);
  assert.equal(isLikelyFollowUpMessage('show me all deals in negotiation over 100k with close dates and owners'), false);
});

test('compound detector identifies multi-clause asks', () => {
  assert.equal(isCompoundRequest('list top deals and show stale deals'), true);
  assert.equal(isCompoundRequest('show my pipeline'), false);
});

test('augmentFollowUpMessage injects previous user intent', () => {
  const history = [
    { role: 'user', content: 'what are my top negotiation deals?' },
    { role: 'assistant', content: 'Here are your deals...' },
  ];
  const augmented = augmentFollowUpMessage('what about this quarter?', history);
  assert.match(augmented, /Follow-up context from prior user request/);
  assert.match(augmented, /what are my top negotiation deals/);
});

test('trimHistory keeps recent context under max message cap', () => {
  const history = Array.from({ length: 20 }).map((_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i}`,
  }));
  const trimmed = trimHistory(history, 8, 400);
  assert.equal(trimmed.length <= 8, true);
  assert.equal(trimmed[trimmed.length - 1].content, 'message 19');
});

test('isDataOrActionRequest catches follow-up intent via history context', () => {
  const historyText = 'we reviewed pipeline and top deals and close dates';
  assert.equal(isDataOrActionRequest('what about this quarter?', historyText), true);
  assert.equal(isDataOrActionRequest("what's on my plate", ''), true);
  assert.equal(isDataOrActionRequest('show me recent convos with pepsi', ''), true);
  assert.equal(isDataOrActionRequest('draft a follow-up to sarah at apex', ''), true);
  assert.equal(isDataOrActionRequest('microsoft dael', ''), true);
  assert.equal(isDataOrActionRequest('analysis of the coca cola deal', ''), true);
  assert.equal(isDataOrActionRequest('evaluation of the pepsi opportunity', ''), true);
  assert.equal(isDataOrActionRequest('hello there', ''), false);
});

test('isClosed normalizes stage variants', () => {
  assert.equal(isClosed('closed_won'), true);
  assert.equal(isClosed('Closed Lost'), true);
  assert.equal(isClosed('negotiation'), false);
});
