const SCOUTPAD_DIMENSIONS = [
  'stakeholders',
  'champion',
  'opportunity',
  'userAgreements',
  'timeline',
  'problem',
  'approvalChain',
  'decisionCriteria',
];

const DIMENSION_LABELS = {
  stakeholders: 'Stakeholders',
  champion: 'Champion',
  opportunity: 'Opportunity',
  userAgreements: 'User Agreements',
  timeline: 'Timeline',
  problem: 'Problem',
  approvalChain: 'Approval Chain',
  decisionCriteria: 'Decision Criteria',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampScore(value, fallback = 5) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function includesConcreteDate(text) {
  if (!text || typeof text !== 'string') return false;
  return /(\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\bq[1-4]\b|\bthis week\b|\bnext week\b)/i.test(text);
}

function hasQuantifiedSignal(text) {
  if (!text || typeof text !== 'string') return false;
  return /(\$\s?\d|\b\d+(?:\.\d+)?%\b|\b\d+\s*(?:days?|weeks?|months?|quarters?|years?)\b|\b\d+[kmb]\b)/i.test(text);
}

function flattenDimensionText(dimension = {}) {
  const evidence = asArray(dimension.evidence).join(' ');
  const gaps = asArray(dimension.gaps).join(' ');
  const impact = typeof dimension.impact === 'string' ? dimension.impact : '';
  return `${evidence} ${gaps} ${impact}`.trim();
}

function addGap(dimension, gap) {
  if (!dimension.gaps) dimension.gaps = [];
  if (!dimension.gaps.includes(gap)) dimension.gaps.push(gap);
}

function pushDiagnostic(result, diagnostic) {
  const qa = result.qualityAnalytics || (result.qualityAnalytics = {});
  if (!Array.isArray(qa.guardrailDiagnostics)) qa.guardrailDiagnostics = [];
  qa.guardrailDiagnostics.push(diagnostic);
}

function applyCap(result, dimensionKey, cap, reason, severity = 'high') {
  const dimension = result.scoutpadAnalysis[dimensionKey] || (result.scoutpadAnalysis[dimensionKey] = {});
  const before = clampScore(dimension.score, cap);
  const after = Math.min(before, cap);
  dimension.score = after;
  pushDiagnostic(result, {
    rule: `${dimensionKey}_cap_${cap}`,
    triggered: before !== after,
    severity,
    affectedDimensions: [dimensionKey],
    before,
    after,
    reason,
  });
  return { before, after };
}

function addFinding(result, finding) {
  const qa = result.qualityAnalytics || (result.qualityAnalytics = {});
  if (!Array.isArray(qa.highRiskFindings)) qa.highRiskFindings = [];
  if (!qa.highRiskFindings.includes(finding)) qa.highRiskFindings.push(finding);
}

function setRiskAtLeast(result, minimumRisk) {
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const current = result?.dealScore?.riskLevel || 'medium';
  if (!result.dealScore) result.dealScore = {};
  if (rank[current] < rank[minimumRisk]) result.dealScore.riskLevel = minimumRisk;
}

function clampProbability(value, fallback = 50) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(95, Math.max(5, Math.round(numeric)));
}

function stageProbabilityFloor(stage) {
  const normalized = (stage || '').toString().toLowerCase().replace('-', '_');
  const map = {
    prospecting: 10,
    qualification: 20,
    qualified: 20,
    proposal: 35,
    negotiating: 50,
    negotiation: 50,
    closed_won: 95,
    closed_lost: 5,
  };
  return map[normalized] ?? 12;
}

