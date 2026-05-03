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

const protectedViews = [
  'entity_messages_unified',
  'product_gap_insights',
  'product_mention_summary',
];

test('tenant-scoped reporting views use security_invoker', () => {
  const sql = allMigrationSql();

  for (const viewName of protectedViews) {
    assert.match(
      sql,
      new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+VIEW\\s+\"?public\"?\\.\"?${viewName}\"?\\s+AS`, 'i'),
      `${viewName} should be defined as a view`,
    );
    assert.match(
      sql,
      new RegExp(`ALTER\\s+VIEW\\s+public\\.${viewName}\\s+SET\\s*\\(\\s*security_invoker\\s*=\\s*on\\s*\\)`, 'i'),
      `${viewName} should enforce caller RLS through security_invoker`,
    );
  }
});
