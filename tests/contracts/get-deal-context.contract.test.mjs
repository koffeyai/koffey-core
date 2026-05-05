import test from 'node:test';
import assert from 'node:assert/strict';
import getDealContext from '../../supabase/functions/unified-chat/skills/context/get-deal-context.ts';

class FakeQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.orExpr = '';
  }

  select() { return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  or(expr) {
    this.orExpr = expr;
    return this;
  }
  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }
  resolve() {
    if (this.table === 'deals' && this.orExpr.includes('Cycle Opportunity CYCLE-123')) {
      return Promise.resolve({
        data: [{ id: this.state.dealId, name: 'Cycle Opportunity CYCLE-123', amount: 45000, stage: 'negotiation' }],
        error: null,
      });
    }
    if (this.table === 'accounts') return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: [], error: null });
  }
}

function fakeSupabase() {
  const state = {
    dealId: '11111111-1111-4111-8111-111111111111',
    rpcArgs: null,
  };

  return {
    state,
    from(table) {
      return new FakeQuery(table, state);
    },
    rpc(name, args) {
      assert.equal(name, 'get_deal_context_for_llm');
      state.rpcArgs = args;
      return Promise.resolve({
        data: { deal: { id: args.p_deal_id, name: 'Cycle Opportunity CYCLE-123' } },
        error: null,
      });
    },
  };
}

test('get_deal_context treats non-UUID deal_id arguments as names before RPC', async () => {
  const supabase = fakeSupabase();

  const result = await getDealContext.execute({
    args: { deal_id: 'Cycle Opportunity CYCLE-123' },
    supabase,
    organizationId: 'org-1',
  });

  assert.equal(result.__trusted_context, true);
  assert.equal(supabase.state.rpcArgs.p_deal_id, supabase.state.dealId);
});
