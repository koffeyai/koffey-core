#!/usr/bin/env node

/**
 * Koffey doctor — safe deployment preflight.
 *
 * Checks local env, project targeting, reachable Supabase endpoints, deployed
 * Google OAuth status, and prints the remaining dashboard checklist items.
 * It never prints secret values and does not mutate local or remote state.
 *
 * Usage:
 *   node scripts/doctor.mjs [options]
 *
 * Options:
 *   --env-file <path>  Use a custom env file (default: .env)
 *   --json             Print machine-readable JSON
 *   --help             Show this message
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnvFile, isPlaceholder, readProjectRefFromConfig } from './lib/env.mjs';
import { AI_PROVIDER_KEYS, REQUIRED_ENV_VARS } from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

const STATUS_ORDER = {
  pass: 0,
  manual: 1,
  warn: 2,
  fail: 3,
  skip: 4,
};

function parseFlags() {
  const { values } = parseArgs({
    options: {
      'env-file': { type: 'string', default: resolve(ROOT_DIR, '.env') },
      'json': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  return {
    envFile: values['env-file'],
    json: values.json,
    help: values.help,
  };
}

function printUsage() {
  console.log(`
Koffey doctor

Usage:
  node scripts/doctor.mjs [options]

Options:
  --env-file <path>  Use a custom env file (default: .env)
  --json             Print machine-readable JSON
  --help             Show this message
`);
}

function readLinkedProjectRef() {
  const refFile = resolve(ROOT_DIR, 'supabase', '.temp', 'project-ref');
  try {
    if (!existsSync(refFile)) return '';
    return readFileSync(refFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function isSet(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return false;
  if (isPlaceholder(normalized)) return false;
  if (/^<[^>]+>$/.test(normalized)) return false;
  if (/your[-_ ]/i.test(normalized)) return false;
  return true;
}

function hasGoogleOAuthCredentials(env) {
  return isSet(env.GOOGLE_CLIENT_ID) && isSet(env.GOOGLE_CLIENT_SECRET);
}

function hasPartialGoogleOAuthCredentials(env) {
  return isSet(env.GOOGLE_CLIENT_ID) || isSet(env.GOOGLE_CLIENT_SECRET);
}

function mask(value) {
  const normalized = String(value ?? '');
  if (!normalized) return '<empty>';
  if (normalized.length <= 14) return '***';
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function getProjectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(value);
    const [hostRef] = url.hostname.split('.');
    return hostRef || '';
  } catch {
    return '';
  }
}

function expectedGoogleRedirectUri(supabaseUrl) {
  return `${String(supabaseUrl || '').replace(/\/$/, '')}/functions/v1/google-oauth`;
}

function append(results, status, label, detail = '', next = '') {
  results.push({ status, label, detail, next });
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, data, text };
}

async function checkSupabaseApi(results, env) {
  if (!isSet(env.VITE_SUPABASE_URL) || !isSet(env.VITE_SUPABASE_ANON_KEY)) {
    append(results, 'skip', 'Supabase API reachability', 'Missing Supabase URL or frontend key.');
    return;
  }

  const baseUrl = String(env.VITE_SUPABASE_URL).replace(/\/$/, '');
  const headers = {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  };

  try {
    const authUrl = `${baseUrl}/auth/v1/settings`;
    const { response: authResponse } = await fetchJson(authUrl, { headers });

    if (!authResponse.ok) {
      append(
        results,
        'fail',
        'Supabase Auth API reachability',
        `${authResponse.status} from ${authUrl}`,
        'Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. New Supabase projects should use the publishable key for VITE_SUPABASE_ANON_KEY.',
      );
      return;
    }

    append(results, 'pass', 'Supabase Auth API reachability', `${authResponse.status} from ${authUrl}`);

    const restUrl = `${baseUrl}/rest/v1/organizations?select=id&limit=1`;
    const { response: restResponse } = await fetchJson(restUrl, { headers });

    if (restResponse.ok) {
      append(results, 'pass', 'Supabase REST schema reachability', `${restResponse.status} from organizations table.`);
      return;
    }

    append(
      results,
      'fail',
      'Supabase REST schema reachability',
      `${restResponse.status} from ${restUrl}`,
      restResponse.status === 404
        ? 'Run npm run setup to apply the database schema.'
        : 'Check VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and RLS/schema setup.',
    );
  } catch (error) {
    append(
      results,
      'fail',
      'Supabase API reachability',
      error instanceof Error ? error.message : String(error),
      'Check network access and the Supabase project URL.',
    );
  }
}

async function checkSupabaseServiceRole(results, env) {
  if (!isSet(env.VITE_SUPABASE_URL) || !isSet(env.SUPABASE_SERVICE_ROLE_KEY)) {
    append(results, 'skip', 'Supabase service-role reachability', 'Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }

  const baseUrl = String(env.VITE_SUPABASE_URL).replace(/\/$/, '');
  const serviceHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {
    const restUrl = `${baseUrl}/rest/v1/organizations?select=id&limit=1`;
    const { response, text } = await fetchJson(restUrl, { headers: serviceHeaders });

    if (response.ok) {
      append(results, 'pass', 'Supabase service-role reachability', `${response.status} from organizations table.`);
      return;
    }

    append(
      results,
      'fail',
      'Supabase service-role reachability',
      `${response.status} from ${restUrl}`,
      response.status === 401
        ? 'Replace SUPABASE_SERVICE_ROLE_KEY with the service_role key from this Supabase project. Do not use a self-generated JWT.'
        : `Check SUPABASE_SERVICE_ROLE_KEY and schema setup. Response: ${text.slice(0, 100)}`,
    );
  } catch (error) {
    append(
      results,
      'fail',
      'Supabase service-role reachability',
      error instanceof Error ? error.message : String(error),
      'Check network access and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
}

async function checkGoogleOAuthStatus(results, env) {
  if (!isSet(env.VITE_SUPABASE_URL)) {
    append(results, 'skip', 'Google OAuth status endpoint', 'Missing VITE_SUPABASE_URL.');
    return;
  }
  if (!hasGoogleOAuthCredentials(env)) {
    append(
      results,
      'skip',
      'Google OAuth status endpoint',
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured.',
      'Core CRM works without Google. Add both values and rerun npm run setup when enabling Calendar, Gmail, or Drive.',
    );
    return;
  }

  const baseUrl = String(env.VITE_SUPABASE_URL).replace(/\/$/, '');
  const statusUrl = `${baseUrl}/functions/v1/google-oauth?mode=status`;
  const expectedRedirect = expectedGoogleRedirectUri(baseUrl);

  try {
    const { response, data, text } = await fetchJson(statusUrl);
    if (!response.ok) {
      append(
        results,
        'fail',
        'Google OAuth status endpoint',
        `${response.status} from ${statusUrl}`,
        'Run npm run setup to deploy edge functions, then retry npm run doctor.',
      );
      return;
    }

    if (!data || typeof data !== 'object') {
      append(results, 'fail', 'Google OAuth status endpoint', `Unexpected response: ${text.slice(0, 120)}`);
      return;
    }

    if (!data.configured) {
      const missing = Array.isArray(data.missing) ? data.missing.join(', ') : 'Google OAuth credentials';
      append(
        results,
        'warn',
        'Google OAuth status endpoint',
        `Not configured. Missing: ${missing}`,
        'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env, then rerun npm run setup.',
      );
      return;
    }

    append(results, 'pass', 'Google OAuth status endpoint', 'Configured in deployed edge-function secrets.');

    if (data.storage_ready === true) {
      append(results, 'pass', 'Google OAuth token storage', 'Deployed function can read google_tokens with its service role.');
    } else if (data.storage_ready === false) {
      const storageError = typeof data.storage_error === 'string' ? data.storage_error : 'storage_unavailable';
      append(
        results,
        'fail',
        'Google OAuth token storage',
        storageError,
        storageError === 'invalid_service_role_key'
          ? 'Replace SUPABASE_SERVICE_ROLE_KEY with the project service_role key, then redeploy functions.'
          : 'Run npm run setup to apply schema and redeploy google-oauth.',
      );
    } else {
      append(
        results,
        'warn',
        'Google OAuth token storage',
        'Status endpoint does not report storage health.',
        'Redeploy google-oauth so doctor can verify token storage before OAuth redirects.',
      );
    }

    if (data.redirect_uri === expectedRedirect) {
      append(results, 'pass', 'Google redirect URI from function', data.redirect_uri);
    } else {
      append(
        results,
        'fail',
        'Google redirect URI from function',
        `Expected ${expectedRedirect}; got ${data.redirect_uri || '<missing>'}`,
        'Rerun npm run setup after confirming VITE_SUPABASE_URL and SUPABASE_PROJECT_REF.',
      );
    }
  } catch (error) {
    append(
      results,
      'fail',
      'Google OAuth status endpoint',
      error instanceof Error ? error.message : String(error),
      'Run npm run setup to deploy edge functions, then retry npm run doctor.',
    );
  }
}

async function checkGoogleOAuthStart(results, env) {
  if (!isSet(env.VITE_SUPABASE_URL)) {
    append(results, 'skip', 'Google OAuth start auth gate', 'Missing VITE_SUPABASE_URL.');
    return;
  }

  if (!hasGoogleOAuthCredentials(env)) {
    append(results, 'skip', 'Google OAuth start auth gate', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not fully configured locally.');
    return;
  }

  const baseUrl = String(env.VITE_SUPABASE_URL).replace(/\/$/, '');
  const expectedRedirect = expectedGoogleRedirectUri(baseUrl);
  const params = new URLSearchParams({
    mode: 'start',
    returnTo: `${env.VITE_APP_URL || 'http://localhost:5173'}/doctor`,
    scopes: 'https://www.googleapis.com/auth/calendar',
  });
  const startUrl = `${baseUrl}/functions/v1/google-oauth?${params.toString()}`;

  try {
    // The hardened function requires a valid Supabase JWT. An unauthenticated
    // request should return a JSON 401 { error: 'auth_required' }. Doctor
    // verifies the function enforces auth. Redirect URI is tested via status.
    const response = await fetch(startUrl, { redirect: 'manual' });

    // JSON 401 with auth_required — the expected hardened behavior
    if (response.status === 401) {
      let isAuthRequired = false;
      try {
        const body = await response.json();
        isAuthRequired = body?.error === 'auth_required';
      } catch { /* not JSON */ }

      if (isAuthRequired) {
        append(results, 'pass', 'Google OAuth start auth gate', 'Function correctly requires JWT authentication (401 auth_required).');
      } else {
        append(
          results,
          'warn',
          'Google OAuth start auth gate',
          'Function returns 401 but without the expected { "error": "auth_required" } body.',
          'Deploy the latest google-oauth function for full auth-gate compliance.',
        );
      }
    } else if (response.status === 200) {
      // 200 without auth — possibly the old unauthenticated version
      try {
        const body = await response.json();
        if (body?.auth_url) {
          append(
            results,
            'fail',
            'Google OAuth start auth gate',
            'Function returned an auth URL without requiring authentication.',
            'Deploy the latest google-oauth function that verifies the Supabase JWT.',
          );
          return;
        }
      } catch { /* not JSON, continue */ }
      append(results, 'warn', 'Google OAuth start auth gate', `Unexpected 200 response.`, 'Check google-oauth function logs and redeploy.');
    } else if ([302, 303, 307, 308].includes(response.status)) {
      // Any redirect from start mode without auth is the old behavior
      append(
        results,
        'fail',
        'Google OAuth start auth gate',
        'Function redirected without requiring authentication (stale deployment).',
        'Deploy the latest google-oauth function that verifies the Supabase JWT.',
      );
    } else {
      append(
        results,
        'warn',
        'Google OAuth start auth gate',
        `Unexpected response: HTTP ${response.status}.`,
        'Check google-oauth function logs and redeploy.',
      );
    }

    // Verify client ID and redirect URI via the status endpoint (no auth needed)
    const statusUrl = `${baseUrl}/functions/v1/google-oauth?mode=status`;
    const statusRes = await fetch(statusUrl);
    if (statusRes.ok) {
      const status = await statusRes.json();
      const deployedRedirectUri = status.redirect_uri;

      if (deployedRedirectUri === expectedRedirect) {
        append(results, 'pass', 'Google OAuth redirect URI', deployedRedirectUri);
      } else {
        append(
          results,
          'fail',
          'Google OAuth redirect URI',
          `Expected ${expectedRedirect}; got ${deployedRedirectUri || '<missing>'}.`,
          'Rerun npm run setup and update Google Cloud authorized redirect URIs.',
        );
      }
    }
  } catch (error) {
    append(
      results,
      'fail',
      'Google OAuth start auth gate',
      error instanceof Error ? error.message : String(error),
      'Check network access and google-oauth deployment.',
    );
  }
}

