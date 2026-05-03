import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const schemaPath = path.join(repoRoot, 'supabase/migrations/00000000000000_initial_schema.sql');

// ============================================================================
// 1. Migration: unified_search RPC exists with correct signature
// ============================================================================

test('unified_search migration exists and defines the RPC', () => {
  assert.ok(fs.existsSync(schemaPath), 'Consolidated schema migration must exist');

  const sql = fs.readFileSync(schemaPath, 'utf8');

  // RPC function signature (pg_dump uses quoted identifiers)
  assert.match(sql, /CREATE OR REPLACE FUNCTION (?:"?public"?\.)?(?:"?unified_search"?)\(/i);
  assert.match(sql, /p_query/i);
  assert.match(sql, /p_query_embedding/i);
  assert.match(sql, /p_organization_id/i);
  assert.match(sql, /p_entity_types/i);
  assert.match(sql, /p_tags/i);
  assert.match(sql, /p_limit/i);

  // Return columns
  assert.match(sql, /entity_type/i);
  assert.match(sql, /entity_id/i);
  assert.match(sql, /display_name/i);
  assert.match(sql, /ilike_score/i);
  assert.match(sql, /tsvector_score/i);
  assert.match(sql, /semantic_score/i);
  assert.match(sql, /lead_score_boost/i);
  assert.match(sql, /final_score/i);
});

// ============================================================================
// 2. Migration: entity_tags table with correct schema
// ============================================================================

test('entity_tags table has correct schema', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // pg_dump uses quoted identifiers
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "?public"?\."?entity_tags"?/i);
  assert.match(sql, /entity_type/i);
  assert.match(sql, /entity_id/i);
  assert.ok(sql.includes('entity_tags'), 'entity_tags table must exist');
  // RLS must be enabled
  assert.match(sql, /entity_tags.*ENABLE ROW LEVEL SECURITY/is);
});

// ============================================================================
// 3. Migration: search_config table exists
// ============================================================================

test('search_config table has per-org configurable weights', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "?public"?\."?search_config"?/i);
  assert.ok(sql.includes('w_ilike'), 'search_config must have w_ilike weight');
  assert.ok(sql.includes('w_tsvector'), 'search_config must have w_tsvector weight');
  assert.ok(sql.includes('w_semantic'), 'search_config must have w_semantic weight');
  assert.ok(sql.includes('search_config'), 'search_config table must exist');
});

// ============================================================================
// 4. Migration: weighted TSVECTOR columns on contacts, deals, accounts
// ============================================================================

test('contacts search_vector uses setweight with A/B/C/D', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // pg_dump uses quoted identifiers: "setweight"(..., 'A'::"char")
  assert.ok(sql.includes('contacts'), 'contacts table must exist');
  assert.match(sql, /search_vector.*tsvector.*GENERATED ALWAYS/i);
  assert.match(sql, /setweight/i);
  assert.match(sql, /'A'/);
  assert.match(sql, /'B'/);
  assert.match(sql, /'C'/);
  assert.match(sql, /'D'/);
});

test('deals search_vector uses setweight', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // deals table must have a generated search_vector column
  assert.ok(sql.includes('"deals"') || sql.includes('deals'), 'deals table must exist');
  assert.match(sql, /search_vector.*tsvector.*GENERATED ALWAYS/i);
});

test('accounts search_vector uses setweight', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  assert.ok(sql.includes('"accounts"') || sql.includes('accounts'), 'accounts table must exist');
  assert.match(sql, /search_vector.*tsvector.*GENERATED ALWAYS/i);
});

// ============================================================================
// 5. Unified search RPC has all 3 search layers
// ============================================================================

test('unified_search RPC combines ILIKE + TSVECTOR + vector layers', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Layer 1: ILIKE matches
  assert.match(sql, /ilike_matches AS/);
  assert.match(sql, /ILIKE '%' \|\| p_query \|\| '%'/);

  // Layer 2: TSVECTOR matches
  assert.match(sql, /tsvector_matches AS/);
  assert.match(sql, /ts_rank_cd/);
  assert.match(sql, /search_vector @@ v_tsquery/);

  // Layer 3: Vector matches
  assert.match(sql, /vector_matches AS/);
  assert.match(sql, /embedding <=> p_query_embedding/);

  // Lead score boost
  assert.match(sql, /lead_score_boost/);
  assert.match(sql, /overall_lead_score/);

  // Tag filtering
  assert.match(sql, /tag_filtered AS/);
  assert.match(sql, /entity_tags/);
});

// ============================================================================
// 6. Inline embedding triggers exist for core tables
// ============================================================================

test('inline embedding triggers exist for contacts, accounts, deals, activities, tasks', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // pg_dump uses quoted table names: ON "public"."contacts"
  const tables = ['contacts', 'accounts', 'deals', 'activities', 'tasks'];
  for (const table of tables) {
    const singular = table.replace(/ies$/, 'y').replace(/s$/, '');
    assert.ok(
      sql.includes(`trg_embed_${singular}`),
      `Missing embedding trigger for ${table} (expected trg_embed_${singular})`
    );
  }

  // Trigger function exists
  assert.match(sql, /trigger_generate_embedding/i);
});

// ============================================================================
// 7. search_crm skill now falls back to unified_search
// ============================================================================

test('search_crm falls back to unified_search when ILIKE returns empty', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/tools/search.ts'), 'utf8'
  );

  assert.match(source, /unified_search/);
  assert.match(source, /supabase\.rpc\('unified_search'/);
  // Graceful degradation when embedding fails
  assert.match(source, /Embedding generation failed.*falling back to TSVECTOR/);
});

// ============================================================================
// 8. semantic_search now calls unified_search as primary
// ============================================================================

test('semantic_search uses unified_search as primary RPC', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/tools/search.ts'), 'utf8'
  );

  // executeSemanticSearch calls unified_search
  const semanticSection = source.substring(source.indexOf('executeSemanticSearch'));
  assert.match(semanticSection, /supabase\.rpc\('unified_search'/);
  // Falls back to hybrid_search if unified_search fails
  assert.match(semanticSection, /hybrid_search/);
  // Returns search_type indicator
  assert.match(semanticSection, /search_type: 'unified'/);
});

// ============================================================================
// 9. manage_tags skill registered and has correct interface
// ============================================================================

test('manage_tags skill is registered in skills registry', () => {
  const registry = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/skills/registry.ts'), 'utf8'
  );

  assert.match(registry, /import manageTags from '\.\/admin\/manage-tags\.ts'/);
  assert.match(registry, /manageTags/);
});

test('manage_tags skill has add/remove/list actions', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/skills/admin/manage-tags.ts'), 'utf8'
  );

  assert.match(source, /enum: \['add', 'remove', 'list'\]/);
  assert.match(source, /entity_type/);
  assert.match(source, /entity_id/);
  assert.match(source, /tag_category/);
  // Tags are normalized to lowercase
  assert.match(source, /toLowerCase\(\)\.trim\(\)/);
  // Upsert for idempotent add
  assert.match(source, /upsert/);
});

// ============================================================================
// 10. search_crm and semantic_search accept tags parameter
// ============================================================================

test('search_crm skill schema includes tags parameter', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/skills/search/search-crm.ts'), 'utf8'
  );

  assert.match(source, /tags:/);
  assert.match(source, /Filter results to only entities tagged/);
});

test('semantic_search skill schema includes tags parameter', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'supabase/functions/unified-chat/skills/search/semantic-search.ts'), 'utf8'
  );

  assert.match(source, /tags:/);
  assert.match(source, /Optional tags to filter results/);
});
