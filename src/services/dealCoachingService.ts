import { supabase } from '@/integrations/supabase/client';

export const DEAL_COACHING_SYSTEM_PROMPT = `
You are Koffey, an AI RevOps coach with 20+ years of enterprise sales experience. You analyze deals using the SCOUTPAD framework and provide proactive coaching to help salespeople close deals this quarter.

Use all supplied CRM evidence holistically: deal fields, stakeholder map, activities, deal notes, email snippets, email engagement stats, and contact memory. Do not treat missing evidence as positive evidence.

Your analysis MUST return valid JSON in this exact structure:

{
  "dealScore": {
    "currentProbability": 65,
    "confidenceLevel": "medium",
    "trendDirection": "improving|declining|stable",
    "riskLevel": "low|medium|high|critical"
  },
  "scoutpadAnalysis": {
    "stakeholders": {
      "score": 7,
      "evidence": ["VP of Engineering engaged", "CFO not yet involved"],
      "gaps": ["Missing economic buyer", "No procurement contact"],
      "impact": "High - missing key decision makers reduces probability by 15-20%"
    },
    "champion": {
      "score": 8,
      "evidence": ["Director of IT is actively selling internally"],
      "gaps": ["Champion doesn't control budget"],
      "impact": "Medium - strong champion but limited budget authority"
    },
    "opportunity": {
      "score": 6,
      "evidence": ["$2M annual savings identified"],
      "gaps": ["ROI timeline not validated by finance"],
      "impact": "Medium - need CFO validation to increase probability 10%"
    },
    "userAgreements": {
      "score": 5,
      "evidence": ["Verbal agreement on price"],
      "gaps": ["No written proposal accepted", "Terms not negotiated"],
      "impact": "High - formal agreement needed to move from 65% to 80%"
    },
    "timeline": {
      "score": 4,
      "evidence": ["End of quarter urgency mentioned"],
      "gaps": ["No specific implementation dates", "Budget cycle unclear"],
      "impact": "Critical - vague timeline suggests 40% probability drop"
    },
    "problem": {
      "score": 9,
      "evidence": ["System downtime costing $50k/month"],
      "gaps": [],
      "impact": "Low - well-defined pain increases urgency"
    },
    "approvalChain": {
      "score": 3,
      "evidence": ["Know about IT Director approval needed"],
      "gaps": ["CIO, CFO, and CEO approval process unknown"],
      "impact": "Critical - approval uncertainty could delay 2+ quarters"
    },
    "decisionCriteria": {
      "score": 6,
      "evidence": ["Security, scalability, and cost are priorities"],
      "gaps": ["Competitive evaluation process unclear"],
      "impact": "Medium - need to understand how they're comparing vendors"
    }
  },
  "coaching": {
    "currentNextSteps": [
      "Send follow-up email to IT Director",
      "Schedule demo for next week"
    ],
    "recommendedNextSteps": [
      {
        "action": "Schedule CFO intro meeting through IT Director",
        "priority": "critical",
        "timeframe": "this_week",
        "probabilityImpact": "+15%",
        "reasoning": "Economic buyer engagement critical for Q4 close"
      },
      {
        "action": "Create mutual close plan with specific dates",
        "priority": "high", 
        "timeframe": "this_week",
        "probabilityImpact": "+12%",
        "reasoning": "Timeline clarity prevents deal slippage"
      },
      {
        "action": "Map complete approval process with champion",
        "priority": "high",
        "timeframe": "next_week", 
        "probabilityImpact": "+18%",
        "reasoning": "Approval chain clarity essential for forecasting"
      },
      {
        "action": "Get written proposal acceptance from current stakeholders",
        "priority": "medium",
        "timeframe": "next_week",
        "probabilityImpact": "+8%",
        "reasoning": "Formal agreement builds momentum"
      }
    ],
    "risks": [
      {
        "risk": "Deal could slip to Q1 without CFO engagement",
        "probability": "high",
        "mitigation": "Leverage champion to arrange CFO intro within 5 days"
      },
      {
        "risk": "Competitor may have inside track",
        "probability": "medium", 
        "mitigation": "Validate competitive landscape and differentiation"
      }
    ],
    "opportunities": [
      {
        "opportunity": "Expand deal size with additional modules",
        "probability": "medium",
        "action": "Present infrastructure add-ons to reduce total cost"
      }
    ]
  },
  "quarterlyForecast": {
    "closeThisQuarter": 65,
    "atRisk": true,
    "keyMilestones": [
      "CFO meeting by [date]",
      "Proposal acceptance by [date]", 
      "Legal review start by [date]"
    ],
    "coaching": "This deal needs immediate attention on stakeholder expansion to hit Q4 numbers. Focus on economic buyer and approval process this week."
  },
  "qualityAnalytics": {
    "overallScore": 7,
    "confidence": "medium",
    "rubric": {
      "completeness": 7,
      "specificity": 6,
      "evidenceStrength": 7,
      "actionability": 8,
      "stakeholderCoverage": 5
    },
    "dimensions": {
      "stakeholders": {
        "qualityScore": 6,
        "completeness": 5,
        "specificity": 6,
        "evidenceStrength": 7,
        "actionability": 6,
        "rationale": "Some role coverage exists, but economic buyer and procurement mapping are incomplete.",
        "weaknesses": ["No procurement contact", "Economic buyer not confirmed"]
      },
      "champion": {
        "qualityScore": 7,
        "completeness": 7,
        "specificity": 7,
        "evidenceStrength": 6,
        "actionability": 8,
        "rationale": "Champion appears real and active, but influence depth needs validation.",
        "weaknesses": ["Budget authority unclear"]
      },
      "opportunity": {
        "qualityScore": 6,
        "completeness": 6,
        "specificity": 6,
        "evidenceStrength": 7,
        "actionability": 6,
        "rationale": "Business case has value signal but lacks finance-validated ROI timeline.",
        "weaknesses": ["ROI validation pending"]
      },
      "userAgreements": {
        "qualityScore": 5,
        "completeness": 4,
        "specificity": 6,
        "evidenceStrength": 5,
        "actionability": 7,
        "rationale": "Mostly verbal alignment; formal commitments missing.",
        "weaknesses": ["No signed mutual plan", "No written acceptance"]
      },
      "timeline": {
        "qualityScore": 4,
        "completeness": 3,
        "specificity": 4,
        "evidenceStrength": 4,
        "actionability": 6,
        "rationale": "Urgency is stated, but milestone-level dates are weak or absent.",
        "weaknesses": ["No implementation milestones", "Procurement timing unclear"]
      },
      "problem": {
        "qualityScore": 8,
        "completeness": 8,
        "specificity": 8,
        "evidenceStrength": 8,
        "actionability": 7,
        "rationale": "Pain is quantified and linked to business impact.",
        "weaknesses": []
      },
      "approvalChain": {
        "qualityScore": 4,
        "completeness": 3,
        "specificity": 4,
        "evidenceStrength": 5,
        "actionability": 6,
        "rationale": "Known partial approvers, but chain and sequencing not mapped.",
        "weaknesses": ["Legal/procurement path unclear", "Executive sign-off unknown"]
      },
      "decisionCriteria": {
        "qualityScore": 6,
        "completeness": 6,
        "specificity": 6,
        "evidenceStrength": 6,
        "actionability": 7,
        "rationale": "Criteria known at high level, but scoring/weighting and competitor fit are missing.",
        "weaknesses": ["No weighted criteria map"]
      }
    },
    "highRiskFindings": [
      "Single-threaded stakeholder map",
      "Timeline lacks milestone-level certainty"
    ],
    "summary": "Strong pain signal, but close risk remains high due to weak approval map and thin stakeholder coverage."
  }
}

CRITICAL INSTRUCTIONS:
1. Always analyze using SCOUTPAD framework with 1-10 scoring
2. Provide specific, actionable next steps with probability impact
3. Consider deal size and quarterly urgency in recommendations
4. Focus on what can be done THIS WEEK to increase close probability
5. Flag critical risks that could cause deal slippage
6. Only reference information actually provided in the deal data
7. Return ONLY valid JSON - no additional text or formatting
8. Do not treat criteria presence as quality; score depth, specificity, proof, and execution readiness
`;

