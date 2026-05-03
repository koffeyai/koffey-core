import test from 'node:test';
import assert from 'node:assert/strict';

import manageSequence from '../../supabase/functions/unified-chat/skills/sequences/manage-sequence.ts';

function createSupabaseMock({
  sequences = [],
  contacts = [],
} = {}) {
  const state = {
    sequences,
    contacts,
    sessionUpdates: [],
    enrollments: [],
  };

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.ilikeFilters = [];
      this.updatePayload = null;
      this.insertPayload = null;
      this.limitValue = null;
    }

    select() { return this; }
    eq(field, value) { this.filters.push({ field, value }); return this; }
    ilike(field, value) { this.ilikeFilters.push({ field, value }); return this; }
    order() { return this; }
    limit(value) { this.limitValue = value; return this; }

    update(payload) {
      this.updatePayload = payload;
      return this;
    }

    insert(payload) {
      this.insertPayload = payload;
      return this;
    }

    async maybeSingle() {
      const result = await this._execute();
      const row = Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
      return { data: row, error: result.error ?? null };
    }

    async single() {
      const result = await this._execute();
      const row = Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
      return { data: row, error: result.error ?? null };
    }

    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }

    async _execute() {
      if (this.updatePayload) {
        if (this.table === 'chat_sessions' || this.table === 'messaging_sessions') {
          state.sessionUpdates.push(this.updatePayload);
          return { data: [{ id: this.filters.find((filter) => filter.field === 'id')?.value || 'session_1', ...this.updatePayload }], error: null };
        }
        if (this.table === 'sequence_enrollments') {
          return { data: [], error: null };
        }
      }

      if (this.insertPayload) {
        if (this.table === 'sequence_enrollments') {
          const created = {
            id: `enrollment_${state.enrollments.length + 1}`,
            ...this.insertPayload,
          };
          state.enrollments.push(created);
          return { data: created, error: null };
        }
        return { data: null, error: null };
      }

      if (this.table === 'sequences') {
        let results = [...state.sequences];
        for (const filter of this.filters) {
          if (filter.field === 'organization_id') {
            results = results.filter((row) => row.organization_id === filter.value);
          }
          if (filter.field === 'id') {
            results = results.filter((row) => row.id === filter.value);
          }
        }
        for (const filter of this.ilikeFilters) {
          const pattern = String(filter.value || '').toLowerCase().replace(/%/g, '');
          results = results.filter((row) => String(row[filter.field] || '').toLowerCase().includes(pattern));
        }
        if (typeof this.limitValue === 'number') results = results.slice(0, this.limitValue);
        return { data: results, error: null };
      }

      if (this.table === 'contacts') {
        let results = [...state.contacts];
        for (const filter of this.filters) {
          if (filter.field === 'organization_id') {
            results = results.filter((row) => row.organization_id === filter.value);
          }
          if (filter.field === 'id') {
            results = results.filter((row) => row.id === filter.value);
          }
        }
        for (const filter of this.ilikeFilters) {
          const pattern = String(filter.value || '').toLowerCase().replace(/%/g, '');
          results = results.filter((row) => String(row[filter.field] || '').toLowerCase().includes(pattern));
        }
        if (typeof this.limitValue === 'number') results = results.slice(0, this.limitValue);
        return { data: results, error: null };
      }

      if (this.table === 'sequence_enrollments') {
        return { data: [], error: null };
      }

      return { data: [], error: null };
    }
  }

  return {
    state,
    from(table) {
      return new QueryBuilder(table);
    },
  };
}

test('manage_sequence asks for contact clarification instead of failing when multiple contacts match', async () => {
  const supabase = createSupabaseMock({
    sequences: [
      {
        id: 'seq_1',
        organization_id: 'org_1',
        name: 'Follow-up Sequence',
        steps: [{ step_number: 1, delay_days: 0, channel: 'email' }],
      },
    ],
    contacts: [
      {
        id: 'contact_1',
        organization_id: 'org_1',
        full_name: 'Pat Rivera',
        email: 'pat.rivera@example.com',
        company: 'Acme Corp',
        accounts: { name: 'Acme Corp' },
      },
      {
        id: 'contact_2',
        organization_id: 'org_1',
        full_name: 'Pat Smith',
        email: 'pat@acme.example',
        company: 'Acme',
        accounts: { name: 'Acme' },
      },
    ],
  });

  const result = await manageSequence.execute({
    supabase,
    organizationId: 'org_1',
    userId: 'user_1',
    sessionId: 'session_1',
    sessionTable: 'chat_sessions',
    args: {
      action: 'enroll',
      sequence_id: 'seq_1',
      contact_name: 'Pat',
    },
  });

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.match(result.message, /multiple contacts matching "Pat"/i);
  assert.match(result.message, /Follow-up Sequence/i);
  assert.equal(supabase.state.sessionUpdates.length, 1);
  assert.deepEqual(supabase.state.sessionUpdates[0].pending_sequence_action, {
    action: 'enroll',
    sequence_id: 'seq_1',
    sequence_name: 'Follow-up Sequence',
    contact_name: 'Pat',
    contact_email: null,
    confirmation_type: 'contact_resolution',
  });
});
