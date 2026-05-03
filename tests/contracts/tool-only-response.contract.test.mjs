import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolOnlyResponse } from '../../supabase/functions/unified-chat/gateway/tool-only-response.mjs';

test('tool-only response includes retrieved row details', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'search_crm',
      result: {
        entity_type: 'deals',
        results: [
          {
            name: 'QA Calendar Two-Way Sync Deal',
            stage: 'prospecting',
            amount: 12000,
          },
        ],
      },
    },
  ]);

  assert.match(response, /QA Calendar Two-Way Sync Deal/);
  assert.match(response, /prospecting/);
  assert.match(response, /\$12,000/);
});

test('tool-only response preserves task result message', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'get_tasks',
      result: {
        count: 1,
        message: '**Next Steps**\n\n1. QA Calendar Call - due tomorrow',
      },
    },
  ]);

  assert.match(response, /Next Steps/);
  assert.match(response, /QA Calendar Call/);
});

test('tool-only response includes deal stakeholders and power-rank labels', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'get_deal_context',
      result: {
        deal: {
          id: 'deal_1',
          name: 'acme - $20K',
          amount: 20000,
          stage: 'qualified',
          probability: 20,
          close_date: '2026-05-19',
        },
        account: { id: 'account_1', name: 'acme' },
        stakeholders: [
          {
            id: 'contact_1',
            name: 'Pat Rivera',
            role_in_deal: 'champion',
            quadrant: 'champion_influential',
          },
          {
            id: 'contact_2',
            name: 'Finance Reviewer',
            quadrant: 'adversarial_peripheral',
          },
        ],
      },
    },
  ]);

  assert.match(response, /Deal context: acme - \$20K/);
  assert.match(response, /Pat Rivera - champion - Champion \(Influential\)/);
  assert.match(response, /Finance Reviewer - Tactical Blocker \(Peripheral\)/);
});

test('tool-only response summarizes multiple matching deal contexts', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'get_deal_context',
      result: {
        success: true,
        multiple_deals: true,
        label: 'acme',
        deals: [
          {
            id: 'deal_1',
            name: 'acme - $35K',
            amount: 35000,
            stage: 'prospecting',
            probability: 20,
            stakeholders: [
              { id: 'contact_1', name: 'Pat Rivera', quadrant: 'champion_influential' },
            ],
          },
          {
            id: 'deal_2',
            name: 'acme - $20K',
            amount: 20000,
            stage: 'qualified',
            probability: 20,
            stakeholders: [],
          },
        ],
      },
    },
  ]);

  assert.match(response, /2 matching opportunities for acme/);
  assert.match(response, /acme - \$35K/);
  assert.match(response, /Pat Rivera - Champion \(Influential\)/);
  assert.match(response, /acme - \$20K/);
  assert.match(response, /no stakeholders linked yet/);
});

test('tool-only response prefers cited task rows over canned task message', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'get_tasks',
      result: {
        count: 1,
        message: '**Next Steps for Uncited Account -> QA Deal**',
        tasks: [
          {
            title: 'QA Calendar Call - CRM to Google',
            due_date: '2026-04-26',
          },
        ],
      },
    },
  ]);

  assert.match(response, /QA Calendar Call - CRM to Google/);
  assert.doesNotMatch(response, /Uncited Account/);
});

test('tool-only response formats created records as useful action summaries', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'create_deal',
      result: {
        id: 'deal_1',
        entity: 'deal',
        name: 'Example Cloud - $6K',
        amount: 6000,
        stage: 'prospecting',
        expected_close_date: '2026-07-20',
        success: true,
      },
    },
  ]);

  assert.match(response, /Created opportunity/);
  assert.match(response, /Example Cloud - \$6K/);
  assert.match(response, /\$6,000/);
  assert.match(response, /prospecting/);
});

test('tool-only response shows enrichment details for created accounts', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'create_account',
      result: {
        id: 'account_1',
        entity: 'account',
        name: 'Example Labs',
        industry: 'Web3 / Crypto',
        enrichment_applied: true,
        success: true,
      },
    },
  ]);

  assert.match(response, /Created account/);
  assert.match(response, /Example Labs/);
  assert.match(response, /Web3 \/ Crypto/);
  assert.match(response, /enriched from website/);
});

test('tool-only response formats delete results with change-log language', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'delete_deal',
      result: {
        id: 'deal_1',
        entity: 'deal',
        action: 'deleted',
        name: 'Acme Corp - $20K',
        success: true,
      },
    },
  ]);

  assert.match(response, /Deletion status/);
  assert.match(response, /Acme Corp - \$20K/);
  assert.match(response, /change log/);
});

test('tool-only response gives manager-style pipeline review when synthesis is unavailable', () => {
  const response = buildToolOnlyResponse([
    {
      tool: 'get_pipeline_context',
      result: {
        summary: { total_deals: 2, total_value: 26000, weighted_value: 5200 },
        at_risk: [
          {
            id: 'deal_1',
            name: 'QA Pipeline Labs - $18K',
            amount: 18000,
            stage: 'prospecting',
            expected_close_date: '2026-07-31',
          },
        ],
      },
    },
  ], 'review my active pipeline like my VP of Sales and tell me the highest-risk deal');

  assert.match(response, /Pipeline review/);
  assert.match(response, /Highest-risk focus/);
  assert.match(response, /QA Pipeline Labs - \$18K/);
  assert.match(response, /Exact buyer question/);
});
