import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCitationsFromToolExecution,
  collectCitationsFromOperations,
  buildStrictVerification,
  buildUnverifiedResponseMessage,
  buildVerificationUserSummary,
  determineVerificationPolicy,
  hasCitationRelevantOperation,
  hasOnlyPendingWorkflowOperations,
  redactFactualClaimsForMixedIntent,
  detectFactualClaims,
  formatCitationForChannel,
  classifyGroundingState,
  buildGroundedFailureMessage,
} from '../../supabase/functions/unified-chat/citations-utils.mjs';

test('collectCitationsFromToolExecution extracts row-level citations from search results', () => {
  const citations = collectCitationsFromToolExecution(
    'search_crm',
    { entity_type: 'deals', query: 'acme' },
    {
      entity_type: 'deals',
      results: [
        {
          id: 'deal_1',
          name: 'Acme Enterprise',
          stage: 'negotiation',
          amount: 150000,
          probability: 60,
        },
      ],
    }
  );

  assert.equal(citations.length > 0, true);
  assert.equal(citations[0].kind, 'retrieved');
  assert.equal(citations[0].table, 'deals');
  assert.equal(citations[0].rowId, 'deal_1');
  assert.equal(citations[0].sourceTool, 'search_crm');
  assert.equal(citations[0].uiLink?.view, 'deals');
});

test('collectCitationsFromOperations deduplicates and keeps bounded list', () => {
  const citations = collectCitationsFromOperations([
    {
      tool: 'search_crm',
      args: { entity_type: 'deals', query: 'acme' },
      result: { entity_type: 'deals', results: [{ id: 'deal_1', name: 'Acme Enterprise' }] },
    },
    {
      tool: 'search_crm',
      args: { entity_type: 'deals', query: 'acme' },
      result: { entity_type: 'deals', results: [{ id: 'deal_1', name: 'Acme Enterprise' }] },
    },
  ]);

  assert.equal(citations.length, 1);
});

test('collectCitationsFromOperations suppresses citations when tool marks zero-result query', () => {
  const citations = collectCitationsFromOperations([
    {
      tool: 'search_crm',
      args: { entity_type: 'deals', query: 'this deal' },
      result: {
        entity_type: 'deals',
        results: [{ id: 'deal_1', name: 'Acme Enterprise' }],
        __forceNoCitations: true,
      },
    },
  ]);

  assert.deepEqual(citations, []);
});

test('collectCitationsFromToolExecution suppresses pending mutation placeholder citations', () => {
  const citations = collectCitationsFromToolExecution(
    'create_deal',
    { account_name: 'Acme Corp', amount: 20000 },
    {
      _needsConfirmation: true,
      message: 'I could not find Acme Corp. Should I create the account first?',
      entity: 'deal',
    }
  );

  assert.deepEqual(citations, []);
});

test('buildStrictVerification returns true only when strict checks pass', () => {
  const citations = collectCitationsFromToolExecution(
    'search_crm',
    { entity_type: 'contacts', query: 'tom' },
    {
      entity_type: 'contacts',
      results: [{ id: 'contact_1', full_name: 'Tom Smith', email: 'tom@example.com' }],
    }
  );

  const verification = buildStrictVerification({
    requiresVerification: true,
    crmOperations: [
      {
        tool: 'search_crm',
        args: { entity_type: 'contacts', query: 'tom' },
        result: { entity_type: 'contacts', results: [{ id: 'contact_1', full_name: 'Tom Smith' }] },
      },
    ],
    citations,
    response: 'Found Tom Smith in contacts.',
  });

  assert.equal(verification.is_true, true);
  assert.equal(verification.failed_checks.length, 0);
});

test('buildStrictVerification fails closed without citations for data request', () => {
  const verification = buildStrictVerification({
    requiresVerification: true,
    crmOperations: [
      {
        tool: 'search_crm',
        args: { entity_type: 'deals', query: 'acme' },
        result: { entity_type: 'deals', results: [{ id: 'deal_1', name: 'Acme Enterprise' }] },
      },
    ],
    citations: [],
    response: 'Acme has one deal.',
  });

  assert.equal(verification.is_true, false);
  assert.equal(verification.failed_checks.includes('NO_CITATIONS'), true);
});

