import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageContextPrompt,
  mergeActiveContextWithPageContext,
  mergeEntityContextWithPageContext,
  serializePageContextForCache,
} from '../../supabase/functions/unified-chat/context-utils.mjs';

test('buildPageContextPrompt includes authoritative deal action context', () => {
  const prompt = buildPageContextPrompt({
    dealId: 'deal-123',
    type: 'email',
    slotType: 'lunch',
  });

  assert.match(prompt, /PAGE CONTEXT/);
  assert.match(prompt, /deal_id: deal-123/);
  assert.match(prompt, /action_type: email/);
  assert.match(prompt, /slot_type: lunch/);
  assert.match(prompt, /without asking which deal/i);
});

test('mergeEntityContextWithPageContext promotes explicit UI deal context', () => {
  const merged = mergeEntityContextWithPageContext(
    {
      primaryEntity: { type: 'account', id: 'acct-9', name: 'Advance Acme' },
      referencedEntities: {
        accounts: [{ id: 'acct-9', name: 'Advance Acme' }],
      },
    },
    {
      dealId: 'deal-123',
      dealName: 'Advance Acme - TestDeal this week',
      type: 'email',
    }
  );

  assert.equal(merged.primaryEntity.type, 'deal');
  assert.equal(merged.primaryEntity.id, 'deal-123');
  assert.equal(merged.primaryEntity.name, 'Advance Acme - TestDeal this week');
  assert.equal(merged.referencedEntities.deals[0].id, 'deal-123');
});

test('mergeActiveContextWithPageContext resets last entity to the explicit deal', () => {
  const entityContext = mergeEntityContextWithPageContext(null, {
    dealId: 'deal-123',
    dealName: 'Advance Acme - TestDeal this week',
  });

  const merged = mergeActiveContextWithPageContext(
    {
      lastEntityType: 'accounts',
      lastEntityIds: ['acct-9'],
      lastEntityNames: ['Advance Acme'],
    },
    {
      dealId: 'deal-123',
      type: 'email',
    },
    entityContext
  );

  assert.equal(merged.lastEntityType, 'deals');
  assert.deepEqual(merged.lastEntityIds, ['deal-123']);
  assert.deepEqual(merged.lastEntityNames, ['Advance Acme - TestDeal this week']);
});

test('serializePageContextForCache stays stable for equivalent values', () => {
  const keyA = serializePageContextForCache({
    dealId: ' deal-123 ',
    dealName: 'Advance   Acme - TestDeal this week',
    type: 'EMAIL',
  });
  const keyB = serializePageContextForCache({
    dealId: 'deal-123',
    dealName: 'advance acme - testdeal this week',
    type: 'email',
  });

  assert.equal(keyA, keyB);
});
