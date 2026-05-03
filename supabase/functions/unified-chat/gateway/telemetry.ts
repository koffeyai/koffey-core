import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import type { SkillDomain } from '../skills/types.ts';
import type { TokenUsageLabelRow } from './token-accounting.ts';

export function truncateSummary(input: string, maxChars = 500): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  return raw.length > maxChars ? `${raw.slice(0, maxChars)}...` : raw;
}

export async function logRuntimeDecisionTrace(
  supabase: ReturnType<typeof createClient>,
  params: {
    organizationId: string;
    userId: string;
    sessionId?: string;
    channel: string;
    routingTier: 'lite' | 'standard' | 'pro';
    domains: SkillDomain[];
    toolCount: number;
    synthesisTriggered: boolean;
    tokenIn: number;
    tokenOut: number;
    totalTokens: number;
    cacheHit: boolean;
    cacheType: 'none' | 'tool_plan' | 'response';
    latencyMs: number;
    status: 'success' | 'error' | 'blocked';
    summary: string;
    traceId?: string | null;
    errorMessage?: string;
    aiProvider?: string | null;
    aiModel?: string | null;
    tokenUsageColumns?: TokenUsageLabelRow[];
    taskClass?: 'chat_small' | 'crm_read' | 'crm_write' | 'analytics' | 'scoutpad';
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    minimumTier?: 'lite' | 'standard' | 'pro';
    selectedTier?: 'lite' | 'standard' | 'pro';
    mutationIntent?: boolean;
    routingPolicyVersion?: string | null;
    verificationPolicy?: 'strict' | 'advisory' | 'none' | null;
    blockingFailure?: boolean;
    mixedIntent?: boolean;
    factualClaimsDetected?: boolean;
    legacyWouldBlock?: boolean;
    extractedIntent?: string | null;
    intentMode?: 'off' | 'shadow' | 'live';
    intentExtractorEnabled?: boolean;
    productionIntentClassification?: string | null;
    shadowIntentClassification?: string | null;
    shadowIntentConfidence?: number | null;
    shadowIntentClassificationSource?: string | null;
    shadowIntentFallbackUsed?: boolean;
    shadowIntentFallbackReason?: string | null;
    shadowRetrievalPath?: string | null;
    shadowClarificationAsked?: boolean;
    shadowGroundingState?: string | null;
    intentMatch?: boolean | null;
    timeRangeKind?: string | null;
    filtersPresent?: boolean | null;
    queryAssistEnabled?: boolean | null;
    queryAssistReason?: string | null;
    queryAssistDisplayMode?: string | null;
    queryAssistSuggestionCount?: number | null;
  }
): Promise<void> {
  const tokenUsageColumns = Array.isArray(params.tokenUsageColumns) ? params.tokenUsageColumns : [];
  const totalUsageRow = tokenUsageColumns.find((row) => row.source === 'total') || null;

  const { error } = await supabase
    .from('decision_traces')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      session_id: params.sessionId || null,
      trace_id: params.traceId || null,
      channel: params.channel,
      tool_name: '__chat_runtime',
      tool_args: {
        query_domain: params.domains,
        tool_count: params.toolCount,
        synthesis_triggered: params.synthesisTriggered,
        tokens_in: params.tokenIn,
        tokens_out: params.tokenOut,
        total_tokens: params.totalTokens,
        cache_hit: params.cacheHit,
        cache_type: params.cacheType,
        routing_tier: params.routingTier,
        task_class: params.taskClass || null,
        risk_level: params.riskLevel || null,
        minimum_tier: params.minimumTier || null,
        selected_tier: params.selectedTier || params.routingTier,
        mutation_intent: params.mutationIntent ?? null,
        routing_policy_version: params.routingPolicyVersion || null,
        verification_policy: params.verificationPolicy || null,
        blocking_failure: params.blockingFailure === true,
        mixed_intent: params.mixedIntent === true,
        factual_claims_detected: params.factualClaimsDetected === true,
        legacy_would_block: params.legacyWouldBlock === true,
        extracted_intent: params.extractedIntent || null,
        intent_mode: params.intentMode || 'off',
        intent_extractor_enabled: params.intentExtractorEnabled === true,
        production_intent_classification: params.productionIntentClassification || null,
        shadow_intent_classification: params.shadowIntentClassification || null,
        shadow_intent_confidence: params.shadowIntentConfidence ?? null,
        shadow_intent_classification_source: params.shadowIntentClassificationSource || null,
        shadow_intent_fallback_used: params.shadowIntentFallbackUsed === true,
        shadow_intent_fallback_reason: params.shadowIntentFallbackReason || null,
        shadow_retrieval_path: params.shadowRetrievalPath || null,
        shadow_clarification_asked: params.shadowClarificationAsked === true,
        shadow_grounding_state: params.shadowGroundingState || null,
        intent_match: params.intentMatch ?? null,
        time_range_kind: params.timeRangeKind || null,
        filters_present: params.filtersPresent ?? null,
        query_assist_enabled: params.queryAssistEnabled ?? null,
        query_assist_reason: params.queryAssistReason || null,
        query_assist_display_mode: params.queryAssistDisplayMode || null,
        query_assist_suggestion_count: params.queryAssistSuggestionCount ?? null,
        trace_id: params.traceId || null,
        latency_ms: params.latencyMs,
        ai_provider: params.aiProvider || null,
        ai_model: params.aiModel || null,
        token_usage_columns: tokenUsageColumns,
        model: totalUsageRow?.model || null,
        unit: totalUsageRow?.unit || null,
        input_price_cache_hit: totalUsageRow?.input_price_cache_hit ?? null,
        input_price_cache_miss: totalUsageRow?.input_price_cache_miss ?? null,
        output_price: totalUsageRow?.output_price ?? null,
        context_window: totalUsageRow?.context_window ?? null,
      },
      result_summary: truncateSummary(params.summary),
      result_status: params.status,
      execution_time_ms: params.latencyMs,
      error_message: params.errorMessage ? truncateSummary(params.errorMessage, 300) : null,
    });

  if (error) {
    console.warn('[unified-chat] decision trace insert failed:', error.message);
  }
}