test('buildStrictVerification fails when response lists entities not in citations', () => {
  const citations = collectCitationsFromToolExecution(
    'search_crm',
    { entity_type: 'deals', query: 'top deals' },
    {
      entity_type: 'deals',
      results: [
        { id: 'deal_1', name: 'TechNova Inc - Enterprise Plan' },
        { id: 'deal_2', name: 'Salesforce - Demo Scheduled' },
      ],
    }
  );

  const verification = buildStrictVerification({
    requiresVerification: true,
    crmOperations: [
      {
        tool: 'search_crm',
        args: { entity_type: 'deals', query: 'top deals' },
        result: {
          entity_type: 'deals',
          results: [
            { id: 'deal_1', name: 'TechNova Inc - Enterprise Plan' },
            { id: 'deal_2', name: 'Salesforce - Demo Scheduled' },
          ],
        },
      },
    ],
    citations,
    response: [
      'Top deals:',
      '1. TechNova Inc - Enterprise Plan — $150k',
      '2. DataWeave - Enterprise Plan — $75k',
    ].join('\n'),
  });

  assert.equal(verification.is_true, false);
  assert.equal(
    verification.failed_checks.some((check) => check.startsWith('UNSUPPORTED_RESPONSE_ENTITIES:')),
    true
  );
});

test('buildStrictVerification flags negative-result contradiction when rows exist', () => {
  const citations = collectCitationsFromToolExecution(
    'search_crm',
    { entity_type: 'deals', query: 'johnson' },
    {
      entity_type: 'deals',
      results: [{ id: 'deal_1', name: 'Pepsi Expansion' }],
    }
  );

  const verification = buildStrictVerification({
    requiresVerification: true,
    crmOperations: [
      {
        tool: 'search_crm',
        args: { entity_type: 'deals', query: 'johnson' },
        result: {
          entity_type: 'deals',
          results: [{ id: 'deal_1', name: 'Pepsi Expansion' }],
        },
      },
    ],
    citations,
    response: "No deal with 'Johnson' in the name was found.",
  });

  assert.equal(verification.failed_checks.includes('NEGATIVE_RESULT_CONTRADICTION'), true);
});

test('buildStrictVerification supports acronym entities when cited rows include matching deal names', () => {
  const citations = collectCitationsFromToolExecution(
    'get_pipeline_stats',
    { inferred: true },
    {
      entity_type: 'deals',
      results: [
        { id: 'deal_ups', name: 'UPS - Infrastructure Expansion' },
        { id: 'deal_rei', name: 'REI - Ecommerce Infrastructure' },
      ],
    }
  );

  const verification = buildStrictVerification({
    requiresVerification: true,
    crmOperations: [
      {
        tool: 'get_pipeline_stats',
        args: { inferred: true },
        result: {
          entity_type: 'deals',
          results: [
            { id: 'deal_ups', name: 'UPS - Infrastructure Expansion' },
            { id: 'deal_rei', name: 'REI - Ecommerce Infrastructure' },
          ],
        },
      },
    ],
    citations,
    response: [
      'Deals missing close dates:',
      '- UPS - Infrastructure Expansion',
      '- REI - Ecommerce Infrastructure',
    ].join('\n'),
  });

  assert.equal(verification.is_true, true);
  assert.equal(
    verification.failed_checks.some((check) => check.startsWith('UNSUPPORTED_RESPONSE_ENTITIES:')),
    false
  );
});

