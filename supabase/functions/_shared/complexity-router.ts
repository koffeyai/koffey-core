/**
 * Multi-Signal Model Router
 *
 * Routes requests to model tiers using weighted signal voting.
 * Quality-first: ties break upward, lite requires strong consensus.
 *
 * LITE  → temp 0.1, 512 tokens  (greetings, confirmations, simple nav)
 * STANDARD → temp 0.3, 2048 tokens (entity ops, search, moderate queries)
 * PRO   → temp 0.4, 4096 tokens (analytics, forecasting, multi-step reasoning)
 */

export type ComplexityLevel = 'lite' | 'standard' | 'pro';

// ============================================================================
// Types
// ============================================================================

export interface RoutingSignal {
  name: string;
  value: string;
  tierVote: ComplexityLevel;
  weight: number;
}

export interface RoutingDecision {
  tier: ComplexityLevel;
  temperature: number;
  maxTokens: number;
  reason: string;
  signals: RoutingSignal[];
  confidence: number;
}

export interface RoutingContext {
  message: string;
  historyLength: number;
  analysisMode?: 'general' | 'single_entity_analysis' | 'comparison';
  hasEntityContext?: boolean;
  channel?: string;
  isUrgent?: boolean;
  toolCount?: number;
  isSynthesisPass?: boolean;
  synthToolResultCount?: number;
}

// ============================================================================
// Tier Parameter Profiles
// ============================================================================

const TIER_PROFILES: Record<ComplexityLevel, { temperature: number; maxTokens: number }> = {
  lite:     { temperature: 0.1, maxTokens: 512 },
  standard: { temperature: 0.3, maxTokens: 2048 },
  pro:      { temperature: 0.4, maxTokens: 4096 },
};

// ============================================================================
// Regex Patterns (preserved from original router)
// ============================================================================

