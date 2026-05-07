import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(new URL('../../', import.meta.url).pathname);

test('unified chat lets deterministic mutation cues bypass pre-tool clarification', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');

  assert.match(source, /const deterministicMutationOverride = hasDeterministicMutationCue\(message\)/);
  assert.match(source, /const shouldReturnClarification = !deterministicMutationOverride\s+&& !hasPendingMutationContext/);
});

test('unified chat routes pending deal update confirmations through tools', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');

  assert.match(source, /inferPendingUpdateDealFromHistory/);
  assert.match(source, /pending_deal_update, pending_deal_update_at/);
  assert.match(source, /storePendingDealUpdate/);
  assert.match(source, /const hasPendingUpdateDealContext = !!effectivePendingUpdateDealData/);
  assert.match(source, /hasPendingDeleteDealContext \|\| hasPendingUpdateDealContext \|\| hasPendingDraftEmailContext/);
  assert.match(source, /hasPendingUpdateDealContext && domainFilter && !domainFilter\.includes\('update'\)/);
});

test('unified chat pending schedule confirmations have schema support', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/unified-chat/index.ts'), 'utf8');
  const migration = fs.readFileSync(
    path.join(repoRoot, 'supabase/migrations/20260506023000_add_pending_schedule_meeting_state.sql'),
    'utf8',
  );
  const workflowMigration = fs.readFileSync(
    path.join(repoRoot, 'supabase/migrations/20260506040000_add_missing_chat_pending_workflow_state.sql'),
    'utf8',
  );

  assert.match(source, /pending_schedule_meeting, pending_schedule_meeting_at/);
  assert.match(source, /function isFreshPendingScheduleMeeting/);
  assert.match(source, /PENDING_SCHEDULE_MEETING_MAX_AGE_MS/);
  assert.match(source, /if \(!Number\.isFinite\(timestamp\)\) return false/);
  assert.match(source, /storePendingScheduleMeeting/);
  assert.match(source, /calendar_event_confirmation/);
  assert.match(source, /tool === 'create_calendar_event'[\s\S]*_confirmationType === 'calendar_event'/);
  assert.match(source, /confirmedByPendingWorkflow/);
  assert.match(source, /buildDeterministicPendingScheduleMeetingPlan/);
  assert.match(source, /const immediatePendingSchedulePlan = buildDeterministicPendingScheduleMeetingPlan/);
  assert.match(source, /executeRegistryTool\('schedule_meeting', args/);
  assert.ok(
    source.indexOf('if (deterministicPendingScheduleMeetingPlan)') < source.indexOf('if (deterministicPendingUpdateDealPlan)'),
    'pending schedule confirmation should take precedence over generic pending update plans',
  );
  assert.match(migration, /ALTER TABLE public\.chat_sessions/);
  assert.match(migration, /ALTER TABLE public\.messaging_sessions/);
  assert.match(migration, /pending_schedule_meeting JSONB/);
  assert.match(migration, /pending_schedule_meeting_at TIMESTAMPTZ/);
  assert.match(workflowMigration, /pending_sequence_action JSONB/);
  assert.match(workflowMigration, /pending_draft_email JSONB/);
});
