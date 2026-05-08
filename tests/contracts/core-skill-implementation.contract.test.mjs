import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const coreSkillFiles = [
  'supabase/functions/unified-chat/skills/create/create-task.ts',
  'supabase/functions/unified-chat/skills/create/get-tasks.ts',
  'supabase/functions/unified-chat/skills/create/create-activity.ts',
  'supabase/functions/unified-chat/skills/update/update-deal.ts',
  'supabase/functions/unified-chat/skills/update/update-contact.ts',
  'supabase/functions/unified-chat/skills/update/update-account.ts',
  'supabase/functions/unified-chat/skills/update/complete-task.ts',
  'supabase/functions/unified-chat/skills/update/update-stakeholder-role.ts',
];

for (const relFile of coreSkillFiles) {
  test(`${relFile} no longer falls through`, () => {
    const fullPath = path.join(repoRoot, relFile);
    const source = fs.readFileSync(fullPath, 'utf8');
    assert.equal(source.includes('LEGACY_FALLTHROUGH'), false);
    assert.match(source, /execute:\s*async\s*\(ctx:\s*ToolExecutionContext\)\s*=>\s*\{/);
    assert.match(source, /await import\('\.\.\/\.\.\/tools\//);
  });
}

test('stable tool set includes core task/update workflow tools', () => {
  // STABLE_TOOL_SET may be in index.ts or extracted to gateway/cache.ts
  const indexSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');
  const cacheModulePath = path.join(repoRoot, 'supabase/functions/unified-chat/gateway/cache.ts');
  const cacheSource = fs.existsSync(cacheModulePath) ? fs.readFileSync(cacheModulePath, 'utf8') : '';
  const source = indexSource + cacheSource;
  const expected = [
    'create_task',
    'create_activity',
    'get_tasks',
    'update_deal',
    'update_contact',
    'update_account',
    'complete_task',
    'update_stakeholder_role',
  ];

  for (const tool of expected) {
    assert.equal(source.includes(`'${tool}'`), true, `missing ${tool} in STABLE_TOOL_SET`);
  }
});

test('CRM create tools only call embedding dependency through safe wrapper', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/tools/crm-create.ts'), 'utf8');
  const directCalls = source.match(/deps\.triggerEmbedding\(/g) || [];

  assert.equal(directCalls.length, 1, 'embedding dependency should only be invoked inside triggerEmbedding wrapper');
});

test('update_contact can resolve the target contact by existing email', () => {
  const skillSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/skills/update/update-contact.ts'), 'utf8');
  const executorSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/tools/crm-update.ts'), 'utf8');
  const entityUtilsSource = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/tools/entity-utils.ts'), 'utf8');

  assert.match(skillSource, /contact_email/);
  assert.match(executorSource, /contactEmail:\s*contact_email/);
  assert.match(entityUtilsSource, /options\.contactEmail/);
  assert.match(entityUtilsSource, /\.ilike\('email', normalizedEmail\)/);
});
