import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase/migrations');

function allMigrationSql() {
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    .join('\n');
}

test('auth users trigger creates public profiles for new signups', () => {
  const sql = allMigrationSql();

  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+(?:"?public"?\.)?"?handle_new_user"?\s*\(/i);
  assert.match(sql, /CREATE TRIGGER\s+on_auth_user_created/i);
  assert.match(sql, /AFTER INSERT ON auth\.users/i);
  assert.match(sql, /EXECUTE FUNCTION public\.handle_new_user\(\)/i);
});

test('missing profiles are backfilled when auth profile trigger is restored', () => {
  const sql = allMigrationSql();

  assert.match(sql, /INSERT INTO public\.profiles\s*\(id, email, full_name, signup_metadata\)/i);
  assert.match(sql, /FROM auth\.users AS users/i);
  assert.match(sql, /WHERE NOT EXISTS/i);
});