async function checkGoogleOAuthCredentials(results, env) {
  if (!isSet(env.GOOGLE_CLIENT_ID) || !isSet(env.GOOGLE_CLIENT_SECRET) || !isSet(env.VITE_SUPABASE_URL)) {
    append(results, 'skip', 'Google OAuth client secret', 'Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or VITE_SUPABASE_URL.');
    return;
  }

  const redirectUri = expectedGoogleRedirectUri(String(env.VITE_SUPABASE_URL).replace(/\/$/, ''));

  try {
    const { response, data, text } = await fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: 'koffey_doctor_invalid_code',
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const errorCode = typeof data?.error === 'string' ? data.error : '';
    const errorDescription = typeof data?.error_description === 'string' ? data.error_description : text.slice(0, 100);

    if (errorCode === 'invalid_grant') {
      append(
        results,
        'pass',
        'Google OAuth client secret',
        'Google accepted the client ID, client secret, and redirect URI shape. The fake auth code was rejected as expected.',
      );
      return;
    }

    if (errorCode === 'invalid_client') {
      append(
        results,
        'fail',
        'Google OAuth client secret',
        errorDescription || `HTTP ${response.status}`,
        'Copy the current client secret from the matching Google OAuth client into GOOGLE_CLIENT_SECRET, then run npm run setup.',
      );
      return;
    }

    if (errorCode === 'redirect_uri_mismatch') {
      append(
        results,
        'fail',
        'Google OAuth redirect URI',
        errorDescription || `HTTP ${response.status}`,
        `Add this exact URI to Google Cloud authorized redirect URIs: ${redirectUri}`,
      );
      return;
    }

    append(
      results,
      response.ok ? 'warn' : 'fail',
      'Google OAuth client secret',
      errorCode ? `${errorCode}: ${errorDescription}` : `Unexpected HTTP ${response.status}: ${text.slice(0, 100)}`,
      'Recheck GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and the Google OAuth client type.',
    );
  } catch (error) {
    append(
      results,
      'warn',
      'Google OAuth client secret',
      error instanceof Error ? error.message : String(error),
      'Could not reach Google token endpoint for credential preflight.',
    );
  }
}

