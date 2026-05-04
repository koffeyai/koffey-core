#!/usr/bin/env node

/**
 * Koffey bootstrap — interactive first-run installer.
 *
 * Clones the repo (or runs in-place), prompts for Supabase credentials and
 * an AI provider key, writes .env, and calls setup.mjs. Cross-platform.
 *
 * Usage:
 *   node scripts/bootstrap.mjs [options]
 *
 * Options:
 *   --dir <path>              Install into a custom directory
 *   --branch <name>           Clone a different branch
 *   --run-dev                 Start the Vite dev server after setup
 *   --supabase-url <url>      Hosted Supabase project URL
 *   --anon-key <key>          Supabase anon key
 *   --service-role-key <key>  Supabase service role key
 *   --db-url <url>            Primary Supabase Postgres connection string
 *   --pooler-db-url <url>     Optional session pooler connection string
 *   --project-ref <ref>       Supabase project ref
 *   --access-token <token>    Supabase CLI access token
 *   --app-url <url>           Local frontend URL (default: http://localhost:5173)
 *   --provider <name>         AI provider: groq, kimi, anthropic, gemini
 *   --api-key <value>         API key for the selected AI provider
 *   --no-prompt               Fail instead of prompting for missing values
 *   --in-repo                 Run setup in the current directory (skip clone)
 *   --help                    Show this message
 */

import { parseArgs } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { log, warn, die } from './lib/log.mjs';
import { run, supabase, npm, git, commandExists } from './lib/exec.mjs';
import { loadEnvFile, copyEnvTemplate, upsertEnvVar, isPlaceholder } from './lib/env.mjs';
import { createPrompter } from './lib/prompt.mjs';
import { PROVIDER_ENV_MAP, PROVIDER_PRIORITY_MAP } from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_URL = process.env.REPO_URL || 'https://github.com/koffeyai/koffey-core.git';

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

