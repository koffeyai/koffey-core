import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('deals multi-select exposes a confirmed bulk delete action', () => {
  const dealsPage = readFileSync(
    path.join(repoRoot, 'src/components/opportunities/components/DealsPage.tsx'),
    'utf8'
  );
  const deleteDialog = readFileSync(
    path.join(repoRoot, 'src/components/common/DeleteConfirmationDialog.tsx'),
    'utf8'
  );
  const useCrm = readFileSync(path.join(repoRoot, 'src/hooks/useCRM.ts'), 'utf8');

  assert.match(dealsPage, /bulkOperations/);
  assert.match(dealsPage, /isBulkDeleteOpen/);
  assert.match(dealsPage, /Delete selected/);
  assert.match(dealsPage, /bulkOperations\.delete\(selectedDeals\)/);
  assert.match(dealsPage, /setSelectedDeals\(\[\]\)/);
  assert.match(dealsPage, /title=\{`Delete \$\{selectedDeals\.length\} deal/);
  assert.match(dealsPage, /requireConfirmation/);
  assert.match(dealsPage, /confirmLabel=\{`Delete \$\{selectedDeals\.length\} deal/);
  assert.match(deleteDialog, /confirmLabel \?\? `Delete \$\{entityType\}`/);
  assert.match(useCrm, /recordsToDelete/);
  assert.match(useCrm, /logAudit\('delete', String\(record\.id\), record, undefined\)/);
});
