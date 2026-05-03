import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { 
  validateInput, 
  checkRateLimit, 
  validateOrganizationAccess,
  createSecureErrorResponse 
} from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { AI_CONFIG } from '../_shared/ai-config.ts';
import { callWithFallback } from '../_shared/ai-provider.ts';
import { ensureQualityAnalytics, applyScoutpadGuardrails } from './scoutpad-quality.mjs';

let corsHeaders = getCorsHeaders();

// Simplified LLM interface - Groq only
interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class ClientSafeError extends Error {
  code: string;
  status: number;
  retryable: boolean;

  constructor(code: string, message: string, status = 500, retryable = false) {
    super(message);
    this.name = 'ClientSafeError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

function truncateText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function buildAnalysisProfile(dealData: any, zoomLevel?: string) {
  const notes = typeof dealData?.notes === 'string' ? dealData.notes : '';
  const description = typeof dealData?.description === 'string' ? dealData.description : '';
  const timeline = typeof dealData?.timeline === 'string' ? dealData.timeline : '';
  const competitors = typeof dealData?.competitorInfo === 'string' ? dealData.competitorInfo : '';
  const inputEstimate = estimateTokens(`${notes}\n${description}\n${timeline}\n${competitors}`);

  const closeDate = dealData?.closeDate ? new Date(dealData.closeDate).getTime() : NaN;
  const daysToClose = Number.isFinite(closeDate) ? Math.max(0, Math.ceil((closeDate - Date.now()) / (1000 * 60 * 60 * 24))) : 90;
  const urgencyBoost = daysToClose <= 21 ? 1 : 0;

  let depthMode: 'focused' | 'standard' | 'deep' = 'standard';
  if (inputEstimate > 1400) depthMode = 'focused';
  if (inputEstimate < 700 && urgencyBoost) depthMode = 'deep';
  if (zoomLevel === 'strategic' && inputEstimate < 1200) depthMode = 'deep';

  const depthConfig = {
    focused: { maxTokens: 1200, notesLimit: 1800, descriptionLimit: 1400, timelineLimit: 500, competitorLimit: 500 },
    standard: { maxTokens: 1700, notesLimit: 2600, descriptionLimit: 1800, timelineLimit: 700, competitorLimit: 700 },
    deep: { maxTokens: 2400, notesLimit: 3600, descriptionLimit: 2600, timelineLimit: 1000, competitorLimit: 1000 },
  }[depthMode];

  return {
    depthMode,
    inputEstimate,
    daysToClose,
    maxTokens: Math.min(depthConfig.maxTokens, AI_CONFIG.defaultMaxTokens),
    limits: depthConfig,
  };
}

function quarterLabel(dateLike: unknown): string {
  const date = dateLike ? new Date(String(dateLike)) : new Date();
  const validDate = Number.isFinite(date.getTime()) ? date : new Date();
  const month = validDate.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  const year = validDate.getFullYear();
  return `Q${quarter} ${year}`;
}

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('```json')) {
    return trimmed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  }
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return trimmed;
}

function extractLikelyJsonObject(content: string): string | null {
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return content.slice(first, last + 1);
}

