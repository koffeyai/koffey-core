import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScoutpadGuardrails, ensureQualityAnalytics } from '../../supabase/functions/deal-coaching/scoutpad-quality.mjs';

function baseResult() {
  return {
    dealScore: { currentProbability: 60, confidenceLevel: 'medium', trendDirection: 'stable', riskLevel: 'medium' },
    scoutpadAnalysis: {
      stakeholders: { score: 8, evidence: ['Multiple stakeholders engaged'], gaps: [], impact: 'Good coverage' },
      champion: { score: 8, evidence: ['Champion engaged'], gaps: [], impact: 'Strong' },
      opportunity: { score: 8, evidence: ['Strong opportunity'], gaps: [], impact: 'Strong' },
      userAgreements: { score: 6, evidence: [], gaps: [], impact: 'Moderate' },
      timeline: { score: 8, evidence: ['Timeline discussed'], gaps: [], impact: 'Likely close soon' },
      problem: { score: 8, evidence: ['Problem mentioned'], gaps: [], impact: 'Important' },
      approvalChain: { score: 7, evidence: [], gaps: [], impact: 'Known' },
      decisionCriteria: { score: 7, evidence: [], gaps: [], impact: 'Known' },
    },
    coaching: { currentNextSteps: [], recommendedNextSteps: [], risks: [], opportunities: [] },
    quarterlyForecast: { closeThisQuarter: 60, atRisk: false, keyMilestones: [], coaching: '' },
  };
}

test('zero stakeholders forces low stakeholder/champion scores and critical risk', () => {
  const result = baseResult();
  applyScoutpadGuardrails(result, { stakeholderRankings: { total: 0, distribution: {} }, timeline: '', notes: '', description: '' });

  assert.ok(result.scoutpadAnalysis.stakeholders.score <= 2);
  assert.ok(result.scoutpadAnalysis.champion.score <= 2);
  assert.equal(result.dealScore.riskLevel, 'critical');
  assert.ok(result.qualityAnalytics.highRiskFindings.length > 0);
  assert.ok(result.qualityAnalytics.guardrailDiagnostics.some((d) => d.triggered));
  assert.ok(Array.isArray(result.proactiveActions) && result.proactiveActions.length > 0);
});

test('single-threaded deal caps champion quality and raises risk', () => {
  const result = baseResult();
  applyScoutpadGuardrails(result, { stakeholderRankings: { total: 1, distribution: { champion_influential: 0 } }, timeline: 'Q4', notes: '', description: '' });

  assert.ok(result.scoutpadAnalysis.champion.score <= 5);
  assert.ok(['high', 'critical'].includes(result.dealScore.riskLevel));
});

test('timeline without concrete dates is capped and flagged', () => {
  const result = baseResult();
  applyScoutpadGuardrails(result, { stakeholderRankings: { total: 3, distribution: { champion_influential: 1 } }, timeline: 'urgent timeline', notes: '', description: '' });

  assert.ok(result.scoutpadAnalysis.timeline.score <= 4);
  assert.ok(result.qualityAnalytics.highRiskFindings.some((f) => f.toLowerCase().includes('timeline')));
  assert.ok(result.qualityAnalytics.guardrailDiagnostics.some((d) => d.rule.includes('timeline')));
});

test('quality analytics is always present and normalized', () => {
  const result = baseResult();
  ensureQualityAnalytics(result);

  assert.ok(result.qualityAnalytics);
  assert.ok(result.qualityAnalytics.overallScore >= 1 && result.qualityAnalytics.overallScore <= 10);
  assert.ok(result.qualityAnalytics.dimensions.stakeholders.qualityScore >= 1);
});

test('quantified opportunity signal preserves stronger opportunity score', () => {
  const result = baseResult();
  applyScoutpadGuardrails(result, {
    stakeholderRankings: { total: 4, distribution: { champion_influential: 1 } },
    timeline: 'Kickoff by 2026-03-15',
    notes: 'Saving $250k annually and reducing churn by 12%',
    description: 'Business case quantified',
  });

  assert.ok(result.scoutpadAnalysis.opportunity.score >= 7);
  assert.ok(result.qualityAnalytics.rubric.evidenceStrength >= 5);
});

test('calibrates implausibly low probability upward when evidence is present', () => {
  const result = baseResult();
  result.dealScore.currentProbability = 5;
  applyScoutpadGuardrails(result, {
    stage: 'qualified',
    stakeholderRankings: { total: 3, distribution: { champion_influential: 1 } },
    timeline: 'Kickoff by 2026-03-15',
    notes: 'Budget approved at $180k with procurement review next week.',
    description: 'Infrastructure consolidation with quantified savings of $300k annually.',
  });

  assert.ok(result.dealScore.currentProbability >= 28);
  assert.ok(result.qualityAnalytics.guardrailDiagnostics.some((d) => d.rule === 'probability_calibration'));
});

test('does not inflate probability when no stakeholders are linked', () => {
  const result = baseResult();
  result.dealScore.currentProbability = 5;
  applyScoutpadGuardrails(result, {
    stage: 'prospecting',
    stakeholderRankings: { total: 0, distribution: {} },
    timeline: '',
    notes: 'Some interest but no validated contacts.',
    description: 'Early exploration.',
  });

  assert.ok(result.dealScore.currentProbability <= 12);
});