test('buildStrictVerification grounds listed task titles from task citations', () => {
  const citations = collectCitationsFromToolExecution(
    'get_tasks',
    { deal_name: 'QA Calendar Two-Way Sync' },
    {
      tasks: [
        {
          id: 'task_1',
          title: 'QA Calendar Call - CRM to Google',
          priority: 'medium',
        },
      ],
    }
  );

  const verification = buildStrictVerification({
    requiresVerification: true,
    crmOperations: [
      {
        tool: 'get_tasks',
        args: { deal_name: 'QA Calendar Two-Way Sync' },
        result: {
          tasks: [
            {
              id: 'task_1',
              title: 'QA Calendar Call - CRM to Google',
              priority: 'medium',
            },
          ],
          count: 1,
        },
      },
    ],
    citations,
    response: [
      'Found 1 task.',
      '- QA Calendar Call - CRM to Google',
    ].join('\n'),
  });

  assert.equal(verification.is_true, true);
  assert.equal(
    verification.failed_checks.some((check) => check.startsWith('UNSUPPORTED_RESPONSE_ENTITIES:')),
    false
  );
});

test('buildUnverifiedResponseMessage returns explicit fail-closed text', () => {
  const text = buildUnverifiedResponseMessage(['NO_CITATIONS']);
  assert.match(text, /UNVERIFIED/);
  assert.match(text, /NO_CITATIONS/);
});

test('determineVerificationPolicy returns advisory for generative drafting asks without strict evidence', () => {
  const decision = determineVerificationPolicy({
    message: 'Draft an email follow up for Acme this week.',
    response: 'Subject: Next Steps\nBody: Great meeting today.',
    crmOperations: [],
    routingTaskClass: 'crm_read',
    dataOrActionRequest: true,
  });

  assert.equal(decision.policy, 'advisory');
  assert.equal(decision.mixed_intent, false);
});

test('determineVerificationPolicy keeps generative draft asks advisory even with numbered response sections', () => {
  const decision = determineVerificationPolicy({
    message: 'Draft an email for this deal this week. Include context and next steps.',
    response: [
      'Subject: Following up from our meeting',
      '',
      '1. Thank them for time',
      '2. Share next steps',
      '3. Propose a call next week',
    ].join('\n'),
    crmOperations: [{ tool: 'draft_email', result: { content: 'ok' } }],
    routingTaskClass: 'crm_read',
    dataOrActionRequest: true,
  });

  assert.equal(decision.policy, 'advisory');
  assert.equal(decision.mixed_intent, false);
  assert.equal(decision.factual_claims_detected, false);
});

test('determineVerificationPolicy returns strict for factual responses even when routing class is non-strict', () => {
  const decision = determineVerificationPolicy({
    message: 'share a quick summary',
    response: 'Total Deals: 22\nWeighted Value: $800,000',
    crmOperations: [],
    routingTaskClass: 'crm_write',
    dataOrActionRequest: true,
  });

  assert.equal(decision.policy, 'strict');
  assert.equal(decision.factual_claims_detected, true);
});

test('determineVerificationPolicy flags mixed intent when strict evidence and advisory actions coexist', () => {
  const decision = determineVerificationPolicy({
    message: 'show me acme and draft a follow up email',
    response: 'Acme amount is $150,000. Subject: Following up',
    crmOperations: [
      { tool: 'search_crm', result: { results: [{ id: 'd1', name: 'Acme' }] } },
      { tool: 'create_task', result: { id: 't1', title: 'Send follow-up' } },
    ],
    routingTaskClass: 'crm_read',
    dataOrActionRequest: true,
  });

  assert.equal(decision.policy, 'strict');
  assert.equal(decision.mixed_intent, true);
});

test('redactFactualClaimsForMixedIntent removes factual lines and keeps action text', () => {
  const redacted = redactFactualClaimsForMixedIntent([
    'Total Deals: 22',
    'Weighted Value: $800,000',
    'Subject: Follow-up from our meeting',
    'Body: Great meeting you at the conference.',
  ].join('\n'));

  assert.equal(redacted.redacted, true);
  assert.match(redacted.response, /Subject: Follow-up from our meeting/);
  assert.match(redacted.response, /Body: Great meeting you at the conference/);
  assert.equal(/Total Deals: 22/.test(redacted.response), false);
  assert.equal(/Weighted Value/.test(redacted.response), false);
});

test('buildVerificationUserSummary returns plain-language messages', () => {
  const summary = buildVerificationUserSummary(
    ['TOOL_ERRORS:search_crm', 'NO_CITATIONS'],
    { policy: 'strict', sourceStatus: 'source_gap' }
  );

  assert.match(summary, /tools failed/i);
  assert.match(summary, /No supporting database citations/i);
});

