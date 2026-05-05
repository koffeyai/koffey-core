import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCreateTask } from '../../supabase/functions/unified-chat/tools/tasks-activities.ts';

class FakeQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = {};
    this.orExpr = '';
    this.insertPayload = null;
  }

  select() { return this; }
  order() { return this; }
  limit() { return this; }
  eq(column, value) {
    this.filters[column] = value;
    return this;
  }
  or(expr) {
    this.orExpr = expr;
    return this;
  }
  in() { return this; }
  insert(payload) {
    this.insertPayload = payload;
    this.state.insertedTask = payload;
    return this;
  }
  maybeSingle() {
    if (this.table === 'deals' && this.filters.id === this.state.deal.id) {
      return Promise.resolve({ data: this.state.deal, error: null });
    }
    if (this.table === 'contacts' && this.filters.id === this.state.contact.id) {
      return Promise.resolve({ data: this.state.contact, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }
  single() {
    if (this.table === 'tasks') {
      return Promise.resolve({
        data: { id: 'task-1', title: this.insertPayload.title, due_date: this.insertPayload.due_date },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }
  resolve() {
    if (this.table === 'deals' && this.orExpr.includes('Example Labs')) {
      return Promise.resolve({ data: [this.state.deal], error: null });
    }
    if (this.table === 'accounts') {
      return Promise.resolve({ data: [], error: null });
    }
    return Promise.resolve({ data: [], error: null });
  }
}

function createFakeSupabase() {
  const state = {
    tables: [],
    insertedTask: null,
    deal: {
      id: 'deal-1',
      name: 'Example Labs - $35K',
      account_id: 'account-1',
      contact_id: 'contact-1',
      accounts: { name: 'Example Labs' },
    },
    contact: {
      id: 'contact-1',
      full_name: 'Casey Cycle',
      account_id: 'account-1',
    },
  };

  return {
    state,
    from(table) {
      state.tables.push(table);
      return new FakeQuery(table, state);
    },
  };
}

test('executeCreateTask prefers explicit UI deal context over extracted account text', async () => {
  const supabase = createFakeSupabase();

  const result = await executeCreateTask(
    supabase,
    {
      title: 'Follow up',
      account_name: 'Example Labs - $35K: Focus on advancing Example Labs to discovery',
    },
    'org-1',
    'user-1',
    {
      primaryEntity: { type: 'deal', name: 'Example Labs - $35K' },
      referencedEntities: { deals: [{ name: 'Example Labs - $35K' }] },
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.deal_id, 'deal-1');
  assert.equal(supabase.state.insertedTask.deal_id, 'deal-1');
  assert.equal(supabase.state.tables.includes('accounts'), false);
});

test('executeCreateTask falls back to the deal primary contact when no task contact resolves', async () => {
  const supabase = createFakeSupabase();

  const result = await executeCreateTask(
    supabase,
    {
      title: 'Follow up with Casey Cycle',
      deal_name: 'Example Labs',
      due_date: '2026-05-12',
      priority: 'high',
    },
    'org-1',
    'user-1',
  );

  assert.equal(result.success, true);
  assert.equal(result.contact_id, 'contact-1');
  assert.equal(supabase.state.insertedTask.contact_id, 'contact-1');
  assert.equal(supabase.state.insertedTask.priority, 'high');
});
