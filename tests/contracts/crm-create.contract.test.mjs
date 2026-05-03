import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeCreateAccount,
  executeCreateDeal,
  initCrmCreateDeps,
  resolveFuzzyDate,
} from '../../supabase/functions/unified-chat/tools/crm-create.ts';

test('resolveFuzzyDate normalizes month/day input without a year', () => {
  assert.equal(
    resolveFuzzyDate('5/20', new Date('2026-04-20T12:00:00.000Z')),
    '2026-05-20',
  );
});

test('resolveFuzzyDate normalizes month/day/year input', () => {
  assert.equal(
    resolveFuzzyDate('05/20/2027', new Date('2026-04-20T12:00:00.000Z')),
    '2027-05-20',
  );
});

function installCreateDealDeps() {
  initCrmCreateDeps({
    triggerEmbedding: () => {},
    buildAccountEmbeddingText: () => '',
    buildContactEmbeddingText: () => '',
    buildDealEmbeddingText: () => '',
    normalizeStage: (raw, fallback = 'prospecting') => raw || fallback,
    findAccountByNameOrDomain: async (_supabase, accountName) => ({
      id: 'acct_1',
      name: accountName,
      matchType: 'exact',
    }),
    parseName: (name) => ({ firstName: name, lastName: '' }),
    extractDomain: () => null,
    extractRootDomain: () => null,
    isPublicDomain: () => false,
    isGenericEmail: () => false,
    findAccountByDomain: async () => null,
    determineContactStatus: () => 'open',
    createPersonalAccountName: (name) => `${name} Personal`,
  });
}

function installCreateDealDepsWithoutContactHelpers() {
  initCrmCreateDeps({
    triggerEmbedding: () => {},
    buildAccountEmbeddingText: () => '',
    buildContactEmbeddingText: () => '',
    buildDealEmbeddingText: () => '',
    normalizeStage: (raw, fallback = 'prospecting') => raw || fallback,
    findAccountByNameOrDomain: async (_supabase, accountName) => ({
      id: 'acct_1',
      name: accountName,
      matchType: 'exact',
    }),
  });
}

