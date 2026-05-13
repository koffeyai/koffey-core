import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function readFunction(name) {
  return fs.readFileSync(path.join(repoRoot, `supabase/functions/${name}/index.ts`), 'utf8');
}

function readConfig() {
  return fs.readFileSync(path.join(repoRoot, 'supabase/config.toml'), 'utf8');
}

test('only documented public callback functions disable gateway JWT verification', () => {
  const config = readConfig();
  const publicFunctions = new Set([
    'handle-auth',
    'validate-invite',
    'google-oauth',
    'whatsapp-adapter',
    'telegram-adapter',
    'google-calendar-webhook',
  ]);
  const functionBlocks = [...config.matchAll(/^\[functions\.([^\]]+)\]\nverify_jwt\s*=\s*(true|false)/gm)];
  const disabled = functionBlocks
    .filter(([, , value]) => value === 'false')
    .map(([, name]) => name)
    .sort();

  assert.deepEqual(disabled, [...publicFunctions].sort());
  assert.ok(functionBlocks.length >= 40, 'expected Supabase function auth config blocks to be parsed');
});

test('extraction-agent requires JWT auth and organization membership before LLM extraction', () => {
  const source = readFunction('extraction-agent');

  assert.match(source, /authenticateRequest\(req\)/);
  assert.match(source, /resolveAuthorizedOrganization\(auth\.supabase,\s*auth\.userId,\s*organizationId\)/);
  assert.match(source, /error instanceof AuthError/);
  assert.ok(source.indexOf('authenticateRequest(req)') < source.indexOf('callWithFallback({'));
});

test('deal-coaching uses authenticated JWT user for rate limits and organization access', () => {
  const source = readFunction('deal-coaching');

  assert.match(source, /authenticateRequest\(req\)/);
  assert.match(source, /const authenticatedUserId = auth\.userId/);
  assert.match(source, /checkRateLimit\(`deal-coaching:\$\{authenticatedUserId\}`/);
  assert.match(source, /validateOrganizationAccess\(supabase,\s*authenticatedUserId,\s*organizationId\)/);
  assert.match(source, /logCoachingSession\(dealData,\s*result,\s*organizationId,\s*authenticatedUserId\)/);
  assert.doesNotMatch(source, /userId:\s*reqUserId/);
});

test('export-backup rejects missing or invalid JWTs before exporting data', () => {
  const source = readFunction('export-backup');

  assert.match(source, /!authHeader\.startsWith\("Bearer "\)/);
  assert.match(source, /status:\s*401/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /authError\s*\|\|\s*!user/);
  assert.ok(source.indexOf('supabase.auth.getUser()') < source.indexOf('const { tables } = await req.json()'));
});

test('database-search only uses service role fallback for internal calls', () => {
  const source = readFunction('database-search');

  assert.match(source, /isInternalServiceCall\(req\)/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /String\(user\.id\)\s*!==\s*String\(userId\)/);
  assert.match(source, /if \(!internalCall\)/);
  assert.ok(
    source.indexOf('if (!internalCall)') < source.indexOf('Fallback: Service role + manual organization filter'),
    'external callers must be rejected before the service role fallback'
  );
});

test('grounded-validator never forwards the service role key as a user token', () => {
  const source = readFunction('grounded-validator');

  assert.match(source, /const serviceRoleKey = Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.match(source, /token\.startsWith\('eyJ'\) && token !== serviceRoleKey/);
  assert.match(source, /forwardedToken && forwardedToken !== serviceRoleKey/);
});

test('internal service functions reject external callers before service-role side effects', () => {
  const invitation = readFunction('send-invitation-email');
  const router = readFunction('notification-router');

  for (const source of [invitation, router]) {
    assert.match(source, /isInternalServiceCall\(req\)/);
    assert.match(source, /Unauthorized: internal service call required/);
    assert.ok(
      source.indexOf('isInternalServiceCall(req)') < source.indexOf('SUPABASE_SERVICE_ROLE_KEY'),
      'internal auth guard must run before creating a service role client'
    );
  }
});

test('slide generation binds request identity to the authenticated user', () => {
  const source = readFunction('generate-ai-slides');

  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /userId:\s*requestedUserId/);
  assert.match(source, /requestedUserId && requestedUserId !== authenticatedUser\.id/);
  assert.match(source, /const userId = authenticatedUser\.id/);
  assert.match(source, /validateOrganizationAccess\(supabase,\s*authenticatedUser\.id,\s*organizationId\)/);
});

test('public provider callbacks validate provider identifiers or signatures', () => {
  const whatsapp = readFunction('whatsapp-adapter');
  const googleWebhook = readFunction('google-calendar-webhook');

  assert.match(whatsapp, /handleStatusCallback/);
  assert.match(whatsapp, /validateTwilioSignature\(req,\s*bodyText\)/);
  assert.match(googleWebhook, /processNotification\(channelId,\s*resourceId,\s*resourceState\)/);
  assert.match(googleWebhook, /\.eq\('resource_id',\s*resourceId\)/);
  assert.match(googleWebhook, /\.eq\('status',\s*'active'\)/);
});