export function buildIntentTraceFields(params: {
  mode: 'off' | 'shadow' | 'live';
  extractorEnabled: boolean;
  productionIntent: any;
  comparisonIntent: any;
  comparisonPlan?: any;
  comparisonClarification?: { needsClarification?: boolean } | null;
  groundingState?: string | null;
}) {
  const productionIntent = params.productionIntent || null;
  const comparisonIntent = params.comparisonIntent || null;
  return {
    intentMode: params.mode,
    intentExtractorEnabled: params.extractorEnabled,
    productionIntentClassification: productionIntent?.intent || null,
    shadowIntentClassification: comparisonIntent?.intent || null,
    shadowIntentConfidence: typeof comparisonIntent?.confidence === 'number' ? comparisonIntent.confidence : null,
    shadowIntentClassificationSource: comparisonIntent?.classificationSource || null,
    shadowIntentFallbackUsed: params.extractorEnabled && comparisonIntent ? comparisonIntent.classificationSource !== 'model' : false,
    shadowIntentFallbackReason: params.extractorEnabled && comparisonIntent && comparisonIntent.classificationSource !== 'model'
      ? 'extractor_unavailable_or_invalid'
      : null,
    shadowRetrievalPath: params.comparisonPlan?.path || null,
    shadowClarificationAsked: params.comparisonClarification?.needsClarification === true,
    shadowGroundingState: params.groundingState || null,
    intentMatch: comparisonIntent ? productionIntent?.intent === comparisonIntent?.intent : null,
    timeRangeKind: productionIntent?.timeRangeHint?.kind || comparisonIntent?.timeRangeHint?.kind || null,
    filtersPresent: !!(productionIntent?.filters || comparisonIntent?.filters),
  };
}

export function buildClarificationResponsePayload(params: {
  message: string;
  reason: string;
  channel: string;
  processingTimeMs: number;
  intentMeta?: Record<string, unknown>;
  queryAssistMeta?: Record<string, unknown> | null;
  executionMeta?: Record<string, unknown> | null;
  traceId?: string | null;
}) {
  return {
    response: params.message,
    crmOperations: [],
    citations: [],
    verification: {
      mode: 'strict_db_citations',
      requires_verification: false,
      is_true: true,
      failed_checks: [],
      citation_count: 0,
      operation_count: 0,
      verified_at: new Date().toISOString(),
      policy: 'none',
      blocking_failure: false,
      mixed_intent: false,
      source_status: 'not_applicable',
      user_summary: null,
      legacy_would_block: false,
    },
    meta: {
      channel: params.channel,
      traceId: params.traceId || null,
      clarificationNeeded: true,
      clarificationReason: params.reason,
      processingTimeMs: params.processingTimeMs,
      intent: params.intentMeta || null,
      queryAssist: params.queryAssistMeta || null,
      execution: params.executionMeta || null,
    },
    provenance: {
      source: 'clarification',
      recordsFound: 0,
      searchPerformed: false,
      confidence: 'pending_consent',
      processingTimeMs: params.processingTimeMs,
    },
  };
}