test('detectFactualClaims catches numeric and aggregate signals', () => {
  const factual = detectFactualClaims({
    message: 'What is my pipeline?',
    response: 'Top deals:\n1. Acme — $150,000 — 50%',
  });
  assert.equal(factual, true);
});

test('detectFactualClaims ignores generic numbered drafting structure without factual signals', () => {
  const factual = detectFactualClaims({
    message: 'Draft an email to follow up after the conference.',
    response: [
      'Subject: Great meeting today',
      '',
      '1. Thank them for their time',
      '2. Recap key points',
      '3. Suggest next steps',
    ].join('\n'),
  });
  assert.equal(factual, false);
});

test('determineVerificationPolicy keeps unknown-tool-only generative flow advisory', () => {
  const decision = determineVerificationPolicy({
    message: 'Draft a follow-up email for Acme',
    response: 'Here is a follow-up draft.',
    crmOperations: [{ tool: 'unknown_tool', result: { ignored: true } }],
    routingTaskClass: 'crm_write',
    dataOrActionRequest: true,
  });

  assert.equal(decision.policy, 'advisory');
});

test('hasCitationRelevantOperation excludes advisory mutations and includes successful retrieval tools', () => {
  assert.equal(hasCitationRelevantOperation([
    { tool: 'draft_email', result: { content: 'ok' } },
  ]), false);

  assert.equal(hasCitationRelevantOperation([
    { tool: 'create_deal', result: { _needsInput: true, message: 'I still need a close date.' } },
  ]), false);

  assert.equal(hasCitationRelevantOperation([
    { tool: 'search_crm', result: { results: [{ id: 'deal_1', name: 'Acme - Expansion' }] } },
  ]), true);
});

test('hasOnlyPendingWorkflowOperations detects pending mutation prompts', () => {
  assert.equal(hasOnlyPendingWorkflowOperations([
    { tool: 'create_deal', result: { _needsInput: true, message: 'I still need a close date.' } },
  ]), true);

  assert.equal(hasOnlyPendingWorkflowOperations([
    {
      tool: 'get_contact_context',
      result: {
        success: false,
        _needsInput: true,
        clarification_type: 'missing_contact_details',
        message: 'I could not find that contact. Add them with first name, last name, title, and email.',
      },
    },
  ]), true);

  assert.equal(hasOnlyPendingWorkflowOperations([
    { tool: 'create_deal', result: { id: 'deal_1', name: 'Acme - Expansion' } },
  ]), false);
});

test('determineVerificationPolicy suppresses verification for pending-only workflow responses', () => {
  const decision = determineVerificationPolicy({
    message: 'please create an opportunity for acme for $20k MRR',
    response: 'Action status:\n- create_deal: Got it — $20K deal with acme. Before I create it, I need:\n• expected close date\n• primary contact name',
    crmOperations: [
      {
        tool: 'create_deal',
        result: {
          _needsInput: true,
          message: 'Got it — $20K deal with acme. Before I create it, I need:\n• expected close date\n• primary contact name',
        },
      },
    ],
    routingTaskClass: 'crm_write',
    dataOrActionRequest: true,
  });

  assert.equal(decision.policy, 'none');
  assert.equal(decision.strict_triggered, false);
});

test('classifyGroundingState keeps missing contact detail prompts as clarification instead of source gaps', () => {
  const groundingState = classifyGroundingState({
    verification: {
      is_true: true,
      policy: 'none',
      blocking_failure: false,
      failed_checks: [],
    },
    crmOperations: [
      {
        tool: 'get_contact_context',
        result: {
          success: false,
          _needsInput: true,
          clarification_type: 'missing_contact_details',
          message: 'I could not find that contact. Add them with first name, last name, title, and email.',
        },
      },
    ],
    citations: [],
    response: 'Action status:\n- get_contact_context: I could not find that contact. Add them with first name, last name, title, and email.',
    clarificationNeeded: false,
  });

  assert.equal(groundingState, 'clarification_needed');
});

