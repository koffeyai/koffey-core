import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import scheduleMeeting from '../../supabase/functions/unified-chat/skills/scheduling/schedule-meeting.ts';
import createCalendarEvent from '../../supabase/functions/unified-chat/skills/scheduling/create-calendar-event.ts';

const repoRoot = path.resolve(new URL('../../', import.meta.url).pathname);

function createSupabaseStub() {
  return {
    from(table) {
      const state = { table, filters: [] };
      const chain = {
        select() {
          return chain;
        },
        eq(column, value) {
          state.filters.push({ op: 'eq', column, value });
          return chain;
        },
        ilike(column, value) {
          state.filters.push({ op: 'ilike', column, value });
          return chain;
        },
        or(value) {
          state.filters.push({ op: 'or', value });
          return chain;
        },
        in(column, value) {
          state.filters.push({ op: 'in', column, value });
          return chain;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        insert() {
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

function createConfirmedSupabaseStub() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      const state = { table, filters: [] };
      const chain = {
        select() {
          return chain;
        },
        eq(column, value) {
          state.filters.push({ column, value });
          return chain;
        },
        maybeSingle() {
          if (table === 'contacts') {
            return Promise.resolve({
              data: {
                id: 'contact-1',
                full_name: 'Jordan Buyer',
                email: 'buyer@example.com',
                company: 'acme',
                account_id: 'account-1',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload) {
          inserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

test('schedule_meeting asks for new-contact details when user supplies an unknown email', async () => {
  const result = await scheduleMeeting.execute({
    supabase: createSupabaseStub(),
    organizationId: 'org-1',
    userId: 'user-1',
    args: {
      meeting_type: 'call',
      deal_name: 'acme - $20K',
      account_name: 'acme',
      contact_email: 'qa.schedule.person.502@example.com',
    },
    traceId: 'trace-1',
  });

  assert.equal(result.success, false);
  assert.equal(result._needsInput, true);
  assert.equal(result.clarification_type, 'missing_contact_details');
  assert.equal(result.contact_email, 'qa.schedule.person.502@example.com');
  assert.deepEqual(result.missing, ['first_name', 'last_name', 'title']);
  assert.match(result.message, /first name, last name, title, and email/i);
  assert.match(result.message, /already have email: qa\.schedule\.person\.502@example\.com/i);
  assert.doesNotMatch(result.message, /Which contact should receive/i);
});

test('schedule_meeting confirmed flow logs activity without throwing on Supabase insert', async () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  globalThis.Deno = {
    env: {
      get(key) {
        return {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        }[key];
      },
    },
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/check-availability')) {
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    }
    if (String(url).includes('/send-scheduling-email')) {
      return new Response(JSON.stringify({ success: true, provider: 'resend' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const supabase = createConfirmedSupabaseStub();
    const result = await scheduleMeeting.execute({
      supabase,
      organizationId: 'org-1',
      userId: 'user-1',
      args: {
        meeting_type: 'call',
        contact_id: 'contact-1',
        confirmed: true,
      },
      confirmedByPendingWorkflow: true,
      traceId: 'trace-1',
    });

    assert.equal(result.success, true);
    assert.match(result.message, /Email sent to Jordan Buyer/);
    assert.equal(supabase.inserts.length, 1);
    assert.equal(supabase.inserts[0].table, 'activities');
    assert.equal(supabase.inserts[0].payload.contact_id, 'contact-1');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});

test('schedule_meeting ignores untrusted confirmed flag without a pending confirmation workflow', async () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  let emailSendCalls = 0;
  let calendarWriteCalls = 0;
  globalThis.Deno = {
    env: {
      get(key) {
        return {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        }[key];
      },
    },
  };
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/check-availability')) {
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    }
    if (href.includes('/send-scheduling-email')) {
      emailSendCalls += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (href.includes('googleapis.com/calendar')) {
      calendarWriteCalls += 1;
      return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const result = await scheduleMeeting.execute({
      supabase: createConfirmedSupabaseStub(),
      organizationId: 'org-1',
      userId: 'user-1',
      args: {
        meeting_type: 'call',
        contact_id: 'contact-1',
        confirmed: true,
      },
      traceId: 'trace-1',
    });

    assert.equal(result.success, true);
    assert.equal(result._needsConfirmation, true);
    assert.equal(result._confirmationType, 'schedule_meeting');
    assert.equal(emailSendCalls, 0);
    assert.equal(calendarWriteCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});

test('create_calendar_event ignores untrusted confirmed flag without a pending confirmation workflow', async () => {
  const originalFetch = globalThis.fetch;
  let calendarWriteCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('googleapis.com/calendar')) {
      calendarWriteCalls += 1;
      return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const result = await createCalendarEvent.execute({
      supabase: createSupabaseStub(),
      organizationId: 'org-1',
      userId: 'user-1',
      args: {
        title: 'Calendar Preview Hold',
        attendee_emails: ['calendar.preview@example.com'],
        start_time: '2026-05-07T13:00:00.000Z',
        duration_minutes: 30,
        confirmed: true,
      },
      traceId: 'trace-1',
    });

    assert.equal(result.success, true);
    assert.equal(result._needsConfirmation, true);
    assert.equal(result._confirmationType, 'calendar_event');
    assert.equal(calendarWriteCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('schedule_meeting preview uses ISO availability fields for selectable slots', async () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  const isoStart = '2026-05-07T18:00:00.000Z';
  globalThis.Deno = {
    env: {
      get(key) {
        return {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        }[key];
      },
    },
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/check-availability')) {
      return new Response(JSON.stringify({
        slots: [{
          date: '2026-05-07',
          dayLabel: 'Thursday, May 7',
          startTime: '2:00 PM',
          endTime: '2:30 PM',
          isoStart,
          isoEnd: '2026-05-07T18:30:00.000Z',
        }],
      }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const result = await scheduleMeeting.execute({
      supabase: createConfirmedSupabaseStub(),
      organizationId: 'org-1',
      userId: 'user-1',
      args: {
        meeting_type: 'call',
        contact_id: 'contact-1',
      },
      traceId: 'trace-1',
    });

    assert.equal(result.success, true);
    assert.equal(result._needsConfirmation, true);
    assert.equal(result.preview.suggested_start_iso, isoStart);
    assert.equal(result.preview.available_slots[0].start, isoStart);
    assert.doesNotMatch(result.message, /Invalid Date/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});

test('calendar scheduling refresh uses token string returned by shared helper', () => {
  const scheduleSource = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/skills/scheduling/schedule-meeting.ts'),
    'utf8',
  );
  const createEventSource = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/skills/scheduling/create-calendar-event.ts'),
    'utf8',
  );

  assert.doesNotMatch(scheduleSource, /refreshed\.accessToken/);
  assert.doesNotMatch(createEventSource, /refreshed\.accessToken/);
  assert.match(scheduleSource, /const accessToken = await refreshAccessToken/);
  assert.match(createEventSource, /const accessToken = await refreshAccessToken/);
});