function tryParseJson(content: string): any | null {
  const cleaned = stripCodeFences(content || '');
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const extracted = extractLikelyJsonObject(cleaned);
    if (!extracted) return null;
    try {
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}

function isValidCoachingShape(result: any): boolean {
  return !!(
    result &&
    typeof result === 'object' &&
    result.dealScore &&
    result.scoutpadAnalysis &&
    result.coaching &&
    typeof result.dealScore.currentProbability !== 'undefined'
  );
}

function mapProviderFailure(error: any): ClientSafeError {
  const statusCode = Number(error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();

  if (
    message.includes('api key not configured') ||
    message.includes('no api key') ||
    message.includes('no ai provider') ||
    message.includes('provider not configured')
  ) {
    return new ClientSafeError(
      'MODEL_NOT_CONFIGURED',
      'AI provider credentials are not configured in edge-function secrets. Configure a supported provider and retry.',
      503,
      false
    );
  }
  if (statusCode === 401 || statusCode === 403 || message.includes('invalid_api_key') || message.includes('unauthorized')) {
    return new ClientSafeError(
      'MODEL_AUTH_FAILED',
      'AI provider authentication failed. Verify your configured provider API key and retry.',
      503,
      false
    );
  }
  if (statusCode === 404) {
    return new ClientSafeError(
      'MODEL_ENDPOINT_INVALID',
      'AI provider endpoint is invalid. Verify the configured provider base URL and retry.',
      503,
      false
    );
  }
  if ([408, 429, 500, 502, 503, 504].includes(statusCode) || message.includes('timed out') || message.includes('all ai providers failed')) {
    return new ClientSafeError(
      'MODEL_UNREACHABLE',
      'AI provider is currently unreachable from the edge function. Check provider availability and network configuration.',
      503,
      true
    );
  }

  return new ClientSafeError(
    'MODEL_UNAVAILABLE',
    'AI model is unavailable right now. Please retry shortly.',
    503,
    true
  );
}

async function repairModelJson(rawContent: string): Promise<any | null> {
  if (!rawContent || !rawContent.trim()) return null;
  const repairPrompt = `
You are a strict JSON repair assistant.
Convert the following model output into VALID JSON ONLY.

Rules:
- Return one JSON object and nothing else.
- Keep meaning faithful to source text.
- Required top-level keys: dealScore, scoutpadAnalysis, coaching.
- dealScore must include currentProbability, confidenceLevel, trendDirection, riskLevel.

Source output:
${rawContent.slice(0, 12000)}
`.trim();

  try {
    const repairMessages = [
      { role: 'system', content: 'Return valid JSON only. No markdown.' },
      { role: 'user', content: repairPrompt },
    ];
    let repaired;
    try {
      repaired = await callWithFallback({
        messages: repairMessages,
        tier: 'standard',
        temperature: 0,
        maxTokens: 1800,
        jsonMode: true,
      });
    } catch (error: any) {
      // Some providers reject response_format/json mode with HTTP 400.
      if (Number(error?.statusCode || 0) !== 400) throw error;
      repaired = await callWithFallback({
        messages: repairMessages,
        tier: 'standard',
        temperature: 0,
        maxTokens: 1800,
        jsonMode: false,
      });
    }
    return tryParseJson(repaired.content || '');
  } catch {
    return null;
  }
}

const DEAL_COACHING_SYSTEM_PROMPT = `
You are Koffey, an AI RevOps coach with 20+ years of enterprise sales experience. You analyze deals using the SCOUTPAD framework and provide proactive coaching to help salespeople close deals this quarter.

## CRITICAL: DATA ISOLATION

You are analyzing ONE DEAL in isolation. Your analysis must:
1. ONLY use the deal information provided below
2. NEVER reference other deals, even if you "remember" them from training
3. NEVER infer industry benchmarks unless explicitly requested
4. NEVER say "compared to typical deals" - analyze THIS deal on its merits

When Account History is provided (Strategic Mode):
- You may reference ONLY the deals listed in the ACCOUNT RELATIONSHIP HISTORY section
- These are deals with the SAME account/company
- This is appropriate because it's the same customer relationship

When Account History is NOT provided (Tactical Mode):
- Analyze the deal in complete isolation
- Do not speculate about account history
- Focus purely on the information given

## SCOUTPAD FRAMEWORK

### CRITICAL SCORING RULES

**Stakeholders (S):**
- If 0 stakeholders are linked to the deal, score MUST be 1-2. You cannot score stakeholder coverage without actual people identified.
- Evaluate breadth: economic buyer, technical buyer, champion, end-user, procurement — how many roles are covered?
- More diverse stakeholder roles = higher score.

**Champion (C):**
- A "champion" is a SPECIFIC PERSON who: (a) actively advocates for your solution internally, (b) provides insider information about the buying process, (c) facilitates access to other stakeholders (multi-threading), and (d) has organizational influence to affect the decision.
- If NO stakeholders are linked to the deal, Champion score MUST be 1-2 regardless of what notes say. A vague mention like "champion is engaged" without an identified person is NOT evidence of a champion.
- If stakeholders are linked but NONE are ranked as Champion/Influential, score MUST be 1-3.
- A champion who does NOT enable multi-threading (access to other decision-makers) caps at 5/10. Single-threaded deals where only one contact is engaged are high risk.
- To score 7+, there must be: (a) a named champion with influence, (b) evidence of multi-threading (2+ stakeholders engaged across different roles), AND (c) the champion is actively selling internally.
- To score 9+, all of the above PLUS the champion has budget authority or direct access to the economic buyer.

**Multi-Threading Assessment:**
- Count distinct stakeholder roles engaged (not just number of contacts).
- 1 contact only = "single-threaded" = high risk, penalize Champion AND Stakeholders scores.
- 2-3 contacts across different roles = adequate threading.
- 4+ contacts across buyer roles, technical, and executive = strong multi-threading.

### QUALITY ANALYTICS RUBRIC (MANDATORY)
- Do NOT score based on checkbox existence alone.
- For each SCOUTPAD dimension, evaluate quality depth on 1-10 for:
  1) completeness
  2) specificity
  3) evidenceStrength
  4) actionability
- Compute a dimension "qualityScore" and explain rationale + weaknesses.
- Penalize vague language like "engaged", "interested", or "timeline discussed" unless supported by concrete evidence.
- Timeline quality must include concrete milestone dates, owner, and sequencing confidence.
- Stakeholder quality must include role coverage quality (economic buyer, technical buyer, user, procurement, legal/executive as applicable).
- Opportunity quality must include quantified business value, validation source, and urgency anchor.
- Problem quality must include impact quantification and consequence of inaction.

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
      "evidence": ["Director of IT is actively selling internally", "Enabled meetings with VP Engineering and CFO"],
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
        "rationale": "Role coverage exists but is incomplete for close certainty.",
        "weaknesses": ["Missing economic buyer confirmation"]
      },
      "champion": {
        "qualityScore": 7,
        "completeness": 7,
        "specificity": 7,
        "evidenceStrength": 6,
        "actionability": 8,
        "rationale": "Champion exists with partial influence and good motion.",
        "weaknesses": ["Budget authority unclear"]
      },
      "opportunity": {
        "qualityScore": 6,
        "completeness": 6,
        "specificity": 6,
        "evidenceStrength": 7,
        "actionability": 6,
        "rationale": "Value proposition present but not finance-validated end-to-end.",
        "weaknesses": ["ROI validation missing"]
      },
      "userAgreements": {
        "qualityScore": 5,
        "completeness": 4,
        "specificity": 6,
        "evidenceStrength": 5,
        "actionability": 7,
        "rationale": "Verbal alignment exceeds formal commitment.",
        "weaknesses": ["No written acceptance"]
      },
      "timeline": {
        "qualityScore": 4,
        "completeness": 3,
        "specificity": 4,
        "evidenceStrength": 4,
        "actionability": 6,
        "rationale": "Timeline urgency exists but milestone certainty is weak.",
        "weaknesses": ["Missing dated milestones", "Procurement sequencing unclear"]
      },
      "problem": {
        "qualityScore": 8,
        "completeness": 8,
        "specificity": 8,
        "evidenceStrength": 8,
        "actionability": 7,
        "rationale": "Pain is clear, quantified, and business-relevant.",
        "weaknesses": []
      },
      "approvalChain": {
        "qualityScore": 4,
        "completeness": 3,
        "specificity": 4,
        "evidenceStrength": 5,
        "actionability": 6,
        "rationale": "Partial approval map with major uncertainty remaining.",
        "weaknesses": ["Legal/procurement steps undefined"]
      },
      "decisionCriteria": {
        "qualityScore": 6,
        "completeness": 6,
        "specificity": 6,
        "evidenceStrength": 6,
        "actionability": 7,
        "rationale": "Known criteria are usable but not fully weighted/verified.",
        "weaknesses": ["No weighted criteria scorecard"]
      }
    },
    "highRiskFindings": [
      "Stakeholder coverage quality below threshold",
      "Timeline confidence below threshold"
    ],
    "summary": "This deal has useful signals, but quality depth is uneven and creates forecast risk."
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
8. Quality analytics is mandatory and must reflect depth, not checkbox presence
`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Get user ID for rate limiting
    const authHeader = req.headers.get('authorization');
    const userId = authHeader?.replace('Bearer ', '') || 'anonymous';
    
    // Rate limiting: 30 requests per hour per user (coaching is more intensive)
    const rateLimitResult = checkRateLimit(`deal-coaching:${userId}`, {
      requests: 30,
      windowMs: 3600000, // 1 hour
      blockDurationMs: 600000 // 10 minutes
    });

    if (!rateLimitResult.allowed) {
      return createSecureErrorResponse(
        new Error('Rate limit exceeded'),
        'Too many coaching requests. Please wait before trying again.',
        429
      );
    }

    const requestBody = await req.json();
    
    // Input validation
    const validation = validateInput(requestBody, {
      type: 'object',
      required: ['dealData']
    });

    if (!validation.isValid) {
      return createSecureErrorResponse(
        new Error('Invalid input'),
        `Invalid request: ${validation.errors.join(', ')}`,
        400
      );
    }

    const { 
      dealData, 
      organizationId,
      userId: reqUserId,
      zoomLevel,
      accountContext
    } = validation.sanitizedData;

    // Validate organization access if provided
    if (organizationId && reqUserId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const hasAccess = await validateOrganizationAccess(supabase, reqUserId, organizationId);
      if (!hasAccess) {
        return createSecureErrorResponse(
          new Error('Access denied'),
          'Access to organization denied',
          403
        );
      }
    }

    // Analyze the deal through the unified provider chain.
    const result = await analyzeDeal(dealData, zoomLevel, accountContext);

    // Log the coaching session if org/user provided
    if (organizationId && reqUserId) {
      await logCoachingSession(dealData, result, organizationId, reqUserId);
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    if (error instanceof ClientSafeError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: error.code,
            message: 'Request could not be processed',
            retryable: error.retryable,
          },
          timestamp: Date.now(),
        }),
        {
          status: error.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.error('Deal coaching error:', error);
    return createSecureErrorResponse(
      error,
      'Failed to analyze deal. Please try again.',
      500
    );
  }
};

