#!/usr/bin/env node

/**
 * Koffey setup — non-interactive.
 *
 * Validates .env, pushes DB schema, syncs secrets, deploys edge functions,
 * and runs strict validation (lint, typecheck, tests, build).
 * Cross-platform (macOS, Linux, Windows).
 *
 * Usage:
 *   node scripts/setup.mjs [options]
 *
 * Options:
 *   --init-env            Create .env from .env.example, then exit
 *   --env-file <path>     Use a custom env file (default: .env)
 *   --project-ref <ref>   Supabase project ref override
 *   --validate-only       Validate env and exit
 *   --skip-install        Skip npm install
 *   --skip-db-push        Skip supabase db push
 *   --skip-secrets        Skip supabase secrets set
 *   --skip-functions      Skip supabase functions deploy
 *   --skip-build          Skip strict validation (lint, typecheck, tests, build)
 *   --prune-functions     Delete remote functions not present in the repo
 *   --help                Show this message
 */

import { parseArgs } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import { log, warn, die } from './lib/log.mjs';
import { supabase, npm, commandExists } from './lib/exec.mjs';
import {
  loadEnvFile, copyEnvTemplate, isPlaceholder,
  buildSecretsFile, cleanupSecretsFile, readProjectRefFromConfig,
} from './lib/env.mjs';
import {
  REQUIRED_ENV_VARS, AI_PROVIDER_KEYS, DB_CONNECTIVITY_PATTERNS,
} from './lib/constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