function checkLocalEnv(results, env, flags) {
  if (existsSync(flags.envFile)) {
    append(results, 'pass', '.env file', flags.envFile);
  } else {
    append(results, 'fail', '.env file', `${flags.envFile} not found.`, 'Run npm run setup:init and fill in .env.');
    return;
  }

  const missingRequired = REQUIRED_ENV_VARS.filter((key) => !isSet(env[key]));
  if (missingRequired.length === 0) {
    append(results, 'pass', 'Required Supabase env vars', 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are set.');
  } else {
    append(
      results,
      'fail',
      'Required Supabase env vars',
      `Missing: ${missingRequired.join(', ')}`,
      'Copy values from Supabase Dashboard -> Project Settings -> API into .env.',
    );
  }

  const hasAiProvider = AI_PROVIDER_KEYS.some((key) => isSet(env[key]));
  if (hasAiProvider) {
    append(results, 'pass', 'AI provider key', `At least one configured. Priority: ${env.AI_PROVIDER_PRIORITY || '<default>'}`);
  } else {
    append(
      results,
      'fail',
      'AI provider key',
      `Missing all supported providers: ${AI_PROVIDER_KEYS.join(', ')}`,
      'Add KIMI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.',
    );
  }

  const hasDbUrl = isSet(env.SUPABASE_DB_URL);
  const hasPoolerUrl = isSet(env.SUPABASE_POOLER_DB_URL);
  if (hasDbUrl || hasPoolerUrl) {
    append(results, 'pass', 'Database connection URL', hasPoolerUrl ? 'Pooler URL configured.' : 'Direct DB URL configured.');
  } else {
    append(
      results,
      'warn',
      'Database connection URL',
      'No SUPABASE_DB_URL or SUPABASE_POOLER_DB_URL configured.',
      'npm run setup can still try linked project auth, but the session pooler URL is recommended.',
    );
  }

  const appUrl = env.VITE_APP_URL || env.APP_URL || env.APP_BASE_URL || env.SITE_URL || '';
  if (isSet(appUrl)) {
    append(results, 'pass', 'Frontend app URL', appUrl);
  } else {
    append(results, 'warn', 'Frontend app URL', 'No VITE_APP_URL / APP_URL / APP_BASE_URL / SITE_URL configured.', 'Use http://localhost:5173 for local development.');
  }

  if (hasGoogleOAuthCredentials(env)) {
    append(results, 'pass', 'Local Google OAuth credentials', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.');
  } else if (hasPartialGoogleOAuthCredentials(env)) {
    append(
      results,
      'fail',
      'Local Google OAuth credentials',
      'Only one of GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is set.',
      'Set both values or clear both values to run without Google integrations.',
    );
  } else {
    append(
      results,
      'skip',
      'Local Google OAuth credentials',
      'Not fully configured. Core CRM can still run without Google integrations.',
      'Add both values, then rerun npm run setup, when enabling Calendar, Gmail, or Drive.',
    );
  }
}

function checkProjectTargeting(results, env) {
  const envRef = env.SUPABASE_PROJECT_REF || '';
  const urlRef = getProjectRefFromSupabaseUrl(env.VITE_SUPABASE_URL || '');
  const linkedRef = readLinkedProjectRef();
  const configRef = readProjectRefFromConfig(ROOT_DIR);

  if (isSet(envRef)) append(results, 'pass', 'SUPABASE_PROJECT_REF', envRef);
  else append(results, 'warn', 'SUPABASE_PROJECT_REF', 'Not set.', 'Set it to your Supabase project ref for predictable setup.');

  if (isSet(urlRef)) append(results, 'pass', 'Project ref from VITE_SUPABASE_URL', urlRef);
  else append(results, 'fail', 'Project ref from VITE_SUPABASE_URL', 'Could not parse project ref from VITE_SUPABASE_URL.');

  if (linkedRef) append(results, linkedRef === envRef || !envRef ? 'pass' : 'warn', 'Linked Supabase project ref', linkedRef, linkedRef === envRef || !envRef ? '' : 'Run npx supabase link --project-ref <ref> or update supabase/.temp/project-ref.');
  else append(results, 'manual', 'Linked Supabase project ref', 'No supabase/.temp/project-ref file found.', 'npm run setup can use SUPABASE_PROJECT_REF, but linking helps avoid stale targets.');

  if (configRef) append(results, 'manual', 'supabase/config.toml project_id', configRef, 'This is only used as a fallback when no env or linked ref is available.');

  const refs = [
    ['SUPABASE_PROJECT_REF', envRef],
    ['VITE_SUPABASE_URL', urlRef],
    ['linked project', linkedRef],
  ].filter(([, value]) => isSet(value));
  const unique = new Set(refs.map(([, value]) => value));

  if (unique.size <= 1) {
    append(results, 'pass', 'Project ref consistency', refs.length ? [...unique][0] : 'No refs to compare.');
  } else {
    append(
      results,
      'fail',
      'Project ref consistency',
      refs.map(([label, value]) => `${label}=${value}`).join(', '),
      'Make all project refs match before running npm run setup.',
    );
  }
}

function addManualChecklist(results, env) {
  const appUrl = env.VITE_APP_URL || env.APP_URL || env.APP_BASE_URL || env.SITE_URL || 'http://localhost:5173';
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co';
  const redirectUri = expectedGoogleRedirectUri(supabaseUrl);

  append(
    results,
    'manual',
    'Supabase Auth URL configuration',
    `Site URL: ${appUrl}; Redirect URLs: ${appUrl}/**`,
    'Supabase Dashboard -> Auth -> URL Configuration.',
  );

  if (hasGoogleOAuthCredentials(env)) {
    append(
      results,
      'manual',
      'Google Cloud authorized redirect URI',
      redirectUri,
      'Google Cloud Console -> APIs & Services -> Credentials -> OAuth client -> Authorized redirect URIs.',
    );

    append(
      results,
      'manual',
      'Google OAuth consent screen testers',
      'Required while the app is in Google Testing mode.',
      'Google Cloud Console -> APIs & Services -> OAuth consent screen -> Test users.',
    );
  } else {
    append(
      results,
      'skip',
      'Google dashboard configuration',
      'Google integrations are optional and no complete Google OAuth client is configured.',
      'When enabling Google, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, rerun npm run setup, then add the doctor-reported redirect URI in Google Cloud.',
    );
  }
}

function printResults(results) {
  const sorted = [...results].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  console.log('Koffey Doctor\n');
  for (const result of sorted) {
    const label = result.status.toUpperCase().padEnd(6);
    console.log(`[${label}] ${result.label}`);
    if (result.detail) console.log(`       ${result.detail}`);
    if (result.next) console.log(`       Next: ${result.next}`);
  }

  console.log('\nSummary');
  console.log(`  pass: ${counts.pass || 0}`);
  console.log(`  warn: ${counts.warn || 0}`);
  console.log(`  fail: ${counts.fail || 0}`);
  console.log(`  manual: ${counts.manual || 0}`);
  console.log(`  skip: ${counts.skip || 0}`);

  if ((counts.fail || 0) > 0) {
    console.log('\nDoctor found blockers. Fix FAIL items before publishing or running a clean-room test.');
  } else if ((counts.warn || 0) > 0) {
    console.log('\nDoctor found warnings. The app may run, but review WARN and MANUAL items.');
  } else {
    console.log('\nDoctor found no automated blockers. Complete MANUAL dashboard items in your own provider consoles, then test signup in the browser. SKIP items are optional integrations you have not enabled.');
  }
}

async function main() {
  const flags = parseFlags();
  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  const results = [];
  const env = loadEnvFile(flags.envFile);

  checkLocalEnv(results, env, flags);
  checkProjectTargeting(results, env);
  await checkSupabaseApi(results, env);
  await checkSupabaseServiceRole(results, env);
  await checkGoogleOAuthStatus(results, env);
  await checkGoogleOAuthStart(results, env);
  await checkGoogleOAuthCredentials(results, env);
  addManualChecklist(results, env);

  if (flags.json) {
    console.log(JSON.stringify({ results }, null, 2));
  } else {
    printResults(results);
  }

  const hasFailures = results.some((result) => result.status === 'fail');
  process.exit(hasFailures ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
