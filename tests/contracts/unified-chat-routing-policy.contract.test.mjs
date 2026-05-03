import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferMutationIntent,
  classifyTaskClass,
  classifyRiskLevel,
  resolveMinimumTier,
  determineRoutingPolicy,
} from '../../supabase/functions/unified-chat/routing-policy.mjs';

test('greeting routes to low-risk chat_small with lite minimum tier', () => {
  const policy = determineRoutingPolicy({
    message: 'hello',
    historyText: '',
    domains: [],
    channel: 'telegram',
    needsTools: false,
    verificationRequired: false,
  });

  assert.equal(policy.taskClass, 'chat_small');
  assert.equal(policy.riskLevel, 'low');
  assert.equal(policy.minimumTier, 'lite');
  assert.equal(policy.mutationIntent, false);
});

test('read-only CRM ask routes to crm_read and standard minimum tier', () => {
  const policy = determineRoutingPolicy({
    message: 'is there a deal with pepsi in the system?',
    historyText: 'we were reviewing pipeline details',
    domains: ['search'],
    channel: 'web',
    needsTools: true,
    verificationRequired: true,
  });

  assert.equal(policy.taskClass, 'crm_read');
  assert.equal(policy.riskLevel, 'medium');
  assert.equal(policy.minimumTier, 'standard');
  assert.equal(policy.mutationIntent, false);
});

test('mutation ask routes to crm_write and at least standard tier', () => {
  assert.equal(inferMutationIntent({ message: 'create a new contact for tom at pepsi', domains: [] }), true);

  const taskClass = classifyTaskClass({
    message: 'create a new contact for tom at pepsi',
    historyText: '',
    domains: ['create'],
    channel: 'whatsapp',
  });

  const riskLevel = classifyRiskLevel({
    taskClass,
    needsTools: true,
    mutationIntent: true,
    verificationRequired: true,
  });

  const minimumTier = resolveMinimumTier({ taskClass, riskLevel });

  assert.equal(taskClass, 'crm_write');
  assert.equal(riskLevel, 'high');
  assert.equal(minimumTier, 'standard');
});

test('SCOUTPAD or analytics asks require pro minimum tier', () => {
  const scoutpadPolicy = determineRoutingPolicy({
    message: 'Analyze Coca Cola with SCOUTPAD and identify next actions',
    historyText: '',
    domains: ['coaching'],
    channel: 'telegram',
    needsTools: true,
    verificationRequired: true,
  });

  const analyticsPolicy = determineRoutingPolicy({
    message: 'show me pipeline velocity and conversion trend for Q1',
    historyText: '',
    domains: ['analytics'],
    channel: 'web',
    needsTools: true,
    verificationRequired: true,
  });

  assert.equal(scoutpadPolicy.taskClass, 'scoutpad');
  assert.equal(scoutpadPolicy.minimumTier, 'pro');
  assert.equal(analyticsPolicy.taskClass, 'analytics');
  assert.equal(analyticsPolicy.minimumTier, 'pro');
});

test('high-confidence intent hints override task class routing', () => {
  const scoutpadTask = classifyTaskClass({
    message: 'hello',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'deal_analysis', confidence: 0.92 },
  });
  const analyticsTask = classifyTaskClass({
    message: 'hello',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'pipeline_summary', confidence: 0.85 },
  });

  assert.equal(scoutpadTask, 'scoutpad');
  assert.equal(analyticsTask, 'analytics');
});

test('high-confidence extended intent hints map to deterministic task classes', () => {
  const pipelineWindowTask = classifyTaskClass({
    message: 'what deals do I have for the next 5 months',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'pipeline_window', confidence: 0.86 },
  });
  const entityLookupTask = classifyTaskClass({
    message: 'tell me about microsoft',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'entity_lookup', confidence: 0.84 },
  });
  const messageHistoryTask = classifyTaskClass({
    message: 'show me recent conversations with pepsi',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'message_history', confidence: 0.81 },
  });
  const draftingTask = classifyTaskClass({
    message: 'draft a follow-up to sarah',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'drafting', confidence: 0.84 },
  });

  assert.equal(pipelineWindowTask, 'analytics');
  assert.equal(entityLookupTask, 'crm_read');
  assert.equal(messageHistoryTask, 'crm_read');
  assert.equal(draftingTask, 'crm_read');
});

test('low-confidence intent hints fall back to regex classification', () => {
  const taskClass = classifyTaskClass({
    message: 'hello',
    historyText: '',
    domains: [],
    channel: 'web',
    intentHint: { intent: 'deal_analysis', confidence: 0.4 },
  });

  assert.equal(taskClass, 'chat_small');
});
