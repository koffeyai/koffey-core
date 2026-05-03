import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const syncFunctionPath = path.join(repoRoot, 'supabase/functions/sync-calendar-to-crm/index.ts');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');

function readSyncFunction() {
  return fs.readFileSync(syncFunctionPath, 'utf8');
}

function allMigrationSql() {
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    .join('\n');
}

test('calendar import persists event start time to scheduled_at', () => {
  const source = readSyncFunction();

  assert.match(source, /function getEventStartTime\(event: CalendarEvent\): string \| null/);
  assert.match(source, /activity_date:\s*activityDate/);
  assert.match(source, /scheduled_at:\s*startTime/);
  assert.match(source, /completed:\s*startTime \? new Date\(startTime\) < new Date\(\) : false/);
});

test('calendar sync count increment is awaited without throwing into a successful sync', () => {
  const source = readSyncFunction();

  assert.match(source, /async function updateCalendarSyncStats\(userId: string, syncedAt: string\): Promise<void>/);
  assert.match(source, /await supabase\.rpc\('increment_calendar_sync_count', \{ user_id: userId \}\)/);
  assert.doesNotMatch(source, /supabase\.rpc\([^)]*\)\.catch\(/);
  assert.doesNotMatch(source, /calendar_sync_count:\s*supabase\.rpc\s*\?/);
});

test('calendar sync count RPC targets the profile id argument unambiguously', () => {
  const sql = allMigrationSql();

  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+"public"\."increment_calendar_sync_count"\("user_id"\s+"uuid"\)/i);
  assert.match(sql, /WHERE profiles\.id = \$1;/i);
});
