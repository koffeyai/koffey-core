import test from 'node:test';
import assert from 'node:assert/strict';

import {
  looksLikeCrmRequestMessage,
  looksLikePlanningPlaceholderText,
  looksLikeTemplatePlaceholderText,
  shouldSuppressUngroundedCrmText,
} from '../../supabase/functions/unified-chat/execution-guard.mjs';

test('looksLikeCrmRequestMessage flags natural CRM asks', () => {
  assert.equal(looksLikeCrmRequestMessage('whats on my plate'), true);
  assert.equal(looksLikeCrmRequestMessage('tell me about technova'), true);
  assert.equal(looksLikeCrmRequestMessage('hows it going with apex'), true);
  assert.equal(looksLikeCrmRequestMessage('what deals do i have for the next 5 months'), true);
});

test('looksLikeCrmRequestMessage uses history for deictic follow-ups', () => {
  assert.equal(looksLikeCrmRequestMessage('this deal', 'we were just discussing the technova deal'), true);
  assert.equal(looksLikeCrmRequestMessage('this one', ''), false);
});

test('looksLikePlanningPlaceholderText detects planning prose', () => {
  assert.equal(looksLikePlanningPlaceholderText('I will need to access the CRM and gather that information.'), true);
  assert.equal(looksLikePlanningPlaceholderText('Let me check the CRM for you.'), true);
  assert.equal(looksLikePlanningPlaceholderText('TechNova is in negotiation for $150K.'), false);
});

test('looksLikeTemplatePlaceholderText detects unresolved templates', () => {
  assert.equal(looksLikeTemplatePlaceholderText('Deal 1: [Deal Name] - [Closing Date] - [Deal Value]'), true);
  assert.equal(looksLikeTemplatePlaceholderText('Subject: [Your Subject Here]'), true);
  assert.equal(looksLikeTemplatePlaceholderText('Apex Expansion closes on 2026-05-15.'), false);
});

test('shouldSuppressUngroundedCrmText only suppresses ungrounded CRM placeholders', () => {
  assert.equal(shouldSuppressUngroundedCrmText({
    message: 'what deals do i have for the next 5 months',
    responseText: 'To provide you with the deals, I will need to access the CRM.\nDeal 1: [Deal Name]',
    taskClass: 'crm_read',
    retrievalPath: 'planner_fallback',
    crmOperationsCount: 0,
    clarificationNeeded: false,
  }), true);

  assert.equal(shouldSuppressUngroundedCrmText({
    message: 'hello',
    responseText: 'Hi there.',
    taskClass: 'chat_small',
    retrievalPath: 'none',
    crmOperationsCount: 0,
    clarificationNeeded: false,
  }), false);

  assert.equal(shouldSuppressUngroundedCrmText({
    message: 'tell me about technova',
    responseText: 'TechNova is in negotiation at $150K.',
    taskClass: 'crm_read',
    retrievalPath: 'deal_context',
    crmOperationsCount: 1,
    clarificationNeeded: false,
  }), false);
});