test('formatCitationForChannel provides deterministic readable output', () => {
  const text = formatCitationForChannel(
    {
      table: 'deals',
      rowId: 'deal_1',
      sourceTool: 'search_crm',
    },
    1
  );
  assert.equal(text, '1. deals:#deal_1 (search_crm)');
});

test('formatCitationForChannel prefers snapshot name labels when available', () => {
  const text = formatCitationForChannel(
    {
      table: 'deals',
      rowId: 'deal_1',
      sourceTool: 'search_crm',
      valueSnapshot: {
        name: 'Acme - Expansion',
      },
    },
    2
  );
  assert.equal(text, '2. deal "Acme - Expansion" (search_crm)');
});

test('classifyGroundingState returns verified for strict verified answers with citations', () => {
  const groundingState = classifyGroundingState({
    verification: {
      policy: 'strict',
      is_true: true,
      blocking_failure: false,
    },
    crmOperations: [
      { tool: 'search_crm', result: { results: [{ id: 'deal_1', name: 'Acme Expansion' }] } },
    ],
    citations: [
      { kind: 'retrieved', table: 'deals', rowId: 'deal_1', sourceTool: 'search_crm' },
    ],
    response: 'Acme Expansion is in negotiation.',
    clarificationNeeded: false,
  });

  assert.equal(groundingState, 'verified');
});

test('classifyGroundingState returns no_results when tools succeed but return zero rows', () => {
  const groundingState = classifyGroundingState({
    verification: {
      policy: 'strict',
      is_true: false,
      blocking_failure: false,
    },
    crmOperations: [
      { tool: 'search_crm', result: { results: [] } },
    ],
    citations: [],
    response: 'I searched your CRM but found nothing.',
    clarificationNeeded: false,
  });

  assert.equal(groundingState, 'no_results');
});

test('classifyGroundingState recovers negative-result contradiction to advisory_only', () => {
  const groundingState = classifyGroundingState({
    verification: {
      policy: 'strict',
      is_true: false,
      blocking_failure: true,
      failed_checks: ['NEGATIVE_RESULT_CONTRADICTION'],
    },
    crmOperations: [
      { tool: 'search_crm', result: { results: [{ id: 'deal_1', name: 'Pepsi Expansion' }] } },
    ],
    citations: [
      { kind: 'retrieved', table: 'deals', rowId: 'deal_1', sourceTool: 'search_crm' },
    ],
    response: "No deal with 'Johnson' in the name was found.",
    clarificationNeeded: false,
  });

  // Data WAS found — recover to advisory_only instead of blocking with no_results
  assert.equal(groundingState, 'advisory_only');
});

test('classifyGroundingState returns failure when all executed tools error', () => {
  const groundingState = classifyGroundingState({
    verification: {
      policy: 'strict',
      is_true: false,
      blocking_failure: true,
    },
    crmOperations: [
      { tool: 'search_crm', result: { error: true, message: 'timeout' } },
    ],
    citations: [],
    response: '',
    clarificationNeeded: false,
  });

  assert.equal(groundingState, 'failure');
});

test('classifyGroundingState returns advisory_only for grounded drafting flows', () => {
  const groundingState = classifyGroundingState({
    verification: {
      policy: 'advisory',
      is_true: true,
      blocking_failure: false,
    },
    crmOperations: [
      { tool: 'draft_email', result: { success: true, content: 'Subject: Next steps' } },
    ],
    citations: [],
    response: 'Subject: Next steps',
    clarificationNeeded: false,
  });

  assert.equal(groundingState, 'advisory_only');
});

test('buildGroundedFailureMessage returns actionable no-results text', () => {
  const message = buildGroundedFailureMessage('no_results', {
    toolsRan: ['search_crm'],
  });

  assert.match(message, /found no matching records|could not find/i);
});

test('buildGroundedFailureMessage returns actionable failure text', () => {
  const message = buildGroundedFailureMessage('failure', {
    toolErrors: ['search_crm'],
  });

  assert.match(message, /couldn't verify|encountered an error/i);
});