function parseFlags() {
  const { values } = parseArgs({
    options: {
      'dir':              { type: 'string',  default: resolve(process.cwd(), 'koffey-core') },
      'branch':           { type: 'string',  default: 'main' },
      'run-dev':          { type: 'boolean', default: false },
      'supabase-url':     { type: 'string',  default: '' },
      'anon-key':         { type: 'string',  default: '' },
      'service-role-key': { type: 'string',  default: '' },
      'db-url':           { type: 'string',  default: '' },
      'pooler-db-url':    { type: 'string',  default: '' },
      'project-ref':      { type: 'string',  default: '' },
      'access-token':     { type: 'string',  default: '' },
      'app-url':          { type: 'string',  default: 'http://localhost:5173' },
      'provider':         { type: 'string',  default: '' },
      'api-key':          { type: 'string',  default: '' },
      'no-prompt':        { type: 'boolean', default: false },
      'in-repo':          { type: 'boolean', default: false },
      'help':             { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  return {
    dir:            values['dir'],
    branch:         values['branch'],
    runDev:         values['run-dev'],
    supabaseUrl:    values['supabase-url'],
    anonKey:        values['anon-key'],
    serviceRoleKey: values['service-role-key'],
    dbUrl:          values['db-url'],
    poolerDbUrl:    values['pooler-db-url'],
    projectRef:     values['project-ref'],
    accessToken:    values['access-token'],
    appUrl:         values['app-url'],
    provider:       values['provider'],
    apiKey:         values['api-key'],
    noPrompt:       values['no-prompt'],
    inRepo:         values['in-repo'],
    help:           values['help'],
  };
}

// ---------------------------------------------------------------------------
// Credential collection
// ---------------------------------------------------------------------------

async function configureRequiredEnv(prompter, envFile, flags, env) {
  const url = await prompter.required('Hosted Supabase URL', flags.supabaseUrl || env.VITE_SUPABASE_URL || '');
  const anon = await prompter.required('Supabase anon key', flags.anonKey || env.VITE_SUPABASE_ANON_KEY || '', { secret: true });
  const srk = await prompter.required('Supabase service role key', flags.serviceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || '', { secret: true });
  const dbUrlDefault = flags.dbUrl || env.SUPABASE_DB_URL || env.SUPABASE_POOLER_DB_URL || '';
  const poolerUrlDefault = flags.poolerDbUrl || env.SUPABASE_POOLER_DB_URL || '';
  const dbUrl = await prompter.required('Supabase database URL (session pooler recommended)', dbUrlDefault, { secret: true });
  const poolerUrl = await prompter.optional('Optional session pooler DB URL for IPv4 fallback', poolerUrlDefault, { secret: true });
  const projRef = await prompter.required('Supabase project ref', flags.projectRef || env.SUPABASE_PROJECT_REF || '');

  upsertEnvVar(envFile, 'VITE_SUPABASE_URL', url);
  upsertEnvVar(envFile, 'VITE_SUPABASE_ANON_KEY', anon);
  upsertEnvVar(envFile, 'SUPABASE_SERVICE_ROLE_KEY', srk);
  upsertEnvVar(envFile, 'SUPABASE_DB_URL', dbUrl);
  if (poolerUrl) upsertEnvVar(envFile, 'SUPABASE_POOLER_DB_URL', poolerUrl);
  upsertEnvVar(envFile, 'SUPABASE_PROJECT_REF', projRef);
  upsertEnvVar(envFile, 'VITE_APP_URL', flags.appUrl);

  // Sync in-memory env so later steps (Google integrations) see the collected values
  env.VITE_SUPABASE_URL = url;
  env.VITE_SUPABASE_ANON_KEY = anon;
  env.SUPABASE_SERVICE_ROLE_KEY = srk;
  env.SUPABASE_DB_URL = dbUrl;
  if (poolerUrl) env.SUPABASE_POOLER_DB_URL = poolerUrl;
  env.SUPABASE_PROJECT_REF = projRef;
}

async function configureAiKey(prompter, envFile, flags, env) {
  let provider = flags.provider;
  let keyValue = flags.apiKey;

  // Detect existing provider from env
  if (!provider) {
    for (const [name, envVar] of Object.entries(PROVIDER_ENV_MAP)) {
      if (env[envVar]) {
        provider = name;
        keyValue = keyValue || env[envVar];
        break;
      }
    }
  }

  // Prompt if still missing
  if (!provider) {
    provider = await prompter.choice('AI provider', ['groq', 'kimi', 'anthropic', 'gemini'], 'groq');
  }

  const envVar = PROVIDER_ENV_MAP[provider];
  if (!envVar) die(`Unsupported provider '${provider}'. Use groq, kimi, anthropic, or gemini.`);

  if (!keyValue) {
    keyValue = env[envVar] || '';
  }
  if (!keyValue) {
    keyValue = await prompter.required(`${provider} API key`, '', { secret: true });
  }

  upsertEnvVar(envFile, envVar, keyValue);
  upsertEnvVar(envFile, 'AI_PROVIDER_PRIORITY', PROVIDER_PRIORITY_MAP[provider] || 'kimi,groq,anthropic,gemini');
}

async function configureGoogleIntegrations(prompter, envFile, env, supabaseUrl) {
  const existingClientId = env.GOOGLE_CLIENT_ID || '';
  const existingClientSecret = env.GOOGLE_CLIENT_SECRET || '';

  if (existingClientId && existingClientSecret) {
    return;
  }

  const shouldConfigure = await prompter.choice(
    'Configure Google Calendar/Gmail/Drive now?',
    ['y', 'n'],
    'n',
  );

  if (shouldConfigure.toLowerCase() !== 'y') {
    return;
  }

  const clientId = await prompter.required('Google OAuth client ID', existingClientId);
  const clientSecret = await prompter.required('Google OAuth client secret', existingClientSecret, { secret: true });

  upsertEnvVar(envFile, 'GOOGLE_CLIENT_ID', clientId);
  upsertEnvVar(envFile, 'GOOGLE_CLIENT_SECRET', clientSecret);

  const redirectUri = `${String(supabaseUrl || '').replace(/\/$/, '')}/functions/v1/google-oauth`;
  if (redirectUri.startsWith('https://')) {
    console.log(`
Google integrations enabled.

Add this Authorized redirect URI in Google Cloud:
  ${redirectUri}
`);
  }
}

async function loginSupabaseIfNeeded(prompter, flags) {
  if (flags.accessToken) {
    log('Authenticating Supabase CLI');
    supabase(['login', '--token', flags.accessToken]);
    return;
  }

  const token = await prompter.optional('Supabase personal access token (Enter to skip if already logged in)', '', { secret: true });
  if (token) {
    log('Authenticating Supabase CLI');
    supabase(['login', '--token', token]);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseFlags();

  if (flags.help) {
    console.log(`
Koffey bootstrap installer

Usage:
  node scripts/bootstrap.mjs [options]

Options:
  --dir <path>              Install into a custom directory
  --branch <name>           Clone a different branch (default: main)
  --run-dev                 Start the Vite dev server after setup
  --supabase-url <url>      Hosted Supabase project URL
  --anon-key <key>          Supabase anon key
  --service-role-key <key>  Supabase service role key
  --db-url <url>            Primary Supabase Postgres connection string
  --pooler-db-url <url>     Optional session pooler connection string
  --project-ref <ref>       Supabase project ref
  --access-token <token>    Supabase CLI access token
  --app-url <url>           Local frontend URL (default: http://localhost:5173)
  --provider <name>         AI provider: groq, kimi, anthropic, gemini
  --api-key <value>         API key for the selected AI provider
  --no-prompt               Fail instead of prompting for missing values
  --in-repo                 Run setup in the current directory (skip clone)
  --help                    Show this message

Examples:
  curl -fsSL https://raw.githubusercontent.com/koffeyai/koffey-core/main/scripts/bootstrap.sh | bash
  node scripts/bootstrap.mjs --in-repo --provider groq --api-key <provider-api-key>
`);
    process.exit(0);
  }

  // Prerequisite checks
  if (!commandExists('git')) die('git is required.');
  if (!commandExists('node')) die('Node.js is required.');
  if (!commandExists('npm')) die('npm is required.');
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 20) die('Node.js 20+ is required.');

  // Clone or use current directory
  let destDir;
  if (flags.inRepo) {
    destDir = process.cwd();
  } else {
    destDir = resolve(flags.dir);
    if (existsSync(resolve(destDir, '.git'))) {
      log(`Using existing checkout at ${destDir}`);
    } else {
      log(`Cloning ${REPO_URL} into ${destDir}`);
      git(['clone', '--branch', flags.branch, '--single-branch', REPO_URL, destDir]);
    }
  }

  log('Installing npm dependencies');
  npm(['install'], { cwd: destDir });

  // Prepare .env
  const envFile = resolve(destDir, '.env');
  log('Preparing .env');
  copyEnvTemplate(destDir, envFile);
  const env = loadEnvFile(envFile);

  // Interactive credential collection
  const prompter = createPrompter({ noPrompt: flags.noPrompt });
  try {
    log('Collecting hosted Supabase credentials');
    await configureRequiredEnv(prompter, envFile, flags, env);

    log('Configuring AI provider');
    await configureAiKey(prompter, envFile, flags, env);

    log('Configuring optional Google integrations');
    await configureGoogleIntegrations(
      prompter,
      envFile,
      env,
      flags.supabaseUrl || env.VITE_SUPABASE_URL || '',
    );

    await loginSupabaseIfNeeded(prompter, flags);
  } finally {
    prompter.close();
  }

  // Link the Supabase project so setup uses --linked for DB push
  const projRef = env.SUPABASE_PROJECT_REF || flags.projectRef || '';
  if (projRef) {
    log(`Linking Supabase project ${projRef}`);
    try {
      supabase(['link', '--project-ref', projRef], { cwd: destDir });
    } catch (e) {
      warn(`supabase link failed (non-fatal): ${e instanceof Error ? e.message : e}`);
    }
  }

  // Run setup
  log('Running hosted setup');
  run(process.execPath, [resolve(destDir, 'scripts', 'setup.mjs'), '--skip-install'], { cwd: destDir });

  if (flags.runDev) {
    log('Starting dev server');
    npm(['run', 'dev'], { cwd: destDir });
  } else {
    console.log(`
Bootstrap complete.

Next step:
  cd ${destDir}
  npm run dev
`);
  }
}

main().catch(err => { die(err.message); });