function createSupabaseMock({ contactSearchMatches = [], accountContacts = [] } = {}) {
  const state = {
    insertCalls: [],
    contactSearchMatches,
    accountContacts,
    existingAccounts: [],
    createdAccounts: [],
    contactsByEmail: [],
    createdContacts: [],
    createdDeals: [],
  };

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.ilikeFilters = [];
      this.orFilter = null;
      this.insertPayload = null;
    }

    select() { return this; }
    eq(field, value) { this.filters.push({ field, value }); return this; }
    ilike(field, value) { this.ilikeFilters.push({ field, value }); return this; }
    or(value) { this.orFilter = value; return this; }
    order() { return this; }
    limit() { return this; }

    insert(payload) {
      this.insertPayload = payload;
      state.insertCalls.push({ table: this.table, payload });
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
      if (this.insertPayload) {
        if (this.table === 'contacts') {
          const created = {
            id: `contact_created_${state.createdContacts.length + 1}`,
            full_name: this.insertPayload.full_name,
            email: this.insertPayload.email ?? null,
            company: this.insertPayload.company ?? null,
            account_id: this.insertPayload.account_id ?? null,
            contact_number: `C-${state.createdContacts.length + 1}`,
            status: this.insertPayload.status ?? 'open',
            ...this.insertPayload,
          };
          state.createdContacts.push(created);
          state.insertCalls.push({ table: this.table, payload: this.insertPayload });
          return { data: created, error: null };
        }
        if (this.table === 'deals') {
          const created = {
            id: `deal_created_${state.createdDeals.length + 1}`,
            name: this.insertPayload.name,
            amount: this.insertPayload.amount,
            stage: this.insertPayload.stage,
            deal_number: `D-${state.createdDeals.length + 1}`,
            expected_close_date: this.insertPayload.expected_close_date,
            ...this.insertPayload,
          };
          state.createdDeals.push(created);
          state.insertCalls.push({ table: this.table, payload: this.insertPayload });
          return { data: created, error: null };
        }
        if (this.table === 'accounts') {
          const created = {
            id: `account_created_${state.createdAccounts.length + 1}`,
            name: this.insertPayload.name,
            account_type: this.insertPayload.account_type ?? 'prospect',
            account_number: `A-${state.createdAccounts.length + 1}`,
            domain: this.insertPayload.domain ?? null,
            website: this.insertPayload.website ?? null,
            ...this.insertPayload,
          };
          state.createdAccounts.push(created);
          state.insertCalls.push({ table: this.table, payload: this.insertPayload });
          return { data: created, error: null };
        }
        return {
          data: null,
          error: { message: `unexpected insert into ${this.table}` },
        };
      }

      if (this.table === 'contacts') {
        const accountId = this.filters.find((filter) => filter.field === 'account_id')?.value ?? null;
        const emailFilter = this.ilikeFilters.find((filter) => filter.field === 'email')?.value ?? null;
        const idFilter = this.filters.find((filter) => filter.field === 'id')?.value ?? null;
        if (idFilter) {
          const created = state.createdContacts.find((contact) => contact.id === idFilter) || null;
          return { data: created, error: null };
        }
        if (emailFilter) {
          const normalized = String(emailFilter || '').toLowerCase();
          const existing = state.contactsByEmail.find((contact) => String(contact.email || '').toLowerCase() === normalized)
            || state.createdContacts.find((contact) => String(contact.email || '').toLowerCase() === normalized)
            || null;
          return { data: existing, error: null };
        }
        if (this.orFilter) {
          const matches = accountId ? state.contactSearchMatches : state.contactSearchMatches;
          return { data: matches, error: null };
        }
        if (accountId) {
          const createdForAccount = state.createdContacts.filter((contact) => contact.account_id === accountId);
          return { data: createdForAccount.length > 0 ? createdForAccount : state.accountContacts, error: null };
        }
      }

      if (this.table === 'deals') {
        const idFilter = this.filters.find((filter) => filter.field === 'id')?.value ?? null;
        if (idFilter) {
          const created = state.createdDeals.find((deal) => deal.id === idFilter) || null;
          return { data: created, error: null };
        }
      }

      if (this.table === 'accounts') {
        const idFilter = this.filters.find((filter) => filter.field === 'id')?.value ?? null;
        const domainFilter = this.filters.find((filter) => filter.field === 'domain')?.value ?? null;
        const nameFilter = this.ilikeFilters.find((filter) => filter.field === 'name')?.value ?? null;
        const allAccounts = [...state.createdAccounts, ...state.existingAccounts];

        if (idFilter) {
          const created = allAccounts.find((account) => account.id === idFilter) || null;
          return { data: created, error: null };
        }
        if (domainFilter) {
          const match = allAccounts.find((account) => account.domain === domainFilter) || null;
          return { data: match, error: null };
        }
        if (nameFilter) {
          const normalizedNeedle = String(nameFilter).replace(/%/g, '').toLowerCase();
          const match = allAccounts.find((account) =>
            String(account.name || '').toLowerCase().includes(normalizedNeedle),
          ) || null;
          return { data: match, error: null };
        }
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

test('executeCreateDeal asks for clarification when the provided contact does not match the account', async () => {
  installCreateDealDeps();
  const supabase = createSupabaseMock({
    contactSearchMatches: [],
    accountContacts: [
      { id: 'contact_1', full_name: 'Alice Smith', email: 'alice@example.com', company: 'Acme Corp', account_id: 'acct_1' },
      { id: 'contact_2', full_name: 'Bob Jones', email: 'bob@example.com', company: 'Acme Corp', account_id: 'acct_1' },
    ],
  });

  const result = await executeCreateDeal(
    supabase,
    {
      account_name: 'Acme Corp',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Pat',
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.match(result.message, /couldn't match "Pat" to a contact at Acme Corp/i);
  assert.match(result.message, /Alice Smith/);
  assert.match(result.message, /Which one should I use as the primary contact/i);
  assert.equal(supabase.state.insertCalls.length, 0);
});

test('executeCreateDeal creates a missing contact even when contact helper deps were not initialized', async () => {
  installCreateDealDepsWithoutContactHelpers();
  const supabase = createSupabaseMock({
    contactSearchMatches: [],
    accountContacts: [],
  });

  const result = await executeCreateDeal(
    supabase,
    {
      account_name: 'Acme Corp',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Pat Rivera',
      contact_email: 'pat.rivera@example.com',
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.entity, 'deal');
  assert.equal(result.contact_created, true);
  assert.equal(result.contact_name, 'Pat Rivera');
  assert.equal(supabase.state.createdContacts.length, 1);
  assert.equal(supabase.state.createdContacts[0].status, 'lead');
  assert.equal(supabase.state.createdDeals.length, 1);
});

test('executeCreateDeal asks for disambiguation when multiple contacts match', async () => {
  installCreateDealDeps();
  const supabase = createSupabaseMock({
    contactSearchMatches: [
      { id: 'contact_1', full_name: 'Sarah Chen', email: 'sarah.chen@example.com', company: 'Acme Corp', account_id: 'acct_1' },
      { id: 'contact_2', full_name: 'Sarah Patel', email: 'sarah.patel@example.com', company: 'Acme Corp', account_id: 'acct_1' },
    ],
  });

  const result = await executeCreateDeal(
    supabase,
    {
      account_name: 'Acme Corp',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Sarah',
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.match(result.message, /multiple contacts matching "Sarah" at Acme Corp/i);
  assert.match(result.message, /Sarah Chen/);
  assert.match(result.message, /Sarah Patel/);
  assert.equal(supabase.state.insertCalls.length, 0);
});

test('executeCreateDeal creates a missing contact when the user provides a full name and email', async () => {
  installCreateDealDeps();
  const supabase = createSupabaseMock({
    contactSearchMatches: [],
    accountContacts: [],
  });

  const result = await executeCreateDeal(
    supabase,
    {
      account_name: 'Acme Corp',
      amount: 20000,
      close_date: '2026-05-20',
      contact_name: 'Pat Rivera',
      contact_email: 'pat.rivera@example.com',
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.entity, 'deal');
  assert.equal(result.contact_created, true);
  assert.equal(result.contact_name, 'Pat Rivera');
  assert.equal(supabase.state.createdContacts.length, 1);
  assert.equal(supabase.state.createdContacts[0].email, 'pat.rivera@example.com');
  assert.equal(supabase.state.createdDeals.length, 1);
  assert.equal(supabase.state.createdDeals[0].contact_id, supabase.state.createdContacts[0].id);
});

test('executeCreateDeal asks for a close date before creating an unforecastable deal', async () => {
  installCreateDealDeps();
  const supabase = createSupabaseMock({
    contactSearchMatches: [],
    accountContacts: [],
  });

  const result = await executeCreateDeal(
    supabase,
    {
      account_name: 'Example Cloud',
      amount: 6000,
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.success, false);
  assert.equal(result.entity, 'deal');
  assert.equal(result._needsInput, true);
  assert.match(result.message, /expected close date/i);
  assert.equal(supabase.state.createdDeals.length, 0);
});

test('executeCreateAccount treats a domain-only name as enrichment context', async () => {
  installCreateDealDeps();
  const supabase = createSupabaseMock();

  const result = await executeCreateAccount(
    supabase,
    {
      name: 'example-cloud.test',
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.entity, 'account');
  assert.equal(supabase.state.createdAccounts.length, 1);
  assert.equal(supabase.state.createdAccounts[0].name, 'Example Cloud');
  assert.equal(supabase.state.createdAccounts[0].domain, 'example-cloud.test');
  assert.equal(supabase.state.createdAccounts[0].website, 'https://example-cloud.test');
});

test('executeCreateAccount preserves explicit company name while normalizing website/domain', async () => {
  installCreateDealDeps();
  const supabase = createSupabaseMock();

  const result = await executeCreateAccount(
    supabase,
    {
      name: 'Example Cloud',
      website: 'example-cloud.test',
    },
    'org_1',
    'user_1',
  );

  assert.equal(result.entity, 'account');
  assert.equal(supabase.state.createdAccounts.length, 1);
  assert.equal(supabase.state.createdAccounts[0].name, 'Example Cloud');
  assert.equal(supabase.state.createdAccounts[0].domain, 'example-cloud.test');
  assert.equal(supabase.state.createdAccounts[0].website, 'https://example-cloud.test');
});