export interface StakeholderRanking {
  name: string;
  title?: string;
  quadrant: string | null;
  supportScore: number | null;
  influenceScore: number | null;
  roleInDeal?: string;
}

export interface StakeholderRankingsData {
  total: number;
  ranked: number;
  unranked: number;
  distribution: {
    champion_influential: number;
    champion_peripheral: number;
    adversarial_influential: number;
    adversarial_peripheral: number;
  };
  contacts: StakeholderRanking[];
  // Future: Recent changes for trend analysis
  recentChanges?: Array<{
    contactName: string;
    fromQuadrant: string | null;
    toQuadrant: string | null;
    daysAgo: number;
  }>;
}

export interface DealData {
  id?: string;
  organizationId?: string;
  dealSize: number;
  closeDate: string;
  stage: string;
  probability?: number;
  stakeholders?: string;
  lastActivity?: string;
  notes?: string;
  competitorInfo?: string;
  timeline?: string;
  name?: string;
  description?: string;
  accountName?: string;
  holisticContext?: {
    deal?: Record<string, unknown> | null;
    account?: Record<string, unknown> | null;
    primaryContact?: Record<string, unknown> | null;
    stakeholders?: Array<Record<string, unknown>>;
    recentActivities?: Array<Record<string, unknown>>;
    openTasks?: Array<Record<string, unknown>>;
    dealNotes?: Array<Record<string, unknown>>;
    dealTerms?: Record<string, unknown> | null;
    recentEmails?: Array<Record<string, unknown>>;
    emailSummary?: Record<string, unknown> | null;
    emailEngagement?: Array<Record<string, unknown>>;
    contactMemory?: Array<Record<string, unknown>>;
    meta?: Record<string, unknown> | null;
  };
  // Stakeholder power rankings
  stakeholderRankings?: StakeholderRankingsData;
}