function calibrateProbability(result, dealData) {
  if (!result.dealScore) result.dealScore = {};

  const rankings = dealData?.stakeholderRankings || {};
  const totalStakeholders = Number.isFinite(rankings.total) ? rankings.total : null;
  const championInfluential = rankings?.distribution?.champion_influential || 0;
  const triggeredDiagnostics = asArray(result?.qualityAnalytics?.guardrailDiagnostics).filter((d) => d?.triggered);

  const dimensionScores = Object.values(result.scoutpadAnalysis || {})
    .map((d) => clampScore(d?.score, 5));
  const avgDimensionScore = dimensionScores.length > 0
    ? Math.round(dimensionScores.reduce((sum, s) => sum + s, 0) / dimensionScores.length)
    : 5;
  const qualityOverall = clampScore(result?.qualityAnalytics?.overallScore, avgDimensionScore);

  const timelineText = `${dealData?.timeline || ''} ${flattenDimensionText(result?.scoutpadAnalysis?.timeline || {})}`;
  const opportunityText = `${dealData?.description || ''} ${dealData?.notes || ''} ${flattenDimensionText(result?.scoutpadAnalysis?.opportunity || {})}`;
  const approvalText = `${flattenDimensionText(result?.scoutpadAnalysis?.approvalChain || {})} ${dealData?.notes || ''}`;

  const hasTimelineDates = includesConcreteDate(timelineText);
  const hasQuantifiedOpportunity = hasQuantifiedSignal(opportunityText);
  const hasApprovalEvidence = /(approval|approver|procurement|legal|security review|cfo|cio|ceo|vp|sign[- ]?off)/i.test(approvalText);

  const stageFloor = stageProbabilityFloor(dealData?.stage);

  let modelProbability = typeof result?.dealScore?.currentProbability === 'number'
    ? result.dealScore.currentProbability
    : null;

  let calibrated = stageFloor;
  calibrated += (avgDimensionScore - 5) * 6;
  calibrated += (qualityOverall - 5) * 2;
  if (totalStakeholders !== null && totalStakeholders >= 2) calibrated += 5;
  if (totalStakeholders !== null && totalStakeholders >= 3) calibrated += 4;
  if (championInfluential > 0) calibrated += 6;
  if (hasTimelineDates) calibrated += 4;
  if (hasQuantifiedOpportunity) calibrated += 4;
  if (hasApprovalEvidence) calibrated += 3;

  for (const diag of triggeredDiagnostics) {
    calibrated -= diag.severity === 'critical' ? 8 : 4;
  }
  calibrated = clampProbability(calibrated, stageFloor);

  let evidenceFloor = 5;
  if (totalStakeholders !== null && totalStakeholders >= 2) evidenceFloor = Math.max(evidenceFloor, 18);
  if (totalStakeholders !== null && totalStakeholders >= 3) evidenceFloor = Math.max(evidenceFloor, 24);
  if (championInfluential > 0) evidenceFloor = Math.max(evidenceFloor, 28);
  if (hasTimelineDates && hasQuantifiedOpportunity) evidenceFloor = Math.max(evidenceFloor, 30);
  evidenceFloor = Math.max(evidenceFloor, stageFloor);

  let finalProbability = modelProbability == null ? calibrated : clampProbability(modelProbability, calibrated);
  const before = finalProbability;
  let reason = '';

  if (modelProbability == null) {
    finalProbability = calibrated;
    reason = 'Model omitted probability; using calibrated probability from stage, evidence, and guardrails.';
  } else if (finalProbability < evidenceFloor && qualityOverall >= 4) {
    finalProbability = evidenceFloor;
    reason = `Probability raised to evidence floor (${evidenceFloor}%) based on verified stakeholder/evidence depth.`;
  } else if (Math.abs(finalProbability - calibrated) > 40 && qualityOverall >= 6 && finalProbability < calibrated) {
    finalProbability = clampProbability((finalProbability + calibrated) / 2, calibrated);
    reason = 'Probability adjusted upward due to extreme model-calibration divergence with adequate evidence quality.';
  }

  result.dealScore.currentProbability = clampProbability(finalProbability, calibrated);
  if (typeof result?.quarterlyForecast?.closeThisQuarter === 'number') {
    result.quarterlyForecast.closeThisQuarter = clampProbability(
      Math.max(result.quarterlyForecast.closeThisQuarter, result.dealScore.currentProbability - 3),
      result.dealScore.currentProbability
    );
  }

  pushDiagnostic(result, {
    rule: 'probability_calibration',
    triggered: reason.length > 0,
    severity: 'high',
    affectedDimensions: ['dealScore'],
    before: clampProbability(before, calibrated),
    after: result.dealScore.currentProbability,
    reason: reason || 'Probability remained within calibrated bounds.',
  });
}

function buildDimensionQuality(dimension, key) {
  const score = clampScore(dimension?.score, 5);
  const evidenceCount = asArray(dimension?.evidence).length;
  const gapsCount = asArray(dimension?.gaps).length;

  const completeness = clampScore(score - Math.min(gapsCount, 3) + (evidenceCount > 1 ? 1 : 0), 5);
  const specificity = clampScore((dimension?.impact && typeof dimension.impact === 'string' && /(\d|%|date|by\s)/i.test(dimension.impact)) ? score : score - 2, 4);
  const evidenceStrength = clampScore(score + (evidenceCount > 2 ? 1 : 0) - (evidenceCount === 0 ? 2 : 0), 4);
  const actionability = clampScore(score - (gapsCount > 2 ? 1 : 0), 5);

  return {
    qualityScore: clampScore(Math.round((completeness + specificity + evidenceStrength + actionability) / 4), score),
    completeness,
    specificity,
    evidenceStrength,
    actionability,
    rationale: `Quality derived from ${key} score (${score}/10), evidence depth (${evidenceCount}), and gaps (${gapsCount}).`,
    weaknesses: asArray(dimension?.gaps).slice(0, 3),
  };
}

