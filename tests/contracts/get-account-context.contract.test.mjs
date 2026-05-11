import test from 'node:test';
import assert from 'node:assert/strict';
import getAccountContext from '../../supabase/functions/unified-chat/skills/context/get-account-context.ts';

class FakeQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.orExpr = '';
  }

  select() { return this; }
  eq() { return this; }
  limit() { return this; }
  or(expr) {
    this.orExpr = expr;
    return this;
  }
  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }
  resolve() {
    if (this.table === 'accounts' && this.orExpr.includes('Northstar Robotics')) {
      return Promise.resolve({
        data: [{ id: this.state.accountId, name: 'Northstar Robotics', industry: 'Robotics', domain: 'northstar.example' }],
        error: null,
      });
    }
    return Promise.resolve({ data: [], error: null });
  }
}

function fakeSupabase() {
  const state = {
    accountId: '22222222-2222-4222-8222-222222222222',
    rpcArgs: null,
  };

  return {
    state,
    from(table) {
      return new FakeQuery(table, state);
    },
    rpc(name, args) {
      assert.equal(name, 'get_account_context_for_llm');
      state.rpcArgs = args;
      return Promise.resolve({
        data: {
          account: { id: args.p_account_id, name: 'Northstar Robotics' },
          deal_summary: { total_deals: 1, open_deals: 1, open_pipeline_value: 75000 },
          contacts: [],
          deals: [],
          recent_activities: [],
          open_tasks: [],
          recent_email_messages: [],
        },
        error: null,
      });
    },
  };
}

test('get_account_context treats non-UUID account_id arguments as names before RPC', async () => {
  const supabase = fakeSupabase();

  const result = await getAccountContext.execute({
    args: { account_id: 'Northstar Robotics' },
    supabase,
    organizationId: 'org-1',
  });

  assert.equal(result.__trusted_context, true);
  assert.equal(result.account.name, 'Northstar Robotics');
  assert.equal(supabase.state.rpcArgs.p_account_id, supabase.state.accountId);
  assert.equal(supabase.state.rpcArgs.p_organization_id, 'org-1');
});

test('get_account_context asks for an account when no target is available', async () => {
  const supabase = fakeSupabase();

  const result = await getAccountContext.execute({
    args: {},
    supabase,
    organizationId: 'org-1',
  });

  assert.equal(result.success, false);
  assert.match(result.message, /Which account/);
  assert.equal(supabase.state.rpcArgs, null);
});
