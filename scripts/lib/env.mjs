/** .env file parsing, writing, and validation — Node built-ins only. */

import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PLACEHOLDERS, SECRET_KEYS } from './constants.mjs';

/**
 * Parse a .env file into a Map, preserving raw lines for write-back.
 * @returns {{ entries: Map<string,string>, rawLines: string[] }}
 */
export function parseEnvFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const rawLines = content.split('\n');
  const entries = new Map();

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.set(key, value);
  }

  return { entries, rawLines };
}

/**
 * Write updated values back to a .env file, preserving structure.
 * Existing keys are updated in-place. New keys are appended.
 */
export function writeEnvFile(filePath, rawLines, updates) {
  const written = new Set();
  const output = rawLines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return line;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key in updates) {
      written.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append new keys not found in existing file
  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) {
      output.push(`${key}=${value}`);
    }
  }

  writeFileSync(filePath, output.join('\n'));
}

/**
 * Upsert a single key into a .env file.
 */
export function upsertEnvVar(filePath, key, value) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${key}=${value}\n`);
    return;
  }
  const { rawLines } = parseEnvFile(filePath);
  writeEnvFile(filePath, rawLines, { [key]: value });
}

/**
 * Load a .env file into process.env (like bash `set -a; source .env`).
 * Returns the parsed entries as a plain object.
 */
export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const { entries } = parseEnvFile(filePath);
  const env = {};
  for (const [key, value] of entries) {
    process.env[key] = value;
    env[key] = value;
  }
  return env;
}

/** Copy .env.example -> target if target doesn't exist. */
export function copyEnvTemplate(rootDir, envFilePath) {
  const example = join(rootDir, '.env.example');
  if (existsSync(envFilePath)) {
    return false; // already exists
  }
  if (!existsSync(example)) {
    throw new Error(`.env.example not found at ${example}`);
  }
  copyFileSync(example, envFilePath);
  return true;
}

/** Returns true if the value is a known placeholder or empty. */
export function isPlaceholder(value) {
  return PLACEHOLDERS.has(value ?? '');
}

/**
 * Build a temp file of edge-function secrets for `supabase secrets set --env-file`.
 * Returns the file path, or null if no secrets to write. Caller must clean up.
 */
export function buildSecretsFile(env) {
  const lines = [];
  for (const key of SECRET_KEYS) {
    const value = env[key] || process.env[key] || '';
    if (value) {
      lines.push(`${key}=${value}`);
    }
  }
  if (lines.length === 0) return null;

  const filePath = join(tmpdir(), `koffey-secrets-${randomUUID()}.env`);
  writeFileSync(filePath, lines.join('\n') + '\n');
  return filePath;
}

/** Clean up a temp secrets file. */
export function cleanupSecretsFile(filePath) {
  try { if (filePath) unlinkSync(filePath); } catch { /* ignore */ }
}

/**
 * Extract project_id from supabase/config.toml.
 */
export function readProjectRefFromConfig(rootDir) {
  const configPath = join(rootDir, 'supabase', 'config.toml');
  if (!existsSync(configPath)) return '';
  const content = readFileSync(configPath, 'utf8');
  const match = content.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) return '';
  const ref = match[1];
  return isPlaceholder(ref) ? '' : ref;
}
