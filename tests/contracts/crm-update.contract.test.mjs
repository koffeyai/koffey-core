import test from 'node:test';
import assert from 'node:assert/strict';
import { executeUpdateDeal } from '../../supabase/functions/unified-chat/tools/crm-update.ts';

function createDealsMock(existingDeal) {
  let mode = 'select';
  let updatePayload = null;

  const chain = {
    select() {
      mode = 'select';
      return this;
    },
    update(payload) {
      mode = 'update';
      updatePayload = payload;
      return this;
    },
    eq() {
      return this;
    },
    ilike() {
      return this;
    },
    limit() {
      return this;
    },
    order() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data: existingDeal, error: null });
    },
    then(resolve, reject) {
      if (mode === 'update') {
        return Promise.resolve({ error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: existingDeal, error: null }).then(resolve, reject);
    },
  };

  return {
    from(table) {
      assert.equal(table, 'deals');
      return chain;
    },
    get updatePayload() {
      return updatePayload;
    },
  };
}

test('executeUpdateDeal asks for confirmation before overwriting an existing amount', async () => {
  const supabase = createDealsMock({
    id: 'deal-1',
    name: 'Apex Expansion',
    amount: 175000,
    stage: 'prospecting',
    expected_close_date: '2026-04-01',
  });

  const result = await executeUpdateDeal(
    supabase,
    {
      deal_id: 'deal-1',
      updates: { amount: 500000 },
    },
    'org-1',
    'user-1',
  );

  assert.equal(result.success, false);
  assert.equal(result._needsConfirmation, true);
  assert.equal(result._confirmationType, 'update_deal_conflict');
  assert.match(result.message, /Apex Expansion/);
  assert.match(result.message, /Amount: \$175,000 -> \$500,000/);
  assert.equal(supabase.updatePayload, null);
});

test('executeUpdateDeal proceeds after explicit confirmation', async () => {
  const supabase = createDealsMock({
    id: 'deal-1',
    name: 'Apex Expansion',
    amount: 175000,
    stage: 'prospecting',
    expected_close_date: '2026-04-01',
  });

  const result = await executeUpdateDeal(
    supabase,
    {
      deal_id: 'deal-1',
      confirmed: true,
      updates: { amount: 500000 },
    },
    'org-1',
    'user-1',
  );

  assert.equal(result.success, true);
  assert.match(result.message, /Apex Expansion/);
  assert.deepEqual(supabase.updatePayload.amount, 500000);
});