export function ensureQualityAnalytics(result) {
  const dimensions = result?.scoutpadAnalysis || {};
  const provided = result?.qualityAnalytics?.dimensions || {};

  const normalizedDimensions = Object.fromEntries(
    SCOUTPAD_DIMENSIONS.map((key) => {
      const existing = provided[key];
      if (existing && typeof existing === 'object') {
        return [key, {
          qualityScore: clampScore(existing.qualityScore, dimensions[key]?.score || 5),
          completeness: clampScore(existing.completeness, dimensions[key]?.score || 5),
          specificity: clampScore(existing.specificity, dimensions[key]?.score || 5),
          evidenceStrength: clampScore(existing.evidenceStrength, dimensions[key]?.score || 5),
          actionability: clampScore(existing.actionability, dimensions[key]?.score || 5),
          rationale: typeof existing.rationale === 'string' ? existing.rationale : `Quality assessment for ${key}.`,
          weaknesses: asArray(existing.weaknesses),
        }];
      }
      return [key, buildDimensionQuality(dimensions[key], key)];
    })
  );

  const all = Object.values(normalizedDimensions);
  const avg = (selector) => clampScore(Math.round(all.reduce((s, d) => s + selector(d), 0) / Math.max(all.length, 1)), 5);

  const stakeholderCoverage = clampScore(
    Math.round((normalizedDimensions.stakeholders.qualityScore + normalizedDimensions.champion.qualityScore + normalizedDimensions.approvalChain.qualityScore) / 3),
    5
  );

  const overall = clampScore(
    Math.round((avg((d) => d.completeness) + avg((d) => d.specificity) + avg((d) => d.evidenceStrength) + avg((d) => d.actionability) + stakeholderCoverage) / 5),
    5
  );

  const confidence = overall >= 8 ? 'high' : overall >= 6 ? 'medium' : 'low';

  const highRiskFindings = SCOUTPAD_DIMENSIONS
    .filter((key) => normalizedDimensions[key].qualityScore <= 4)
    .map((key) => `${key} quality is below acceptable threshold`);

  result.qualityAnalytics = {
    overallScore: clampScore(result?.qualityAnalytics?.overallScore, overall),
    confidence: result?.qualityAnalytics?.confidence || confidence,
    rubric: {
      completeness: clampScore(result?.qualityAnalytics?.rubric?.completeness, avg((d) => d.completeness)),
      specificity: clampScore(result?.qualityAnalytics?.rubric?.specificity, avg((d) => d.specificity)),
      evidenceStrength: clampScore(result?.qualityAnalytics?.rubric?.evidenceStrength, avg((d) => d.evidenceStrength)),
      actionability: clampScore(result?.qualityAnalytics?.rubric?.actionability, avg((d) => d.actionability)),
      stakeholderCoverage: clampScore(result?.qualityAnalytics?.rubric?.stakeholderCoverage, stakeholderCoverage),
    },
    dimensions: normalizedDimensions,
    guardrailDiagnostics: asArray(result?.qualityAnalytics?.guardrailDiagnostics),
    highRiskFindings: asArray(result?.qualityAnalytics?.highRiskFindings).length > 0
      ? asArray(result?.qualityAnalytics?.highRiskFindings)
      : highRiskFindings,
    summary: typeof result?.qualityAnalytics?.summary === 'string'
      ? result.qualityAnalytics.summary
      : 'Quality analytics synthesized from SCOUTPAD evidence depth and execution readiness.',
  };
}