const LITE_PATTERNS = [
  /^(yes|no|ok|sure|thanks|cancel|stop|quit|done|nope|yep|yeah|nah)\.?$/i,
  /^(hi|hello|hey|help|what can you do|how are you|good morning|good afternoon|good evening)[\s!?]*$/i,
  // Navigation patterns (show/view/list) removed — they need search_crm tools
  /^(that's right|correct|exactly|perfect|sounds good|go ahead|proceed|confirm)[\s!?]*$/i,
];

const PRO_PATTERNS = [
  /\b(analyze|forecast|predict|trend|velocity|conversion rate|pipeline analysis|revenue forecast)\b/i,
  /\b(compare|correlation|attribution|cohort|segment|breakdown|distribution)\b/i,
  /\b(chart|graph|visualization|report|dashboard|show me a|create a chart|plot)\b/i,
  /\b(why did|how come|explain the|what caused|what's driving|what factors)\b/i,
  /\b(over time|monthly|quarterly|year over year|yoy|mom|week over week|trending)\b/i,
  /\b(performance|metrics|kpi|benchmark|quota attainment|win rate|close rate)\b/i,
  /\b(revenue|arpu|arr|mrr|ltv|cac|roi|projection|estimate)\b/i,
];

// ============================================================================
// Signal Collectors
// ============================================================================

function collectSignals(ctx: RoutingContext): RoutingSignal[] {
  const signals: RoutingSignal[] = [];
  const lower = ctx.message.toLowerCase().trim();

  // --- Signal 1: Message regex ---
  if (LITE_PATTERNS.some(p => p.test(lower))) {
    signals.push({ name: 'regex', value: 'lite_pattern', tierVote: 'lite', weight: 3 });
  }

  const proMatches = PRO_PATTERNS.filter(p => p.test(lower));
  if (proMatches.length > 0) {
    signals.push({ name: 'regex', value: `pro_pattern(${proMatches.length})`, tierVote: 'pro', weight: 3 });
  }

  // --- Signal 2: Message length ---
  const len = ctx.message.length;
  if (len < 15) {
    signals.push({ name: 'length', value: `${len}chars`, tierVote: 'lite', weight: 2 });
  } else if (len <= 500) {
    signals.push({ name: 'length', value: `${len}chars`, tierVote: 'standard', weight: 1 });
  } else {
    signals.push({ name: 'length', value: `${len}chars`, tierVote: 'pro', weight: 1 });
  }

  // --- Signal 3: Conversation history depth ---
  const h = ctx.historyLength;
  if (h <= 2) {
    signals.push({ name: 'history', value: `${h}turns`, tierVote: 'lite', weight: 1 });
  } else if (h <= 8) {
    signals.push({ name: 'history', value: `${h}turns`, tierVote: 'standard', weight: 1 });
  } else {
    signals.push({ name: 'history', value: `${h}turns`, tierVote: 'pro', weight: 2 });
  }

  // --- Signal 4: Analysis mode ---
  if (ctx.analysisMode === 'comparison') {
    signals.push({ name: 'analysis_mode', value: 'comparison', tierVote: 'pro', weight: 3 });
  } else if (ctx.analysisMode === 'single_entity_analysis') {
    signals.push({ name: 'analysis_mode', value: 'single_entity', tierVote: 'pro', weight: 2 });
  }

  // --- Signal 5: Entity context ---
  if (ctx.hasEntityContext) {
    signals.push({ name: 'entity_context', value: 'present', tierVote: 'standard', weight: 1 });
  }

  // --- Signal 6: Urgency ---
  if (ctx.isUrgent) {
    signals.push({ name: 'urgency', value: 'detected', tierVote: 'lite', weight: 1 });
  }

  // --- Signal 7: Synthesis pass ---
  if (ctx.isSynthesisPass) {
    const resultCount = ctx.synthToolResultCount ?? 0;
    if (resultCount <= 1) {
      signals.push({ name: 'synthesis', value: `${resultCount}results`, tierVote: 'lite', weight: 2 });
    } else if (resultCount <= 3) {
      signals.push({ name: 'synthesis', value: `${resultCount}results`, tierVote: 'standard', weight: 2 });
    } else {
      signals.push({ name: 'synthesis', value: `${resultCount}results`, tierVote: 'pro', weight: 2 });
    }
  }

  return signals;
}

// ============================================================================
// Vote Tally
// ============================================================================

function tallyVotes(signals: RoutingSignal[]): { tier: ComplexityLevel; scores: Record<ComplexityLevel, number>; confidence: number } {
  const scores: Record<ComplexityLevel, number> = { lite: 0, standard: 0, pro: 0 };

  for (const s of signals) {
    scores[s.tierVote] += s.weight;
  }

// Cost-efficient decision logic (tiers can route to different models and token budgets)
  let tier: ComplexityLevel;

  if (scores.pro > scores.standard && scores.pro > scores.lite) {
    // Pro strictly leads → pro wins
    tier = 'pro';
  } else if (scores.standard >= scores.pro) {
    // Standard leads or ties with pro → standard wins (fewer tools = fewer tokens)
    tier = 'standard';
  } else {
    // Default
    tier = 'standard';
  }

  // Lite can only win with strong consensus: must beat both by 3+
  if (scores.lite >= scores.standard + 3 && scores.lite >= scores.pro + 3) {
    tier = 'lite';
  }

  // Confidence: how decisive was the winner?
  const totalWeight = scores.lite + scores.standard + scores.pro;
  const winnerScore = scores[tier];
  const confidence = totalWeight > 0 ? Math.min(winnerScore / totalWeight, 1) : 0.5;

  return { tier, scores, confidence };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Route a request using multi-signal weighted voting.
 * Returns a full RoutingDecision with tier, parameters, reason, and signals.
 */
export function routeRequest(ctx: RoutingContext): RoutingDecision {
  const signals = collectSignals(ctx);
  const { tier, scores, confidence } = tallyVotes(signals);
  const profile = TIER_PROFILES[tier];

  // Build human-readable reason
  const voteSummary = signals
    .filter(s => s.tierVote === tier)
    .map(s => `${s.name}(${s.weight})`)
    .join(' + ');
  const reason = `${tier}: ${voteSummary || 'default'} [L:${scores.lite} S:${scores.standard} P:${scores.pro}]`;

  console.log(`[model-routing] ${reason} — "${ctx.message.substring(0, 50)}${ctx.message.length > 50 ? '...' : ''}"`);

  return {
    tier,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
    reason,
    signals,
    confidence,
  };
}

// ============================================================================
// Backward Compatibility
// ============================================================================

/** @deprecated Use routeRequest() for full routing decisions */
export function classifyComplexity(message: string, intent?: string): ComplexityLevel {
  const decision = routeRequest({
    message,
    historyLength: 0,
    analysisMode: 'general',
  });
  return decision.tier;
}

/** @deprecated Use TIER_PROFILES directly */
function firstModelEnv(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return fallback;
}

const MODEL_LITE = firstModelEnv(['KIMI_MODEL_LITE', 'MOONSHOT_MODEL_LITE'], 'moonshot-v1-8k');
const MODEL_STANDARD = firstModelEnv(['KIMI_MODEL_STANDARD', 'MOONSHOT_MODEL_STANDARD'], 'moonshot-v1-32k');
const MODEL_PRO = firstModelEnv(
  ['KIMI_MODEL_PRO', 'MOONSHOT_MODEL_PRO', 'KIMI_MODEL', 'MOONSHOT_MODEL', 'LMSTUDIO_MODEL'],
  'kimi-k2.6',
);

export const MODEL_TIERS = {
  lite:     { model: MODEL_LITE, ...TIER_PROFILES.lite, useCases: ['navigation', 'confirmation', 'greetings'] },
  standard: { model: MODEL_STANDARD, ...TIER_PROFILES.standard, useCases: ['entity_creation', 'enrichment', 'search'] },
  pro:      { model: MODEL_PRO, ...TIER_PROFILES.pro, useCases: ['analytics', 'forecasting', 'multi_step_reasoning'] },
} as const;

export function getModelForComplexity(complexity: ComplexityLevel) {
  return MODEL_TIERS[complexity];
}