async function analyzeDeal(dealData: any, zoomLevel?: string, accountContext?: any) {
  const analysisProfile = buildAnalysisProfile(dealData, zoomLevel);
  // Build stakeholder ranking context if available
  let stakeholderContext = dealData.stakeholders || 'No stakeholder information';
  let stakeholderRankingPrompt = '';

  // If stakeholder rankings are explicitly provided with total=0, signal clearly
  if (dealData.stakeholderRankings && dealData.stakeholderRankings.total === 0) {
    stakeholderRankingPrompt = `

⚠️ ZERO STAKEHOLDERS LINKED: No contacts are linked to this deal. Stakeholders score MUST be 1-2. Champion score MUST be 1-2. This deal is critically single-threaded with no identified champion, economic buyer, or any stakeholder. Any mentions of "champion" or "stakeholder engagement" in notes are unverified claims without actual contacts on record.`;
    stakeholderContext = '0 stakeholders linked to deal (CRITICAL GAP)';
  } else if (dealData.stakeholderRankings) {
    const rankings = dealData.stakeholderRankings;
    const distribution = rankings.distribution || {};
    
    stakeholderContext = `
${rankings.total} stakeholders identified:
- Champions (Influential): ${distribution.champion_influential || 0}
- Supporters (Peripheral): ${distribution.champion_peripheral || 0}
- Blockers (Influential): ${distribution.adversarial_influential || 0}
- Neutral (Peripheral): ${distribution.adversarial_peripheral || 0}
- Unranked: ${rankings.unranked || 0}

Stakeholder Details:
${(rankings.contacts || []).slice(0, 10).map((c: any) => 
  `- ${c.name}${c.title ? ` (${c.title})` : ''}: ${c.quadrant ? c.quadrant.replace('_', ' → ') : 'UNRANKED'}${c.roleInDeal ? ` [${c.roleInDeal}]` : ''}`
).join('\n')}`.trim();

    // Add coaching prompt for unranked stakeholders
    if (rankings.unranked > 0) {
      const unrankedCount = Math.min(rankings.unranked, 10);
      stakeholderRankingPrompt = `

⚠️ STAKEHOLDER RANKING NEEDED: ${unrankedCount} stakeholder(s) have not been ranked. Include a recommendation to rank these stakeholders for more accurate deal assessment.`;
    }
    
    // Add warning if no influential champions
    if ((distribution.champion_influential || 0) === 0) {
      stakeholderRankingPrompt += `

⚠️ NO INFLUENTIAL CHAMPIONS: This deal has no stakeholders ranked as both Champion and Influential. This is a significant risk factor - prioritize developing executive sponsorship.`;
    }
    
    // Add warning if influential adversaries exist
    if ((distribution.adversarial_influential || 0) > 0) {
      stakeholderRankingPrompt += `

⚠️ INFLUENTIAL BLOCKERS DETECTED: ${distribution.adversarial_influential} stakeholder(s) are ranked as Adversarial with high Influence. Address these blockers or mitigate their influence.`;
    }

    // Add single-threading warning
    if (rankings.total === 1) {
      stakeholderRankingPrompt += `

⚠️ SINGLE-THREADED DEAL: Only 1 stakeholder linked. This deal depends entirely on one contact. Champion score MUST be capped at 5/10 maximum. A true champion enables multi-threading — access to other decision-makers. Recommend urgent stakeholder expansion.`;
    } else if (rankings.total >= 2 && rankings.total <= 3) {
      stakeholderRankingPrompt += `

ℹ️ LIMITED THREADING: ${rankings.total} stakeholders linked. Adequate but not strong. Evaluate role diversity — are multiple buyer roles represented (economic, technical, user, executive)?`;
    }
  }

  // Build account relationship history section for strategic analysis
  let accountHistorySection = '';
  if (zoomLevel === 'strategic' && accountContext) {
    const history = Array.isArray(accountContext) ? accountContext : [];
    const wonDeals = history.filter((d: any) => d.stage === 'closed-won' || d.outcome === 'won');
    const lostDeals = history.filter((d: any) => d.stage === 'closed-lost' || d.outcome === 'lost');
    const totalValue = wonDeals.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
    
    accountHistorySection = `

## ACCOUNT RELATIONSHIP HISTORY (Strategic Analysis Mode)

**Customer Status:** ${wonDeals.length > 0 ? 'Existing Customer' : 'Prospect'}
**Historical Win Rate:** ${history.length > 0 ? Math.round((wonDeals.length / history.length) * 100) : 0}%
**Total Won Value:** $${totalValue.toLocaleString()}
**Previous Deals:**
${history.slice(0, 10).map((d: any) => `- ${d.name || 'Unnamed'}: $${(d.amount || 0).toLocaleString()} (${d.stage || d.outcome || 'unknown'})`).join('\n') || 'No previous deals'}

**Strategic Coaching Instructions:**
- Leverage past relationship patterns in your recommendations
- Reference successful strategies from won deals
- Identify what changed in lost deals to avoid similar mistakes
- Consider account-level buying patterns and decision timelines
- Factor in existing relationships when assessing stakeholder engagement`;
  }

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: DEAL_COACHING_SYSTEM_PROMPT
    },
    {
      role: "user", 
      content: `
Analyze this deal and provide proactive coaching:

DEAL INFORMATION:
- Deal Name: ${dealData.name || 'Unnamed Deal'}
- Deal Size: $${dealData.dealSize?.toLocaleString() || 'Unknown'}
- Target Close Date: ${dealData.closeDate || 'Not specified'}
- Current Stage: ${dealData.stage || 'Unknown'}
- Current Probability: ${dealData.probability || 'Not set'}%
- Stakeholders: ${stakeholderContext}
- Timeline: ${truncateText(dealData.timeline || 'No timeline information', analysisProfile.limits.timelineLimit)}
- Last Activity: ${dealData.lastActivity || 'No recent activity recorded'}
- Competitor Information: ${truncateText(dealData.competitorInfo || 'No competitor information', analysisProfile.limits.competitorLimit)}
- Additional Notes: ${truncateText(dealData.notes || dealData.description || 'No additional notes', analysisProfile.limits.notesLimit)}
${stakeholderRankingPrompt}
${accountHistorySection}

Quarter Context: ${quarterLabel(dealData.closeDate)} - ${Math.ceil((new Date(dealData.closeDate || Date.now()).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days remaining
Analysis Mode: ${zoomLevel === 'strategic' ? 'STRATEGIC (include account relationship insights)' : 'TACTICAL (focus on this deal only)'}
Depth Mode: ${analysisProfile.depthMode.toUpperCase()} (balance quality and token efficiency)

Provide comprehensive SCOUTPAD analysis with specific coaching recommendations focused on closing this quarter.
      `.trim()
    }
  ];

  let llm;
  try {
    try {
      llm = await callWithFallback({
        messages,
        tier: analysisProfile.depthMode === 'deep' ? 'pro' : analysisProfile.depthMode === 'focused' ? 'lite' : 'standard',
        temperature: AI_CONFIG.defaultTemperature,
        maxTokens: analysisProfile.maxTokens,
        jsonMode: true,
      });
    } catch (error: any) {
      // Some providers reject response_format/json mode with HTTP 400.
      if (Number(error?.statusCode || 0) !== 400) throw error;
      llm = await callWithFallback({
        messages,
        tier: analysisProfile.depthMode === 'deep' ? 'pro' : analysisProfile.depthMode === 'focused' ? 'lite' : 'standard',
        temperature: AI_CONFIG.defaultTemperature,
        maxTokens: analysisProfile.maxTokens,
        jsonMode: false,
      });
    }
  } catch (error: any) {
    throw mapProviderFailure(error);
  }

  const content = llm.content || '';

  let parsedInitial = tryParseJson(content);
  let repairedJson = false;
  let result = parsedInitial;
  if (!isValidCoachingShape(result)) {
    result = await repairModelJson(content);
    repairedJson = !!result;
  }

  // Hard fail when structure is invalid — do not fabricate coaching.
  if (!isValidCoachingShape(result)) {
    throw new ClientSafeError(
      'INVALID_MODEL_OUTPUT',
      'Model returned an invalid coaching structure. No analysis was saved. Please retry.',
      502,
      true
    );
  }

  // Deterministic guardrails enforce critical ScoutPad constraints beyond LLM output.
  applyScoutpadGuardrails(result, dealData);
  // Ensure quality analytics is always present and normalized.
  ensureQualityAnalytics(result);
  result.analysisMeta = {
    depthMode: analysisProfile.depthMode,
    tokenBudget: {
      estimatedInputTokens: analysisProfile.inputEstimate,
      maxOutputTokens: analysisProfile.maxTokens,
      estimatedTotalTokens: analysisProfile.inputEstimate + analysisProfile.maxTokens,
    },
    daysToClose: analysisProfile.daysToClose,
    provider: llm.provider,
    model: llm.model,
    validation: {
      schemaValid: true,
      repairedJson,
    },
  };

  return result;
}

async function logCoachingSession(
  dealData: any, 
  result: any, 
  organizationId: string, 
  userId: string
) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('coaching_sessions').insert({
      organization_id: organizationId,
      user_id: userId,
      deal_id: dealData.id,
      provider: result?.analysisMeta?.provider || 'unknown',
      model: result?.analysisMeta?.model || 'unknown',
      deal_score: result.dealScore?.currentProbability,
      risk_level: result.dealScore?.riskLevel,
      coaching_summary: result.quarterlyForecast?.coaching,
      full_response: result,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    // Non-critical - log but don't fail the request
    console.error('Failed to log coaching session:', error);
  }
}

serve(handler);