export function buildPlannerIntentContext(intent: any, retrievalPlan: any) {
  if (!intent || !retrievalPlan || retrievalPlan.path === 'none') return '';
  const lines = [
    `DETERMINED_INTENT: ${intent.intent}`,
    `RETRIEVAL_PATH: ${retrievalPlan.path}`,
  ];
  if (Array.isArray(retrievalPlan.preferredTools) && retrievalPlan.preferredTools.length > 0) {
    lines.push(`PREFERRED_TOOLS: ${retrievalPlan.preferredTools.join(', ')}`);
  }
  if (intent.resolvedTimeRange) {
    lines.push(`RESOLVED_TIME_RANGE: ${JSON.stringify(intent.resolvedTimeRange)}`);
  }
  if (intent.filters) {
    lines.push(`FILTERS: ${JSON.stringify(intent.filters)}`);
  }
  if (intent.entityType) {
    lines.push(`ENTITY_TYPE: ${intent.entityType}`);
  }
  if (intent.entityHint) {
    lines.push(`ENTITY_HINT: ${intent.entityHint}`);
  }
  if (retrievalPlan.path === 'draft_with_context') {
    lines.push('DRAFTING_RULE: Retrieve CRM context with get_deal_context or get_contact_context before calling draft_email. Do not write a generic template without CRM context.');
  }
  if (retrievalPlan.path === 'entity_messages') {
    lines.push('MESSAGE_HISTORY_RULE: Use get_entity_messages. Do not answer from chat history alone.');
  }
  if (retrievalPlan.path === 'pipeline_context') {
    lines.push('PIPELINE_RULE: Use get_pipeline_context for pipeline/focus/window asks instead of freeform summary generation.');
  }
  if (retrievalPlan.path === 'planner_fallback' && ['entity_lookup', 'crm_lookup'].includes(String(intent?.intent || ''))) {
    lines.push('CRM_LOOKUP_RULE: This request still needs CRM data. Use search_crm instead of answering from general knowledge or planning prose.');
  }
  return lines.join('\n');
}

export function buildPublicIntentMeta(params: {
  intent: any;
  retrievalPlan: any;
  rolloutMode: 'off' | 'shadow' | 'live';
  clarificationNeeded?: boolean;
  comparisonIntent?: any;
  comparisonPlan?: any;
}) {
  const intent = params.intent || null;
  const comparisonIntent = params.comparisonIntent || null;
  const comparisonPlan = params.comparisonPlan || null;
  return {
    classification: intent?.intent || null,
    classificationSource: intent?.classificationSource || null,
    confidence: typeof intent?.confidence === 'number' ? intent.confidence : null,
    retrievalPath: params.retrievalPlan?.path || null,
    rolloutMode: params.rolloutMode,
    clarificationNeeded: params.clarificationNeeded === true,
    timeRangeKind: intent?.timeRangeHint?.kind || null,
    filtersPresent: !!intent?.filters,
    shadowClassification: comparisonIntent?.intent || null,
    shadowRetrievalPath: comparisonPlan?.path || null,
    shadowConfidence: typeof comparisonIntent?.confidence === 'number' ? comparisonIntent.confidence : null,
    intentMatch: comparisonIntent ? intent?.intent === comparisonIntent?.intent : null,
  };
}

export function buildPublicQueryAssistMeta(params: {
  rolloutMode: 'off' | 'shadow' | 'live';
  queryAssist?: { enabled?: boolean; reason?: string | null; displayMode?: string | null } | null;
  suggestions?: string[];
}) {
  if (params.rolloutMode !== 'live' || params.queryAssist?.enabled !== true) {
    return null;
  }
  const suggestions = Array.isArray(params.suggestions)
    ? params.suggestions.filter((value) => typeof value === 'string' && value.trim().length > 0).slice(0, 3)
    : [];
  return {
    enabled: true,
    reason: params.queryAssist?.reason || null,
    displayMode: params.queryAssist?.displayMode || null,
    suggestions,
  };
}

export function buildPublicExecutionMeta(params: {
  taskClass: string;
  needsTools: boolean;
  schemaCount: number;
  retrievalPath: string | null | undefined;
  toolPlannerInvoked: boolean;
  deterministicPathUsed: boolean;
  groundingState?: string | null;
}) {
  return {
    taskClass: params.taskClass,
    needsTools: params.needsTools,
    schemaCount: params.schemaCount,
    retrievalPath: params.retrievalPath || null,
    toolPlannerInvoked: params.toolPlannerInvoked,
    deterministicPathUsed: params.deterministicPathUsed,
    groundingState: params.groundingState || null,
  };
}
