import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { 
  validateInput, 
  checkRateLimit, 
  validateOrganizationAccess,
  createSecureErrorResponse 
} from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { AuthError, authenticateRequest } from '../_shared/auth.ts';
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
  const holisticContext = dealData?.holisticContext ? JSON.stringify(dealData.holisticContext) : '';
  const inputEstimate = estimateTokens(`${notes}\n${description}\n${timeline}\n${competitors}\n${holisticContext}`);

  const closeDate = dealData?.closeDate ? new Date(dealData.closeDate).getTime() : NaN;
  const daysToClose = Number.isFinite(closeDate) ? Math.max(0, Math.ceil((closeDate - Date.now()) / (1000 * 60 * 60 * 24))) : 90;
  const urgencyBoost = daysToClose <= 21 ? 1 : 0;

  let depthMode: 'focused' | 'standard' | 'deep' = 'standard';
  if (inputEstimate > 1400) depthMode = 'focused';
  if (inputEstimate < 700 && urgencyBoost) depthMode = 'deep';
  if (zoomLevel === 'strategic' && inputEstimate < 1200) depthMode = 'deep';

  const depthConfig = {
    focused: { maxTokens: 900, notesLimit: 1000, descriptionLimit: 900, timelineLimit: 320, competitorLimit: 320, holisticLimit: 1600 },
    standard: { maxTokens: 1200, notesLimit: 1500, descriptionLimit: 1200, timelineLimit: 450, competitorLimit: 450, holisticLimit: 2400 },
    deep: { maxTokens: 1600, notesLimit: 2200, descriptionLimit: 1600, timelineLimit: 650, competitorLimit: 650, holisticLimit: 3200 },
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

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  const output = String(value ?? '').trim();
  return output || fallback;
}

