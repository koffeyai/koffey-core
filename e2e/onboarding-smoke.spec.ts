import { expect, test, type Page, type Route } from '@playwright/test';

const SUPABASE_URL = 'https://smoke.supabase.co';
const AUTH_STORAGE_KEY = 'sb-smoke-auth-token';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_EMAIL = 'founder@example.com';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function isOptions(route: Route): boolean {
  return route.request().method() === 'OPTIONS';
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders,
    body: JSON.stringify(body),
  });
}

async function fulfillNoRows(route: Route) {
  await fulfillJson(route, 406, {
    code: 'PGRST116',
    details: 'The result contains 0 rows',
    hint: null,
    message: 'JSON object requested, multiple (or no) rows returned',
  });
}

async function mockHandleAuth(page: Page) {
  await page.route('**/functions/v1/handle-auth*', async (route) => {
    if (isOptions(route)) {
      await fulfillJson(route, 200, {});
      return;
    }

    await fulfillJson(route, 200, {
      action: 'create_org',
      isNewDomain: true,
    });
  });
}

async function mockProfileLookupAsNoUser(page: Page) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (isOptions(route)) {
      await fulfillJson(route, 200, {});
      return;
    }

    await fulfillNoRows(route);
  });
}

async function mockProfileLookupAsCurrentUser(page: Page) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (isOptions(route)) {
      await fulfillJson(route, 200, {});
      return;
    }

    await fulfillJson(route, 200, {
      id: USER_ID,
      email: USER_EMAIL,
      full_name: 'Founder Example',
    });
  });
}

async function mockSignupWithoutSession(page: Page) {
  await page.route('**/auth/v1/signup*', async (route) => {
    if (isOptions(route)) {
      await fulfillJson(route, 200, {});
      return;
    }

    await fulfillJson(route, 200, {
      user: {
        id: USER_ID,
        email: USER_EMAIL,
        email_confirmed_at: null,
      },
    });
  });
}

async function mockGoogleCalendarAsDisconnected(page: Page) {
  await page.route('**/rest/v1/google_tokens*', async (route) => {
    if (isOptions(route)) {
      await fulfillJson(route, 200, {});
      return;
    }

    await fulfillNoRows(route);
  });
}

function buildSession() {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: USER_EMAIL,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

test('preserves organization intent when signup requires email confirmation', async ({ page }) => {
  await mockProfileLookupAsNoUser(page);
  await mockHandleAuth(page);
  await mockSignupWithoutSession(page);

  await page.goto('/signup');

  await expect(page.getByRole('heading', { name: 'Create your Koffey account' })).toBeVisible();
  await page.getByLabel('First Name').fill('Founder');
  await page.getByLabel('Last Name').fill('Example');
  await page.getByLabel('Email').fill(USER_EMAIL);
  await page.locator('#password').fill('Password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Create Your Organization' })).toBeVisible();
  await page.getByLabel('Organization Name').fill('Example Co');
  await page.getByRole('button', { name: 'Create Organization' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(
    page.getByText('Confirm your email, then sign in to finish creating Example Co.', { exact: true })
  ).toBeVisible();

  const pendingOrg = await page.evaluate(() => window.localStorage.getItem('koffey_pending_org_setup'));
  expect(pendingOrg).not.toBeNull();
  expect(JSON.parse(pendingOrg || '{}')).toEqual({
    orgName: 'Example Co',
    domain: 'example.com',
  });
});

test('lets an authenticated user finish organization setup and continue to onboarding', async ({ page }) => {
  let createOrgRequestBody: Record<string, unknown> | null = null;
  let createOrgAuthorization: string | null = null;

  await page.addInitScript((session) => {
    window.localStorage.setItem('sb-smoke-auth-token', JSON.stringify(session));
    window.localStorage.setItem(
      'koffey_pending_org_setup',
      JSON.stringify({ orgName: 'Example Co', domain: 'example.com' })
    );
  }, buildSession());

  await mockProfileLookupAsCurrentUser(page);
  await mockGoogleCalendarAsDisconnected(page);
  await page.route('**/functions/v1/create-org-with-user*', async (route) => {
    if (isOptions(route)) {
      await fulfillJson(route, 200, {});
      return;
    }

    const rawBody = route.request().postData() || '{}';
    createOrgRequestBody = JSON.parse(rawBody) as Record<string, unknown>;
    createOrgAuthorization = route.request().headers().authorization ?? null;
    await fulfillJson(route, 200, { orgId: 'org_smoke_1' });
  });

  await page.goto('/organization-setup');

  await expect(page.getByRole('heading', { name: 'Create Your Organization' })).toBeVisible();
  await expect(page.getByLabel('Organization Name')).toHaveValue('Example Co');
  await page.getByRole('button', { name: 'Create Organization' }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: "Let's populate your CRM" })).toBeVisible();

  expect(createOrgRequestBody).toMatchObject({
    userId: USER_ID,
    orgName: 'Example Co',
    domain: 'example.com',
  });
  expect(createOrgAuthorization).toBe('Bearer test-access-token');

  const pendingOrg = await page.evaluate(() => window.localStorage.getItem('koffey_pending_org_setup'));
  expect(pendingOrg).toBeNull();
  const authSession = await page.evaluate(() => window.localStorage.getItem('sb-smoke-auth-token'));
  expect(authSession).not.toBeNull();
});