export function applyScoutpadGuardrails(result, dealData) {
  if (!result?.scoutpadAnalysis) return;

  const rankings = dealData?.stakeholderRankings || {};
  const totalStakeholders = Number.isFinite(rankings.total) ? rankings.total : null;
  const championInfluential = rankings?.distribution?.champion_influential || 0;

  const stakeholdersDim = result.scoutpadAnalysis.stakeholders || (result.scoutpadAnalysis.stakeholders = {});
  const championDim = result.scoutpadAnalysis.champion || (result.scoutpadAnalysis.champion = {});
  const timelineDim = result.scoutpadAnalysis.timeline || (result.scoutpadAnalysis.timeline = {});
  const opportunityDim = result.scoutpadAnalysis.opportunity || (result.scoutpadAnalysis.opportunity = {});
  const problemDim = result.scoutpadAnalysis.problem || (result.scoutpadAnalysis.problem = {});
  const approvalDim = result.scoutpadAnalysis.approvalChain || (result.scoutpadAnalysis.approvalChain = {});

  if (totalStakeholders === 0) {
    applyCap(result, 'stakeholders', 2, 'No stakeholders linked in CRM', 'critical');
    applyCap(result, 'champion', 2, 'No stakeholders means no verifiable champion', 'critical');
    addGap(stakeholdersDim, 'No linked stakeholders in CRM record');
    addGap(championDim, 'No identified champion in linked stakeholders');
    addFinding(result, 'No linked stakeholders: analysis confidence reduced');
    setRiskAtLeast(result, 'critical');
  }

  if (totalStakeholders === 1) {
    applyCap(result, 'champion', 5, 'Single-threaded deal caps champion confidence');
    applyCap(result, 'stakeholders', 4, 'Single-threaded coverage is high risk');
    addGap(championDim, 'Single-threaded deal limits champion effectiveness');
    addFinding(result, 'Single-threaded stakeholder map creates high close risk');
    setRiskAtLeast(result, 'high');
  }

  if (totalStakeholders !== null && totalStakeholders > 0 && championInfluential === 0) {
    applyCap(result, 'champion', 3, 'No influential champion in stakeholder rankings', 'critical');
    addGap(championDim, 'No influential champion identified in rankings');
    addFinding(result, 'No influential champion identified');
    setRiskAtLeast(result, 'high');
  }

  const timelineText = `${dealData?.timeline || ''} ${flattenDimensionText(timelineDim)}`;
  if (!includesConcreteDate(timelineText)) {
    applyCap(result, 'timeline', 4, 'Timeline lacks concrete milestone dates/owners', 'critical');
    addGap(timelineDim, 'No concrete milestone dates with owners');
    addFinding(result, 'Timeline lacks concrete milestones and date certainty');
    setRiskAtLeast(result, 'high');
  }

  const opportunityText = `${dealData?.description || ''} ${dealData?.notes || ''} ${flattenDimensionText(opportunityDim)}`;
  if (!hasQuantifiedSignal(opportunityText)) {
    applyCap(result, 'opportunity', 6, 'Opportunity lacks quantified business value');
    addGap(opportunityDim, 'Opportunity not quantified with measurable business impact');
    addFinding(result, 'Opportunity quality weak: missing quantified value signal');
  }

  const problemText = `${dealData?.notes || ''} ${dealData?.description || ''} ${flattenDimensionText(problemDim)}`;
  if (!hasQuantifiedSignal(problemText)) {
    applyCap(result, 'problem', 7, 'Problem lacks quantified impact/cost-of-inaction');
    addGap(problemDim, 'Problem statement lacks quantified impact/cost of inaction');
  }

  const approvalText = `${flattenDimensionText(approvalDim)} ${dealData?.notes || ''}`;
  if (!/(approval|approver|procurement|legal|security review|cfo|cio|ceo|vp|sign[- ]?off)/i.test(approvalText)) {
    applyCap(result, 'approvalChain', 5, 'Approval path evidence is weak or missing');
    addGap(approvalDim, 'Approval path is not explicitly mapped');
    addFinding(result, 'Approval chain evidence is weak or missing');
  }

  ensureQualityAnalytics(result);
  calibrateProbability(result, dealData);

  const diagnostics = asArray(result?.qualityAnalytics?.guardrailDiagnostics).filter((d) => d?.triggered);
  const proactive = [];
  for (const d of diagnostics.slice(0, 5)) {
    const dim = d.affectedDimensions?.[0];
    const title = dim && DIMENSION_LABELS[dim] ? DIMENSION_LABELS[dim] : 'Deal quality';
    proactive.push({
      trigger: d.rule,
      priority: d.severity === 'critical' ? 'critical' : 'high',
      dueWindow: d.severity === 'critical' ? '48_hours' : '7_days',
      action: `Improve ${title}: ${d.reason}`,
      rationale: `Guardrail reduced score from ${d.before}/10 to ${d.after}/10.`,
    });
  }
  result.proactiveActions = proactive;
}

export const __private__ = {
  clampScore,
  includesConcreteDate,
  hasQuantifiedSignal,
};