function dateLabel(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function formatRecentActivity(activity: any): string {
  const when = dateLabel(activity?.activity_date || activity?.scheduled_at || activity?.created_at);
  const title = text(activity?.title || activity?.subject || activity?.type, 'Activity');
  const detail = truncateText(text(activity?.description), 220);
  return `- ${[when, title].filter(Boolean).join(' - ')}${detail ? `: ${detail}` : ''}`;
}

function formatRecentEmail(email: any): string {
  const when = dateLabel(email?.received_at);
  const direction = text(email?.direction, 'email');
  const subject = text(email?.subject, '(no subject)');
  const from = text(email?.from_name || email?.from_email, 'unknown sender');
  const to = asArray(email?.to_emails).join(', ');
  const contact = text(email?.contact_name);
  const snippet = truncateText(text(email?.snippet), 220);
  return `- ${[when, direction].filter(Boolean).join(' ')}: ${subject} (${from}${to ? ` -> ${to}` : ''}${contact ? `; CRM contact ${contact}` : ''})${snippet ? ` | ${snippet}` : ''}`;
}

function formatEngagement(row: any): string {
  const name = text(row?.contact_name || row?.contact_email, 'Contact');
  const sent = Number(row?.total_emails_sent || 0);
  const received = Number(row?.total_emails_received || 0);
  const lastSent = dateLabel(row?.last_email_sent_at);
  const lastReceived = dateLabel(row?.last_email_received_at);
  const score = row?.engagement_score == null ? '' : `, score ${Math.round(Number(row.engagement_score))}`;
  const response = row?.avg_response_hours == null ? '' : `, avg response ${Math.round(Number(row.avg_response_hours) * 10) / 10}h`;
  return `- ${name}: ${sent} sent, ${received} received${lastSent ? `, last sent ${lastSent}` : ''}${lastReceived ? `, last received ${lastReceived}` : ''}${response}${score}`;
}

function formatContactMemory(row: any): string {
  const name = text(row?.contact_name || row?.contact_email, 'Contact');
  const signals = row?.relationship_signals || {};
  const prefs = row?.communication_preferences || {};
  const facts = asArray(row?.facts)
    .map((fact: any) => text(fact?.fact || fact))
    .filter(Boolean)
    .slice(0, 5)
    .join('; ');
  const summary = truncateText(text(row?.summary), 260);
  const sentiment = text(signals.sentiment);
  const engagement = text(signals.engagement_level);
  const tone = text(prefs.tone || prefs.channel);
  return `- ${name}: ${[
    summary,
    sentiment ? `sentiment ${sentiment}` : '',
    engagement ? `${engagement} engagement` : '',
    tone ? `preference ${tone}` : '',
    facts ? `facts: ${facts}` : '',
  ].filter(Boolean).join(' | ')}`;
}

function buildHolisticContextSection(dealData: any, maxChars: number): string {
  const context = dealData?.holisticContext;
  if (!context || typeof context !== 'object') return '';

  const sections: string[] = [];
  const account = context.account || {};
  if (account.name) {
    sections.push(`Account context: ${[
      text(account.name),
      text(account.industry),
      text(account.description),
    ].filter(Boolean).join(' - ')}`);
  }

  const emailSummary = context.emailSummary || {};
  if (emailSummary.recent_window_count) {
    sections.push(`Email summary: ${emailSummary.recent_window_count} recent linked emails (${emailSummary.inbound_count || 0} inbound, ${emailSummary.outbound_count || 0} outbound). Last email ${dateLabel(emailSummary.last_email_at) || 'unknown'}.`);
  }

  const emails = asArray(context.recentEmails);
  if (emails.length > 0) {
    sections.push(`Recent email evidence:\n${emails.slice(0, 6).map(formatRecentEmail).join('\n')}`);
  }

  const engagement = asArray(context.emailEngagement);
  if (engagement.length > 0) {
    sections.push(`Email engagement by contact:\n${engagement.slice(0, 6).map(formatEngagement).join('\n')}`);
  }

  const activities = asArray(context.recentActivities);
  if (activities.length > 0) {
    sections.push(`Recent CRM activities:\n${activities.slice(0, 6).map(formatRecentActivity).join('\n')}`);
  }

  const notes = asArray(context.dealNotes)
    .map((note: any) => {
      const when = dateLabel(note?.created_at);
      const body = truncateText(text(note?.content), 240);
      return body ? `- ${when ? `${when}: ` : ''}${body}` : '';
    })
    .filter(Boolean);
  if (notes.length > 0) {
    sections.push(`Recent deal notes:\n${notes.slice(0, 3).join('\n')}`);
  }

  const memories = asArray(context.contactMemory);
  if (memories.length > 0) {
    sections.push(`Contact memory and relationship signals:\n${memories.slice(0, 4).map(formatContactMemory).join('\n')}`);
  }

  const tasks = asArray(context.openTasks)
    .map((task: any) => `- ${text(task?.title, 'Task')}${task?.due_date ? ` due ${dateLabel(task.due_date)}` : ''}${task?.priority ? ` (${task.priority})` : ''}`)
    .slice(0, 5);
  if (tasks.length > 0) {
    sections.push(`Open tasks:\n${tasks.join('\n')}`);
  }

  if (sections.length === 0) return '';

  return `\n\nHOLISTIC CRM EVIDENCE FOR SCOUTPAD:\n${truncateText(sections.join('\n\n'), maxChars)}`;
}

function dealCoachingAiCallLimits() {
  return {
    maxAttempts: Math.max(1, Number(Deno.env.get('DEAL_COACHING_AI_MAX_ATTEMPTS') || '1')),
    providerLimit: Math.max(1, Number(Deno.env.get('DEAL_COACHING_AI_PROVIDER_LIMIT') || '3')),
    providerTimeoutMs: Math.max(5000, Number(Deno.env.get('DEAL_COACHING_PROVIDER_TIMEOUT_MS') || '22000')),
  };
}

function dealCoachingTier(depthMode: 'focused' | 'standard' | 'deep') {
  const configured = String(Deno.env.get('DEAL_COACHING_AI_TIER') || '').toLowerCase();
  if (configured === 'lite' || configured === 'standard' || configured === 'pro') return configured;
  return depthMode === 'deep' ? 'standard' : 'lite';
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

const SCOUTPAD_RESULT_KEYS = [
  'stakeholders',
  'champion',
  'opportunity',
  'userAgreements',
  'timeline',
  'problem',
  'approvalChain',
  'decisionCriteria',
];

const SCOUTPAD_RESULT_ALIASES: Record<string, string[]> = {
  stakeholders: ['stakeholders', 'stakeholder', 's'],
  champion: ['champion', 'c'],
  opportunity: ['opportunity', 'opportunityFit', 'opportunity_fit', 'o'],
  userAgreements: ['userAgreements', 'user_agreements', 'userAgreement', 'user_agreement', 'agreements', 'u'],
  timeline: ['timeline', 't'],
  problem: ['problem', 'pain', 'problemPain', 'problem_pain', 'p'],
  approvalChain: ['approvalChain', 'approval_chain', 'approvals', 'approval', 'a'],
  decisionCriteria: ['decisionCriteria', 'decision_criteria', 'criteria', 'd'],
};

function clampPercent(value: unknown, fallback = 50): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeRiskLevel(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return 'medium';
}

function normalizeTrendDirection(value: unknown): 'improving' | 'declining' | 'stable' {
  const v = String(value || '').toLowerCase();
  if (v === 'improving' || v === 'declining' || v === 'stable') return v;
  return 'stable';
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function dimensionFromRaw(raw: any, fallbackImpact: string) {
  if (typeof raw === 'number' || typeof raw === 'string') {
    return {
      score: Math.min(10, Math.max(1, Math.round(Number(raw) || 5))),
      evidence: [],
      gaps: [],
      impact: fallbackImpact,
    };
  }

  return {
    score: Math.min(10, Math.max(1, Math.round(Number(raw?.score ?? raw?.s) || 5))),
    evidence: stringArray(raw?.evidence ?? raw?.e),
    gaps: stringArray(raw?.gaps ?? raw?.g),
    impact: text(raw?.impact ?? raw?.i, fallbackImpact),
  };
}

function aliasedValue(source: any, aliases: string[]): any {
  if (!source || typeof source !== 'object') return undefined;
  for (const alias of aliases) {
    if (source[alias] !== undefined) return source[alias];
    const upper = alias.toUpperCase();
    if (source[upper] !== undefined) return source[upper];
  }
  return undefined;
}

function coerceModelCoachingResult(input: any): any | null {
  const payload = input?.result ?? input?.data ?? input;
  if (!payload || typeof payload !== 'object') return null;

  const dealScoreRaw = payload.dealScore ?? payload.deal_score ?? payload;
  const scoutpadRaw = payload.scoutpadAnalysis
    ?? payload.scoutpad_analysis
    ?? payload.scoutpad
    ?? payload.scoutpadScores
    ?? payload.scoutpad_scores
    ?? payload.scores
    ?? {};
  const coachingRaw = payload.coaching ?? {};
  const forecastRaw = payload.quarterlyForecast ?? payload.quarterly_forecast ?? {};
  const qualityRaw = payload.qualityAnalytics ?? payload.quality_analytics ?? {};
  const compactNext = text(payload.next || payload.nextStep || payload.next_step);
  const compactGap = text(payload.gap || payload.topGap || payload.top_gap);
  const compactReason = text(payload.reason || payload.why);

  const scoutpadAnalysis = Object.fromEntries(
    SCOUTPAD_RESULT_KEYS.map((key) => {
      const aliases = SCOUTPAD_RESULT_ALIASES[key] || [key];
      const rawDimension = aliasedValue(scoutpadRaw, aliases) ?? aliasedValue(payload, aliases);
      return [
        key,
        dimensionFromRaw(
          rawDimension,
          `${key} requires stronger CRM evidence.`
        ),
      ];
    })
  );

  const recommended = coachingRaw.recommendedNextSteps ?? coachingRaw.recommended_next_steps;
  const current = coachingRaw.currentNextSteps ?? coachingRaw.current_next_steps;
  const result = {
    dealScore: {
      currentProbability: clampPercent(dealScoreRaw.currentProbability ?? dealScoreRaw.current_probability ?? dealScoreRaw.probability, 50),
      confidenceLevel: normalizeConfidence(dealScoreRaw.confidenceLevel ?? dealScoreRaw.confidence_level ?? dealScoreRaw.confidence),
      trendDirection: normalizeTrendDirection(dealScoreRaw.trendDirection ?? dealScoreRaw.trend_direction ?? dealScoreRaw.trend),
      riskLevel: normalizeRiskLevel(dealScoreRaw.riskLevel ?? dealScoreRaw.risk_level ?? dealScoreRaw.risk),
    },
    scoutpadAnalysis,
    coaching: {
      currentNextSteps: stringArray(current),
      recommendedNextSteps: Array.isArray(recommended)
        ? recommended
        : [{
            action: compactNext || 'Validate stakeholder map and next decision milestone.',
            priority: 'high',
            timeframe: 'this_week',
            probabilityImpact: '+5%',
            reasoning: compactReason || compactGap || 'Model provided a compact recommendation without detailed reasoning.',
          }],
      risks: Array.isArray(coachingRaw.risks)
        ? coachingRaw.risks
        : compactGap
          ? [{
              risk: compactGap,
              probability: ['high', 'critical'].includes(normalizeRiskLevel(dealScoreRaw.risk)) ? 'high' : 'medium',
              mitigation: compactNext || 'Clarify this gap with the buyer this week.',
            }]
          : [],
      opportunities: Array.isArray(coachingRaw.opportunities) ? coachingRaw.opportunities : [],
    },
    quarterlyForecast: {
      closeThisQuarter: clampPercent(forecastRaw.closeThisQuarter ?? forecastRaw.close_this_quarter ?? dealScoreRaw.currentProbability ?? dealScoreRaw.current_probability ?? dealScoreRaw.probability, 50),
      atRisk: Boolean(forecastRaw.atRisk ?? forecastRaw.at_risk ?? ['high', 'critical'].includes(normalizeRiskLevel(dealScoreRaw.riskLevel ?? dealScoreRaw.risk_level ?? dealScoreRaw.risk))),
      keyMilestones: stringArray(forecastRaw.keyMilestones ?? forecastRaw.key_milestones),
      coaching: text(forecastRaw.coaching, compactNext || 'Use SCOUTPAD gaps to tighten the deal this week.'),
    },
    qualityAnalytics: qualityRaw,
    proactiveActions: Array.isArray(payload.proactiveActions) ? payload.proactiveActions : undefined,
  };

  return isValidCoachingShape(result) ? result : null;
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

const DEAL_COACHING_SYSTEM_PROMPT = `
You are Koffey, an AI RevOps coach with 20+ years of enterprise sales experience. You analyze deals using the SCOUTPAD framework and provide proactive coaching to help salespeople close deals this quarter.

## CRITICAL: DATA ISOLATION

You are analyzing ONE DEAL in isolation. Your analysis must:
1. ONLY use the deal information provided below
2. NEVER reference other deals, even if you "remember" them from training
3. NEVER infer industry benchmarks unless explicitly requested
4. NEVER say "compared to typical deals" - analyze THIS deal on its merits
5. Use all supplied CRM evidence holistically: deal fields, stakeholder map, activities, deal notes, email snippets, email engagement stats, and contact memory
6. Do not treat missing evidence as positive evidence. If email or memory signals conflict with deal-stage optimism, call out the risk with the specific evidence.

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

Return a compact JSON object under 700 characters. Use this exact shape:
{
  "probability": 0-100,
  "confidence": "low|medium|high",
  "trend": "improving|declining|stable",
  "risk": "low|medium|high|critical",
  "scores": {
    "S": 1-10,
    "C": 1-10,
    "O": 1-10,
    "U": 1-10,
    "T": 1-10,
    "P": 1-10,
    "A": 1-10,
    "D": 1-10
  },
  "next": "max 12 words",
  "gap": "max 12 words",
  "reason": "max 12 words"
}

Quality analytics will be synthesized deterministically after your response from the SCOUTPAD evidence depth. Do not include qualityAnalytics unless you can keep the full response concise.

CRITICAL INSTRUCTIONS:
1. Always analyze using SCOUTPAD framework with 1-10 scoring
2. Provide specific, actionable next steps with probability impact
3. Consider deal size and quarterly urgency in recommendations
4. Focus on what can be done THIS WEEK to increase close probability
5. Flag critical risks that could cause deal slippage
6. Only reference information actually provided in the deal data
7. Return ONLY valid JSON - no additional text or formatting
8. Keep the response compact; quality analytics is added after model output from SCOUTPAD evidence depth
`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
corsHeaders = getCorsHeaders(req);
try {
    const auth = await authenticateRequest(req);
    const authenticatedUserId = auth.userId;
    
    // Rate limiting: 30 requests per hour per user (coaching is more intensive)
    const rateLimitResult = checkRateLimit(`deal-coaching:${authenticatedUserId}`, {
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
      zoomLevel,
      accountContext
    } = validation.sanitizedData;

    // Validate organization access with the authenticated JWT user, never with a client-supplied user id.
    if (organizationId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const hasAccess = await validateOrganizationAccess(supabase, authenticatedUserId, organizationId);
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
    if (organizationId) {
      await logCoachingSession(dealData, result, organizationId, authenticatedUserId);
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    if (error instanceof AuthError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: error.statusCode === 403 ? 'access_denied' : 'auth_required',
            message: error.statusCode === 403 ? 'Access denied' : 'Authentication required',
            retryable: false,
          },
          timestamp: Date.now(),
        }),
        {
          status: error.statusCode,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (error instanceof ClientSafeError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: error.code,
            message: error.message,
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
- Account: ${dealData.accountName || 'Not specified'}
- Timeline: ${truncateText(dealData.timeline || 'No timeline information', analysisProfile.limits.timelineLimit)}
- Last Activity: ${dealData.lastActivity || 'No recent activity recorded'}
- Competitor Information: ${truncateText(dealData.competitorInfo || 'No competitor information', analysisProfile.limits.competitorLimit)}
- Additional Notes: ${truncateText(dealData.notes || dealData.description || 'No additional notes', analysisProfile.limits.notesLimit)}
${stakeholderRankingPrompt}
${buildHolisticContextSection(dealData, analysisProfile.limits.holisticLimit)}
${accountHistorySection}

Quarter Context: ${quarterLabel(dealData.closeDate)} - ${Math.ceil((new Date(dealData.closeDate || Date.now()).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days remaining
Analysis Mode: ${zoomLevel === 'strategic' ? 'STRATEGIC (include account relationship insights)' : 'TACTICAL (focus on this deal only)'}
Depth Mode: ${analysisProfile.depthMode.toUpperCase()} (balance quality and token efficiency)

Provide comprehensive SCOUTPAD analysis with specific coaching recommendations focused on closing this quarter.
      `.trim()
    }
  ];

  let llm;
  let responseMaxTokens = analysisProfile.maxTokens;
  try {
    const aiCallLimits = dealCoachingAiCallLimits();
    const aiTier = dealCoachingTier(analysisProfile.depthMode);
    responseMaxTokens = aiTier === 'lite'
      ? Math.min(analysisProfile.maxTokens, 240)
      : aiTier === 'standard'
        ? Math.min(analysisProfile.maxTokens, 400)
        : Math.min(analysisProfile.maxTokens, 700);
    try {
      llm = await callWithFallback({
        messages,
        tier: aiTier,
        temperature: AI_CONFIG.defaultTemperature,
        maxTokens: responseMaxTokens,
        jsonMode: true,
        ...aiCallLimits,
      });
    } catch (error: any) {
      // Some providers reject response_format/json mode with HTTP 400.
      if (Number(error?.statusCode || 0) !== 400) throw error;
      llm = await callWithFallback({
        messages,
        tier: aiTier,
        temperature: AI_CONFIG.defaultTemperature,
        maxTokens: responseMaxTokens,
        jsonMode: false,
        ...aiCallLimits,
      });
    }
  } catch (error: any) {
    throw mapProviderFailure(error);
  }

  const content = llm.content || '';

  const parsedInitial = tryParseJson(content);
  const repairedJson = false;
  const result = coerceModelCoachingResult(parsedInitial) || parsedInitial;

  // Hard fail when structure is invalid — do not fabricate coaching.
  if (!isValidCoachingShape(result)) {
    throw new ClientSafeError(
      'INVALID_MODEL_OUTPUT',
      'AI provider returned an unusable response. No analysis was saved. Please retry.',
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
      maxOutputTokens: responseMaxTokens,
      estimatedTotalTokens: analysisProfile.inputEstimate + responseMaxTokens,
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