function parseFlags() {
  const { values } = parseArgs({
    options: {
      'init-env':        { type: 'boolean', default: false },
      'env-file':        { type: 'string',  default: resolve(ROOT_DIR, '.env') },
      'project-ref':     { type: 'string',  default: '' },
      'validate-only':   { type: 'boolean', default: false },
      'skip-install':    { type: 'boolean', default: false },
      'skip-db-push':    { type: 'boolean', default: false },
      'skip-secrets':    { type: 'boolean', default: false },
      'skip-functions':  { type: 'boolean', default: false },
      'skip-build':      { type: 'boolean', default: false },
      'prune-functions': { type: 'boolean', default: false },
      'help':            { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  return {
    initEnv:        values['init-env'],
    envFile:        values['env-file'],
    projectRef:     values['project-ref'],
    validateOnly:   values['validate-only'],
    skipInstall:    values['skip-install'],
    skipDbPush:     values['skip-db-push'],
    skipSecrets:    values['skip-secrets'],
    skipFunctions:  values['skip-functions'],
    skipBuild:      values['skip-build'],
    pruneFunctions: values['prune-functions'],
    help:           values['help'],
  };
}

function printUsage() {
  console.log(`
Koffey setup

Usage:
  node scripts/setup.mjs [options]

Options:
  --init-env            Create .env from .env.example, then exit
  --env-file <path>     Use a custom env file (default: .env)
  --project-ref <ref>   Supabase project ref override
  --validate-only       Validate env and exit
  --skip-install        Skip npm install
  --skip-db-push        Skip supabase db push
  --skip-secrets        Skip supabase secrets set
  --skip-functions      Skip supabase functions deploy
  --skip-build          Skip strict validation (lint, typecheck, tests, build)
  --prune-functions     Delete remote functions not in the repo
  --help                Show this message
`);
}

// ---------------------------------------------------------------------------
// Prerequisite checks
// ---------------------------------------------------------------------------

function requireCommands() {
  const missing = ['node', 'npm'].filter(c => !commandExists(c));
  if (missing.length > 0) die(`Missing required commands: ${missing.join(', ')}`);
}

function requireNode20() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 20) die('Node.js 20+ is required.');
}

// ---------------------------------------------------------------------------
// Project ref resolution
// ---------------------------------------------------------------------------

function readLinkedProjectRef() {
  const refFile = resolve(ROOT_DIR, 'supabase', '.temp', 'project-ref');
  try {
    if (existsSync(refFile)) {
      const ref = readFileSync(refFile, 'utf8').trim();
      if (ref && !isPlaceholder(ref)) return ref;
    }
  } catch { /* ignore */ }
  return '';
}

function resolveProjectRef(env, override) {
  // Priority: CLI flag > env var > linked project > config.toml.
  // All sources must agree when multiple are present. A mismatch between
  // any pair means DB push, secrets, and functions could target different
  // projects — die loudly so the operator fixes it before anything deploys.
  const envRef = env.SUPABASE_PROJECT_REF && !isPlaceholder(env.SUPABASE_PROJECT_REF)
    ? env.SUPABASE_PROJECT_REF
    : '';
  const linked = readLinkedProjectRef();

  const resolved = override || envRef || linked || readProjectRefFromConfig(ROOT_DIR);

  // Check every pair for conflict
  if (override && linked && override !== linked) {
    die(
      `--project-ref (${override}) does not match linked project (${linked}).\n`
      + `  Run: npx supabase link --project-ref ${override}\n`
      + '  Or omit --project-ref to use the linked project.',
    );
  }
  if (override && envRef && override !== envRef) {
    die(
      `--project-ref (${override}) does not match SUPABASE_PROJECT_REF (${envRef}).\n`
      + `  Update .env to match, or omit --project-ref.`,
    );
  }
  if (envRef && linked && envRef !== linked) {
    die(
      `SUPABASE_PROJECT_REF (${envRef}) does not match linked project (${linked}).\n`
      + `  Run: npx supabase link --project-ref ${envRef}\n`
      + '  Or pass --project-ref explicitly if you intentionally want a different target.',
    );
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

function validateEnv(env, flags) {
  const missing = REQUIRED_ENV_VARS.filter(k => isPlaceholder(env[k]));
  if (missing.length > 0) die(`Missing required env values: ${missing.join(', ')}`);

  const hasAI = AI_PROVIDER_KEYS.some(k => !isPlaceholder(env[k]));
  if (!hasAI) {
    die(`At least one AI provider key must be set: ${AI_PROVIDER_KEYS.join(', ')}`);
  }

  // Derive APP_URL, APP_BASE_URL, SITE_URL, CORS_ALLOWED_ORIGINS from a canonical app URL.
  // Accept any of the known app URL vars so older envs with APP_BASE_URL or SITE_URL still work.
  // These are used by edge functions (google-oauth, cors.ts, send-invitation-email)
  const appUrl = env.VITE_APP_URL || env.APP_URL || env.APP_BASE_URL || env.SITE_URL || '';
  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const isLocalSupabase = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(supabaseUrl);
  if (!appUrl) {
    if (isLocalSupabase) {
      warn('VITE_APP_URL is not set. Defaulting to http://localhost:5173 for local development.');
    } else {
      die(
        'An app URL is required for non-local deployments.\n'
        + '  Set VITE_APP_URL (or APP_URL, APP_BASE_URL, SITE_URL) to the URL where\n'
        + '  your frontend is served (e.g. https://app.koffey.ai).\n'
        + '  Edge functions use this for OAuth redirects and CORS — without it,\n'
        + '  redirects silently fall back to localhost and break in production.',
      );
    }
  } else {
    const derived = {
      APP_URL: env.APP_URL || appUrl,
      APP_BASE_URL: env.APP_BASE_URL || appUrl,
      SITE_URL: env.SITE_URL || appUrl,
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS || appUrl,
    };
    for (const [key, value] of Object.entries(derived)) {
      if (!env[key]) {
        env[key] = value;
        process.env[key] = value;
      }
    }
  }

  if (!flags.skipDbPush && isPlaceholder(env.SUPABASE_DB_URL || '') && isPlaceholder(env.SUPABASE_POOLER_DB_URL || '')) {
    warn('Neither SUPABASE_DB_URL nor SUPABASE_POOLER_DB_URL is set. Schema push will try your linked project.');
  }

  const hasGoogleClientId = !!env.GOOGLE_CLIENT_ID;
  const hasGoogleClientSecret = !!env.GOOGLE_CLIENT_SECRET;
  if (!hasGoogleClientId || !hasGoogleClientSecret) {
    warn('Google Calendar/Gmail/Drive integrations are disabled until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set and npm run setup is rerun.');
  }
}

// ---------------------------------------------------------------------------
// DB push with fallback
// ---------------------------------------------------------------------------

function isDbConnectivityError(output) {
  const lower = output.toLowerCase();
  return DB_CONNECTIVITY_PATTERNS.some(p => lower.includes(p));
}

function tryDbPush(label, args) {
  log(`Applying database schema via ${label}`);
  const result = supabase(['db', 'push', '--yes', ...args], {
    captureOutput: true, allowFailure: true,
  });
  return { ok: result.code === 0, output: result.stdout + result.stderr };
}

function runDbPush(env, projectRef) {
  const dbUrl = env.SUPABASE_DB_URL || '';
  const poolerUrl = env.SUPABASE_POOLER_DB_URL || '';
  const hasDb = dbUrl && !isPlaceholder(dbUrl);
  const hasPooler = poolerUrl && !isPlaceholder(poolerUrl) && poolerUrl !== dbUrl;
  const linkedRef = readLinkedProjectRef();

  // Strategy: use --linked only when the linked project matches the resolved
  // projectRef. This ensures DB push, secrets sync, and functions deploy all
  // target the same project. resolveProjectRef() already dies on mismatch,
  // so if we get here with both set they must agree.
  const useLinked = linkedRef && (!projectRef || linkedRef === projectRef);

  if (useLinked) {
    const r = tryDbPush('linked project', ['--linked']);
    if (r.ok) return;
    warn('Linked project push failed. Will try explicit DB URLs if available.');
    if (!hasDb && !hasPooler) {
      process.stderr.write(r.output);
      die('Schema push failed. See errors above.');
    }
  }

  if (hasDb) {
    const r = tryDbPush('SUPABASE_DB_URL', ['--db-url', dbUrl]);
    if (r.ok) return;

    if (hasPooler && isDbConnectivityError(r.output)) {
      warn('SUPABASE_DB_URL failed with a connectivity error. Retrying with SUPABASE_POOLER_DB_URL.');
      const r2 = tryDbPush('SUPABASE_POOLER_DB_URL', ['--db-url', poolerUrl]);
      if (r2.ok) return;
    }

    process.stderr.write(r.output);
    die('Schema push failed. See errors above.');
  }

  if (hasPooler) {
    const r = tryDbPush('SUPABASE_POOLER_DB_URL', ['--db-url', poolerUrl]);
    if (r.ok) return;
    process.stderr.write(r.output);
    die('Schema push failed. See errors above.');
  }

  die('No database connection available. Either link your project (`npx supabase link`) or set SUPABASE_DB_URL in .env.');
}

// ---------------------------------------------------------------------------
// Secrets sync
// ---------------------------------------------------------------------------

function runSecretsSync(env, projectRef) {
  log('Syncing edge-function secrets');
  const secretsFile = buildSecretsFile(env);
  if (!secretsFile) {
    warn('No non-empty secrets were found to sync.');
    return;
  }
  try {
    const args = ['secrets', 'set', '--env-file', secretsFile];
    if (projectRef) args.push('--project-ref', projectRef);
    supabase(args);
  } finally {
    cleanupSecretsFile(secretsFile);
  }
}

// ---------------------------------------------------------------------------
// Functions deploy
// ---------------------------------------------------------------------------

function runFunctionsDeploy(projectRef, prune) {
  log('Deploying edge functions');
  const args = ['functions', 'deploy', '--use-api'];
  if (prune) args.push('--prune');
  if (projectRef) args.push('--project-ref', projectRef);
  supabase(args);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const flags = parseFlags();
  if (flags.help) { printUsage(); process.exit(0); }

  if (flags.initEnv) {
    const created = copyEnvTemplate(ROOT_DIR, flags.envFile);
    if (created) {
      log(`Created ${flags.envFile} from .env.example`);
    } else {
      warn(`${flags.envFile} already exists; leaving it unchanged.`);
    }
    console.log(`\nNext step:\n  1. Edit ${flags.envFile} with your Supabase credentials and API keys.\n  2. Run: node scripts/setup.mjs\n`);
    process.exit(0);
  }

  requireCommands();
  requireNode20();
  const env = loadEnvFile(flags.envFile);
  const projectRef = resolveProjectRef(env, flags.projectRef);
  if (projectRef) {
    log(`Target project: ${projectRef}`);
  } else {
    warn('No project ref resolved. Secrets and functions will target the default linked project.');
  }
  validateEnv(env, flags);

  if (flags.validateOnly) { log('Validation passed'); process.exit(0); }

  if (!flags.skipInstall)   { log('Installing npm dependencies'); npm(['install'], { cwd: ROOT_DIR }); }
  if (!flags.skipDbPush)    runDbPush(env, projectRef);
  if (!flags.skipSecrets)   runSecretsSync(env, projectRef);
  if (!flags.skipFunctions) runFunctionsDeploy(projectRef, flags.pruneFunctions);
  if (!flags.skipBuild)     { log('Running strict validation (lint + typecheck + tests + build)'); npm(['run', 'validate:strict'], { cwd: ROOT_DIR }); }

  const appUrl = env.VITE_APP_URL || env.APP_URL || env.APP_BASE_URL || env.SITE_URL || 'http://localhost:5173';
  console.log(`
Setup complete.

Before your first sign-in:
  1. In Supabase Dashboard → Auth → URL Configuration, set:
     - Site URL: ${appUrl}
     - Redirect URLs: ${appUrl}/**
  2. Run: npm run dev
  3. Open ${appUrl} and sign up to create your account and organization.
  4. If you deploy the frontend elsewhere, carry over VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
`);
}

main();