export interface DealCoachingResult {
  dealScore: {
    currentProbability: number;
    confidenceLevel: 'low' | 'medium' | 'high';
    trendDirection: 'improving' | 'declining' | 'stable';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  scoutpadAnalysis: {
    stakeholders: ScoutpadDimension;
    champion: ScoutpadDimension;
    opportunity: ScoutpadDimension;
    userAgreements: ScoutpadDimension;
    timeline: ScoutpadDimension;
    problem: ScoutpadDimension;
    approvalChain: ScoutpadDimension;
    decisionCriteria: ScoutpadDimension;
  };
  coaching: {
    currentNextSteps: string[];
    recommendedNextSteps: RecommendedAction[];
    risks: Risk[];
    opportunities: Opportunity[];
  };
  quarterlyForecast: {
    closeThisQuarter: number;
    atRisk: boolean;
    keyMilestones: string[];
    coaching: string;
  };
  qualityAnalytics: {
    overallScore: number;
    confidence: 'low' | 'medium' | 'high';
    rubric: {
      completeness: number;
      specificity: number;
      evidenceStrength: number;
      actionability: number;
      stakeholderCoverage: number;
    };
    dimensions: {
      stakeholders: DimensionQuality;
      champion: DimensionQuality;
      opportunity: DimensionQuality;
      userAgreements: DimensionQuality;
      timeline: DimensionQuality;
      problem: DimensionQuality;
      approvalChain: DimensionQuality;
      decisionCriteria: DimensionQuality;
    };
    guardrailDiagnostics?: Array<{
      rule: string;
      triggered: boolean;
      severity: 'high' | 'critical';
      affectedDimensions: string[];
      before: number;
      after: number;
      reason: string;
    }>;
    highRiskFindings: string[];
    summary: string;
  };
  proactiveActions?: Array<{
    trigger: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    dueWindow: string;
    action: string;
    rationale: string;
  }>;
  analysisMeta?: {
    depthMode: 'focused' | 'standard' | 'deep';
    tokenBudget: {
      estimatedInputTokens: number;
      maxOutputTokens: number;
      estimatedTotalTokens: number;
    };
    daysToClose: number;
  };
}

interface ScoutpadDimension {
  score: number; // 1-10
  evidence: string[];
  gaps: string[];
  impact: string;
}

interface RecommendedAction {
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  timeframe: 'this_week' | 'next_week' | 'this_month';
  probabilityImpact: string;
  reasoning: string;
}

interface Risk {
  risk: string;
  probability: 'high' | 'medium' | 'low';
  mitigation: string;
}

interface Opportunity {
  opportunity: string;
  probability: 'high' | 'medium' | 'low';
  action: string;
}

export interface DimensionQuality {
  qualityScore: number; // 1-10
  completeness: number; // 1-10
  specificity: number; // 1-10
  evidenceStrength: number; // 1-10
  actionability: number; // 1-10
  rationale: string;
  weaknesses: string[];
}

export type ZoomLevel = 'tactical' | 'strategic';

export interface AccountContext {
  wonDeals?: number;
  wonValue?: number;
  totalDeals?: number;
  winRate?: number;
  // Full history for strategic analysis
  history?: Array<{
    name: string;
    amount: number;
    stage: string;
    outcome?: string;
    close_date?: string;
  }>;
}

const SCOUTPAD_KEYS = [
  'stakeholders',
  'champion',
  'opportunity',
  'userAgreements',
  'timeline',
  'problem',
  'approvalChain',
  'decisionCriteria',
] as const;

function clampScore(value: unknown, fallback = 5): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function normalizeRisk(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return 'medium';
}

function normalizeTrend(value: unknown): 'improving' | 'declining' | 'stable' {
  const v = String(value || '').toLowerCase();
  if (v === 'improving' || v === 'declining' || v === 'stable') return v;
  return 'stable';
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function normalizeScoutpadDimension(raw: any): ScoutpadDimension {
  return {
    score: clampScore(raw?.score, 5),
    evidence: ensureStringArray(raw?.evidence),
    gaps: ensureStringArray(raw?.gaps),
    impact: String(raw?.impact || 'Impact requires clarification.'),
  };
}

function normalizeDealCoachingResponse(input: any): DealCoachingResult | null {
  if (!input || typeof input !== 'object') return null;

  const payload = input.result ?? input.data ?? input;
  const scoutpadRaw = payload.scoutpadAnalysis ?? payload.scoutpad_analysis ?? {};
  const qualityRaw = payload.qualityAnalytics ?? payload.quality_analytics ?? {};
  const recommendedRaw = payload.coaching?.recommendedNextSteps ?? payload.coaching?.recommended_next_steps;
  const risksRaw = payload.coaching?.risks;
  const opportunitiesRaw = payload.coaching?.opportunities;

  const scoutpadAnalysis = Object.fromEntries(
    SCOUTPAD_KEYS.map((k) => [k, normalizeScoutpadDimension(scoutpadRaw?.[k])])
  ) as DealCoachingResult['scoutpadAnalysis'];

  const normalized: DealCoachingResult = {
    dealScore: {
      currentProbability: Math.max(0, Math.min(100, Number(payload.dealScore?.currentProbability ?? payload.deal_score?.current_probability ?? 50))),
      confidenceLevel: normalizeConfidence(payload.dealScore?.confidenceLevel ?? payload.deal_score?.confidence_level),
      trendDirection: normalizeTrend(payload.dealScore?.trendDirection ?? payload.deal_score?.trend_direction),
      riskLevel: normalizeRisk(payload.dealScore?.riskLevel ?? payload.deal_score?.risk_level),
    },
    scoutpadAnalysis,
    coaching: {
      currentNextSteps: ensureStringArray(payload.coaching?.currentNextSteps ?? payload.coaching?.current_next_steps),
      recommendedNextSteps: Array.isArray(recommendedRaw)
        ? recommendedRaw.map((step: any) => ({
            action: String(step?.action || step?.task || ''),
            priority: ['critical', 'high', 'medium', 'low'].includes(String(step?.priority || '').toLowerCase())
              ? String(step.priority).toLowerCase() as RecommendedAction['priority']
              : 'medium',
            timeframe: ['this_week', 'next_week', 'this_month'].includes(String(step?.timeframe || '').toLowerCase())
              ? String(step.timeframe).toLowerCase() as RecommendedAction['timeframe']
              : 'this_week',
            probabilityImpact: String(step?.probabilityImpact ?? step?.probability_impact ?? ''),
            reasoning: String(step?.reasoning || ''),
          })).filter((s: RecommendedAction) => s.action)
        : [],
      risks: Array.isArray(risksRaw)
        ? risksRaw.map((risk: any) => ({
            risk: String(risk?.risk || ''),
            probability: ['high', 'medium', 'low'].includes(String(risk?.probability || '').toLowerCase())
              ? String(risk.probability).toLowerCase() as Risk['probability']
              : 'medium',
            mitigation: String(risk?.mitigation || ''),
          })).filter((r: Risk) => r.risk)
        : [],
      opportunities: Array.isArray(opportunitiesRaw)
        ? opportunitiesRaw.map((opp: any) => ({
            opportunity: String(opp?.opportunity || ''),
            probability: ['high', 'medium', 'low'].includes(String(opp?.probability || '').toLowerCase())
              ? String(opp.probability).toLowerCase() as Opportunity['probability']
              : 'medium',
            action: String(opp?.action || ''),
          })).filter((o: Opportunity) => o.opportunity)
        : [],
    },
    quarterlyForecast: {
      closeThisQuarter: Math.max(0, Math.min(100, Number(payload.quarterlyForecast?.closeThisQuarter ?? payload.quarterly_forecast?.close_this_quarter ?? payload.dealScore?.currentProbability ?? 50))),
      atRisk: Boolean(payload.quarterlyForecast?.atRisk ?? payload.quarterly_forecast?.at_risk ?? normalizeRisk(payload.dealScore?.riskLevel) === 'high'),
      keyMilestones: ensureStringArray(payload.quarterlyForecast?.keyMilestones ?? payload.quarterly_forecast?.key_milestones),
      coaching: String(payload.quarterlyForecast?.coaching ?? payload.quarterly_forecast?.coaching ?? ''),
    },
    qualityAnalytics: {
      overallScore: clampScore(qualityRaw?.overallScore ?? qualityRaw?.overall_score, 5),
      confidence: normalizeConfidence(qualityRaw?.confidence),
      rubric: {
        completeness: clampScore(qualityRaw?.rubric?.completeness, 5),
        specificity: clampScore(qualityRaw?.rubric?.specificity, 5),
        evidenceStrength: clampScore(qualityRaw?.rubric?.evidenceStrength ?? qualityRaw?.rubric?.evidence_strength, 5),
        actionability: clampScore(qualityRaw?.rubric?.actionability, 5),
        stakeholderCoverage: clampScore(qualityRaw?.rubric?.stakeholderCoverage ?? qualityRaw?.rubric?.stakeholder_coverage, 5),
      },
      dimensions: Object.fromEntries(
        SCOUTPAD_KEYS.map((k) => [
          k,
          {
            qualityScore: clampScore(qualityRaw?.dimensions?.[k]?.qualityScore ?? qualityRaw?.dimensions?.[k]?.quality_score, 5),
            completeness: clampScore(qualityRaw?.dimensions?.[k]?.completeness, 5),
            specificity: clampScore(qualityRaw?.dimensions?.[k]?.specificity, 5),
            evidenceStrength: clampScore(qualityRaw?.dimensions?.[k]?.evidenceStrength ?? qualityRaw?.dimensions?.[k]?.evidence_strength, 5),
            actionability: clampScore(qualityRaw?.dimensions?.[k]?.actionability, 5),
            rationale: String(qualityRaw?.dimensions?.[k]?.rationale || ''),
            weaknesses: ensureStringArray(qualityRaw?.dimensions?.[k]?.weaknesses),
          } satisfies DimensionQuality,
        ])
      ) as DealCoachingResult['qualityAnalytics']['dimensions'],
      highRiskFindings: ensureStringArray(qualityRaw?.highRiskFindings ?? qualityRaw?.high_risk_findings),
      summary: String(qualityRaw?.summary || ''),
      guardrailDiagnostics: Array.isArray(qualityRaw?.guardrailDiagnostics) ? qualityRaw.guardrailDiagnostics : undefined,
    },
    proactiveActions: Array.isArray(payload.proactiveActions) ? payload.proactiveActions : undefined,
    analysisMeta: payload.analysisMeta,
  };

  if (!normalized.coaching.recommendedNextSteps.length) {
    normalized.coaching.recommendedNextSteps = [{
      action: 'Validate stakeholder map and confirm next decision milestone.',
      priority: 'high',
      timeframe: 'this_week',
      probabilityImpact: '+5%',
      reasoning: 'Fallback action added because model response omitted structured recommendations.',
    }];
  }

  return normalized;
}

export async function coachDeal(
  dealData: DealData,
  providerType: "openai" | "anthropic" | "groq" | "perplexity" = "groq",
  model: string = "default",
  zoomLevel: ZoomLevel = 'tactical',
  accountContext?: AccountContext | any[]
): Promise<DealCoachingResult> {
  try {
    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deal-coaching`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        dealData,
        zoomLevel,
        accountContext,
      }),
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const payloadError = typeof data?.error === 'string'
        ? { message: data.error }
        : (data?.error || {});
      const code = payloadError?.code ? ` (${payloadError.code})` : '';
      const msg = payloadError?.message || `Deal coaching request failed with status ${response.status}`;
      throw new Error(`${msg}${code}`);
    }

    if (data?.error) {
      const payloadError = typeof data.error === 'string'
        ? { message: data.error }
        : (data.error || {});
      const code = payloadError?.code ? ` (${payloadError.code})` : '';
      const msg = payloadError?.message || 'Edge function returned an error payload';
      throw new Error(`${msg}${code}`);
    }

    const normalized = normalizeDealCoachingResponse(data);
    if (!normalized) {
      throw new Error('Invalid coaching result structure');
    }

    return normalized;
    
  } catch (error) {
    console.error('Deal coaching error:', error);
    throw new Error(`Failed to generate deal coaching: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function bulkCoachDeals(
  deals: DealData[],
  providerType: "openai" | "anthropic" | "groq" | "perplexity" = "groq",
  model: string = "default"
): Promise<{ dealData: DealData; coaching: DealCoachingResult }[]> {
  const results = [];
  
  // Process deals in batches to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < deals.length; i += batchSize) {
    const batch = deals.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (deal) => {
        const coaching = await coachDeal(deal, providerType, model);
        return { dealData: deal, coaching };
      })
    );
    
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('Deal coaching failed:', result.reason);
      }
    });
    
    // Add delay between batches
    if (i + batchSize < deals.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

export function getDealUrgencyScore(coaching: DealCoachingResult): number {
  const { dealScore, quarterlyForecast } = coaching;
  
  let urgencyScore = 0;
  
  // Risk level contribution (0-40 points)
  switch (dealScore.riskLevel) {
    case 'critical': urgencyScore += 40; break;
    case 'high': urgencyScore += 30; break;
    case 'medium': urgencyScore += 20; break;
    case 'low': urgencyScore += 10; break;
  }
  
  // At-risk deals get higher urgency (0-30 points)
  if (quarterlyForecast.atRisk) {
    urgencyScore += 30;
  }
  
  // Declining trend increases urgency (0-20 points)
  if (dealScore.trendDirection === 'declining') {
    urgencyScore += 20;
  } else if (dealScore.trendDirection === 'stable') {
    urgencyScore += 10;
  }
  
  // Critical actions increase urgency (0-10 points)
  const criticalActions = coaching.coaching.recommendedNextSteps.filter(
    action => action.priority === 'critical'
  ).length;
  urgencyScore += Math.min(criticalActions * 5, 10);
  
  return Math.min(urgencyScore, 100);
}
