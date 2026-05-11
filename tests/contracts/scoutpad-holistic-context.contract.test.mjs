import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panelSource = fs.readFileSync('src/components/deals/SimplifiedCoachingPanel.tsx', 'utf8');
const coachingSource = fs.readFileSync('supabase/functions/deal-coaching/index.ts', 'utf8');
const migrationSource = fs.readFileSync('supabase/migrations/20260507143000_enrich_scoutpad_deal_context.sql', 'utf8');
const opportunitiesManagerSource = fs.readFileSync('src/components/opportunities/OpportunitiesManager.tsx', 'utf8');
const dealsPageSource = fs.readFileSync('src/components/opportunities/components/DealsPage.tsx', 'utf8');

test('SCOUTPAD panel loads holistic deal context before coaching', () => {
  assert.match(panelSource, /supabase\.rpc\('get_deal_context_for_llm'/);
  assert.match(panelSource, /mergeHolisticDealContext\(deal,\s*holisticContextResult\.data\)/);
  assert.match(panelSource, /holisticContext:\s*\{/);
  assert.match(panelSource, /recentEmails:\s*rows\(context\.recent_email_messages\)/);
  assert.match(panelSource, /emailEngagement:\s*rows\(context\.email_engagement\)/);
  assert.match(panelSource, /contactMemory:\s*rows\(context\.contact_memory\)/);
});

test('SCOUTPAD backend prompt consumes holistic CRM evidence', () => {
  assert.match(coachingSource, /HOLISTIC CRM EVIDENCE FOR SCOUTPAD/);
  assert.match(coachingSource, /formatRecentEmail/);
  assert.match(coachingSource, /formatEngagement/);
  assert.match(coachingSource, /formatContactMemory/);
  assert.match(coachingSource, /buildHolisticContextSection\(dealData,\s*analysisProfile\.limits\.holisticLimit\)/);
});

test('SCOUTPAD request is compact and fallback-ready for edge runtime', () => {
  assert.match(coachingSource, /DEAL_COACHING_AI_PROVIDER_LIMIT'\)\s*\|\|\s*'3'/);
  assert.match(coachingSource, /DEAL_COACHING_PROVIDER_TIMEOUT_MS'\)\s*\|\|\s*'22000'/);
  assert.match(coachingSource, /Quality analytics will be synthesized deterministically/);
  assert.match(coachingSource, /under 700 characters/);
  assert.match(coachingSource, /raw\?\.evidence\s*\?\?\s*raw\?\.e/);
  assert.match(coachingSource, /payload\.scores/);
  assert.match(coachingSource, /emails\.slice\(0,\s*6\)/);
  assert.match(coachingSource, /Math\.min\(analysisProfile\.maxTokens,\s*240\)/);
  assert.doesNotMatch(coachingSource, /Schedule CFO intro meeting through IT Director/);
});

test('SCOUTPAD does not fabricate an analysis when model output is invalid', () => {
  assert.match(coachingSource, /coerceModelCoachingResult\(parsedInitial\)/);
  assert.match(coachingSource, /aliasedValue\(payload,\s*aliases\)/);
  assert.match(coachingSource, /dealCoachingAiCallLimits\(\)/);
  assert.match(coachingSource, /dealCoachingTier\(analysisProfile\.depthMode\)/);
  assert.match(coachingSource, /DEAL_COACHING_AI_TIER/);
  assert.match(coachingSource, /DEAL_COACHING_PROVIDER_TIMEOUT_MS/);
  assert.match(coachingSource, /AI provider returned an unusable response\. No analysis was saved\. Please retry\./);
  assert.doesNotMatch(coachingSource, /buildDeterministicCoachingResult/);
  assert.doesNotMatch(coachingSource, /deterministic SCOUTPAD fallback/);
  assert.doesNotMatch(coachingSource, /repairModelJson/);
});

test('Opportunities analyze buttons open the local SCOUTPAD dialog', () => {
  assert.match(dealsPageSource, /onCoachDeal\?:\s*\(deal:\s*Deal\)\s*=>\s*void/);
  assert.match(dealsPageSource, /onCoachDeal\(deal\)/);
  assert.match(opportunitiesManagerSource, /onCoachDeal=\{\(deal\)\s*=>\s*openScoutpadAnalysis\(deal\)\}/);
  assert.match(opportunitiesManagerSource, /<SimplifiedCoachingPanel/);
  assert.match(opportunitiesManagerSource, /dealId=\{coachingDeal\.id\}/);
});

test('deal context RPC includes email, engagement, and memory sources', () => {
  assert.match(migrationSource, /recent_email_messages/);
  assert.match(migrationSource, /email_summary/);
  assert.match(migrationSource, /email_engagement_stats/);
  assert.match(migrationSource, /client_memory/);
  assert.match(migrationSource, /'email_message_limit',\s*20/);
  assert.match(migrationSource, /'activity_limit',\s*15/);
});
