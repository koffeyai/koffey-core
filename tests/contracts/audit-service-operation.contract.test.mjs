import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(new URL('../../', import.meta.url).pathname);

test('AuditService writes database-compatible audit operation values', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src/services/AuditService.ts'), 'utf8');

  assert.match(source, /create:\s*'INSERT'/);
  assert.match(source, /update:\s*'UPDATE'/);
  assert.match(source, /delete:\s*'DELETE'/);
  assert.match(source, /operation:\s*AUDIT_OPERATION_VALUES\[operation\]/);
});
