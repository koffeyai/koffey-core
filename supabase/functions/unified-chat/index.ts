import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { validateInput, checkRateLimit, createSecureErrorResponse } from '../_shared/security.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { AuthError, isInternalServiceCall, resolveAuthorizedOrganization } from '../_shared/auth.ts';
import {
  checkPersistentRateLimit,
  claimIdempotencyKey,
  completeIdempotencyKey,
  failIdempotencyKey,
  getTraceId,
  stableRequestHash,
} from '../_shared/request-controls.ts';
import { callWithFallback, hasAnyProvider } from '../_shared/ai-provider.ts';
import { routeRequest } from '../_shared/complexity-router.ts';
import { getRegistryToolSchemas, getSkillInstructions, getSkill } from './skills/registry.ts';
import type { SkillDomain, ToolExecutionContext } from './skills/types.ts';
import { validateToolArgs } from './skills/arg-validator.ts';
import { mapToolErrorToUserMessage } from './skills/error-mapping.ts';
import { detectDocument } from './gateway/document-detection.ts';
import { runExtractionPipeline, isExtractionConfirmation, confirmPendingExtraction, rejectPendingExtraction } from './gateway/extraction-pipeline.ts';
import {
  trimHistory,
  buildAnalyticsDashboardSummaryFromDeals,
  buildDirectPipelineSummaryFromDeals,
  isClosed,
  augmentFollowUpMessage,
  isDirectPipelineSummaryRequest,
  isPipelineFollowUpRequest,
} from './request-intelligence.mjs';
import {
  buildPageContextPrompt,
  mergeActiveContextWithPageContext,
  mergeEntityContextWithPageContext,
  normalizePageContext,
  serializePageContextForCache,
} from './context-utils.mjs';
import {
  collectCitationsFromOperations,
  collectCitationsFromToolExecution,
  classifyGroundingState,
  buildGroundedFailureMessage,
  detectFactualClaims,
  hasOnlyPendingWorkflowOperations,
} from './citations-utils.mjs';
import { determineRoutingPolicy } from './routing-policy.mjs';
import {
  interpretMessageIntent,
  interpretMessageIntentHeuristic,
  shouldForceDeterministicPath,
} from './intent/interpret-message.ts';
import {
  buildDeterministicPendingUpdateAccountRenamePlan,
  buildDeterministicUpdateAccountRenamePlan,
  buildDeterministicPendingUpdateDealPlan,
  buildDeterministicPendingUpdateDealPlanFromData,
  buildDeterministicUpdateDealPlan,
  buildDeterministicCreateAccountThenDealPlan,
  buildDeterministicCreateDealPlan,
  buildDeterministicCreateTaskPlan,
  buildDeterministicCreateContactPlan,
  buildDeterministicScheduleMeetingPlan,
  buildDeterministicPendingScheduleMeetingPlan,
  buildDeterministicDeleteDealPlan,
  buildDeterministicPendingDeleteDealPlan,
  buildDeterministicPendingDealPlan,
  buildDeterministicPendingDraftEmailPlan,
  buildDeterministicPendingDealPlanFromHistory,
  buildDeterministicPendingSequencePlan,
  hasDeterministicMutationCue,
  inferPendingDealDataFromHistory,
  inferPendingDeleteDealFromHistory,
  inferPendingUpdateDealFromHistory,
  inferPendingDraftEmailFromHistory,
  repairScheduleMeetingArgsFromMessage,
} from './intent/deterministic-mutation-planner.mjs';
import { evaluateClarificationPolicy } from './intent/clarification-policy.mjs';
import { resolveRetrievalPlan } from './intent/intent-router.mjs';
import { resolveModelIntentRollout } from './intent/intent-rollout.mjs';
import { evaluateQueryAssist } from './query-assist-policy.mjs';
import { buildQueryAssistSuggestions } from './query-assist-suggestions.mjs';
import {
  looksLikeCrmRequestMessage,
  looksLikePlanningPlaceholderText,
  looksLikeTemplatePlaceholderText,
  shouldSuppressUngroundedCrmText,
} from './execution-guard.mjs';
import {
  applyMinimumRoutingTier,
  shouldApplyPreferredRetrievalToolFilter,
  shouldDeferDeterministicMutationPlan,
  shouldTaskClassRequireTools,
  shouldRetrievalPlanRequireTools,
  shouldUseLiveForcedRetrievalPlan,
} from './gateway/routing.ts';
import { buildIndustryTokenUsageColumns } from './gateway/token-accounting.ts';
import {
  buildSystemPrompt,
  dedupeFeedbackSignals,
  extractClientFeedbackSignals,
  loadRecentFeedbackSignals,
  loadLearningFeedbackSignals,
  buildFeedbackGuidance,
} from './gateway/feedback.ts';
import {
  isRetryableAiError,
  buildSafeErrorResponseMessage,
  evaluateHybridVerification,
  applyVerificationPolicyToResponse,
  verifyResponseAgainstToolResults,
} from './gateway/verification.ts';
import {
  safeJsonParse,
  shouldRunSynthesis,
  buildToolOnlyResponse,
  serializeToolResultForPrompt,
  extractCacheableToolCalls,
  toToolCallsFromCache,
  shouldAttemptToolPlanCache,
  buildToolPlanCacheKey,
  loadCachedToolPlan,
  storeToolPlanCache,
  shouldAttemptResponseCache,
  buildResponseCacheKey,
  loadCachedResponse,
  hasValidRetrievedCitationRows,
  isReadOnlyToolSet,
  storeResponseCache,
  invalidateResponseCacheForOrganization,
  STABLE_TOOL_SET,
  MUTATION_TOOLS,
  RESPONSE_CACHE_BUCKET_SECONDS,
} from './gateway/cache.ts';
import {
  logRuntimeDecisionTrace,
  buildIntentTraceFields,
  buildClarificationResponsePayload,
  buildPlannerIntentContext,
  buildPublicIntentMeta,
  buildPublicQueryAssistMeta,
  buildPublicExecutionMeta,
} from './gateway/telemetry.ts';
import { buildSynthesisToolResultsMessage } from './gateway/synthesis-prompt.mjs';
import { buildCompoundCreateSummary, buildCompoundCreateToolCalls } from './compound-create-router.mjs';
import { buildPipelineReviewTaskArgs } from './gateway/tool-only-response.mjs';

let corsHeaders = getCorsHeaders();
const CRITICAL_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const missingCriticalEnv = CRITICAL_ENV.filter((key) => !Deno.env.get(key));
if (missingCriticalEnv.length > 0) {
  console.error(`[unified-chat] Missing critical environment variables: ${missingCriticalEnv.join(', ')}`);
}

const QUALITY_MODE = (Deno.env.get('AI_QUALITY_MODE') || 'true').toLowerCase() === 'true';
const FORCE_TOOL_PLANNER = (Deno.env.get('AI_FORCED_TOOL_PLANNER') || 'false').toLowerCase() === 'true';
const FALLBACK_DOMAINS: SkillDomain[] = ['search', 'analytics', 'create', 'update', 'coaching', 'context', 'email', 'scheduling'];

const WRITE_ROLES = new Set(['owner', 'admin', 'member']);
const ADMIN_WRITE_ROLES = new Set(['owner', 'admin']);
const PENDING_DRAFT_EMAIL_MAX_AGE_MS = 30 * 60 * 1000;
const PENDING_DEAL_UPDATE_MAX_AGE_MS = 30 * 60 * 1000;

function normalizeOrgRole(role: unknown): string {
  return String(role || '').trim().toLowerCase();
}

function getToolPermissionError(toolName: string, role: unknown): string | null {
  const normalizedTool = String(toolName || '').trim();
  const normalizedRole = normalizeOrgRole(role);

  if (!MUTATION_TOOLS.has(normalizedTool)) return null;

  if (normalizedTool === 'delete_deal') {
    return ADMIN_WRITE_ROLES.has(normalizedRole)
      ? null
      : 'Only organization owners and admins can permanently delete CRM records.';
  }

  return WRITE_ROLES.has(normalizedRole)
    ? null
    : 'Your organization role is read-only for CRM changes. Ask an admin to grant edit access.';
}

function normalizePendingDraftWorkflow(value: any): any | null {
  if (!value || value.type !== 'draft_email_missing_recipient') return null;
  if (typeof value.userPrompt !== 'string' || typeof value.assistantPrompt !== 'string') return null;
  return {
    type: 'draft_email_missing_recipient',
    userPrompt: value.userPrompt,
    assistantPrompt: value.assistantPrompt,
  };
}

function isFreshPendingDraftEmail(value: any, createdAt: unknown): boolean {
  if (!normalizePendingDraftWorkflow(value)) return false;
  const timestamp = createdAt ? Date.parse(String(createdAt)) : NaN;
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= PENDING_DRAFT_EMAIL_MAX_AGE_MS;
}

function normalizePendingDealUpdate(value: any): any | null {
  const pending = value?.pending_update || value;
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null;
  if (!pending.updates || typeof pending.updates !== 'object' || Array.isArray(pending.updates)) return null;
  if (Object.keys(pending.updates).length === 0) return null;
  if (!pending.deal_id && !pending.deal_name) return null;
  return {
    ...pending,
    updates: pending.updates,
  };
}

function isFreshPendingDealUpdate(value: any, createdAt: unknown): boolean {
  if (!normalizePendingDealUpdate(value)) return false;
  const timestamp = createdAt ? Date.parse(String(createdAt)) : NaN;
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= PENDING_DEAL_UPDATE_MAX_AGE_MS;
}

function normalizePendingScheduleMeeting(value: any): any | null {
  if (
    !value ||
    !['schedule_meeting_confirmation', 'schedule_meeting_missing_contact_email', 'schedule_meeting_missing_contact_details'].includes(value.type)
  ) return null;
  if (!value.args || typeof value.args !== 'object') return null;
  return {
    type: value.type,
    args: value.args,
    contact_id: typeof value.contact_id === 'string' ? value.contact_id : null,
    contact_name: typeof value.contact_name === 'string' ? value.contact_name : null,
    contact_email: typeof value.contact_email === 'string' ? value.contact_email : null,
    preview: value.preview && typeof value.preview === 'object' ? value.preview : null,
    message: typeof value.message === 'string' ? value.message : '',
  };
}

function isFreshPendingScheduleMeeting(value: any, createdAt: unknown): boolean {
  if (!normalizePendingScheduleMeeting(value)) return false;
  const timestamp = createdAt ? Date.parse(String(createdAt)) : NaN;
  if (!Number.isFinite(timestamp)) return true;
  return true;
}

function isPendingScheduleMeetingCancel(message: unknown): boolean {
  return /^(?:no|nope|cancel(?:\s+(?:the\s+)?(?:scheduling\s+)?(?:email|draft|message))?|stop|discard|never mind|nevermind)(?:\s+(?:it|this))?[\s.!?]*$/i.test(String(message || '').trim());
}

async function storePendingDraftEmail(
  supabase: any,
  sessionId: string | undefined,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
  userPrompt: string,
  result: any,
) {
  if (!sessionId || !result?._needsInput || result?.clarification_type !== 'missing_recipient_email') return;
  const assistantPrompt = String(result.message || '').trim();
  if (!assistantPrompt) return;

  const pendingWorkflow = {
    type: 'draft_email_missing_recipient',
    userPrompt: String(userPrompt || ''),
    assistantPrompt,
  };

  const { error } = await supabase
    .from(sessionTable)
    .update({
      pending_draft_email: pendingWorkflow,
      pending_draft_email_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.warn(`[unified-chat] Failed to store pending_draft_email: ${error.message}`);
  }
}

async function clearPendingDraftEmail(
  supabase: any,
  sessionId: string | undefined,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
) {
  if (!sessionId) return;
  const { error } = await supabase
    .from(sessionTable)
    .update({ pending_draft_email: null, pending_draft_email_at: null })
    .eq('id', sessionId);

  if (error) {
    console.warn(`[unified-chat] Failed to clear pending_draft_email: ${error.message}`);
  }
}

async function storePendingDealUpdate(
  supabase: any,
  sessionId: string | undefined,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
  pendingUpdate: any,
) {
  if (!sessionId) return;
  const normalized = normalizePendingDealUpdate(pendingUpdate);
  if (!normalized) return;
  const { error } = await supabase
    .from(sessionTable)
    .update({
      pending_deal_update: normalized,
      pending_deal_update_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) {
    console.warn(`[unified-chat] Failed to store pending_deal_update: ${error.message}`);
  }
}

async function clearPendingDealUpdate(
  supabase: any,
  sessionId: string | undefined,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
) {
  if (!sessionId) return;
  const { error } = await supabase
    .from(sessionTable)
    .update({ pending_deal_update: null, pending_deal_update_at: null })
    .eq('id', sessionId);
  if (error) {
    console.warn(`[unified-chat] Failed to clear pending_deal_update: ${error.message}`);
  }
}

async function storePendingScheduleMeeting(
  supabase: any,
  sessionId: string | undefined,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
  args: Record<string, any>,
  result: any,
) {
  if (!sessionId) return;
  let pendingWorkflow: Record<string, any> | null = null;
  if (result?._needsConfirmation && result?._confirmationType === 'schedule_meeting') {
    pendingWorkflow = {
      type: 'schedule_meeting_confirmation',
      args,
      preview: result.preview || null,
      message: String(result.message || '').trim(),
    };
  } else if (result?._needsInput && result?.clarification_type === 'missing_contact_details') {
    pendingWorkflow = {
      type: 'schedule_meeting_missing_contact_details',
      args,
      contact_id: result.contact_id || args.contact_id || null,
      contact_name: result.contact_name || args.contact_name || null,
      contact_email: result.contact_email || args.contact_email || null,
      message: String(result.message || '').trim(),
    };
  } else if (result?._needsInput && result?.clarification_type === 'missing_contact_email') {
    pendingWorkflow = {
      type: 'schedule_meeting_missing_contact_email',
      args,
      contact_id: result.contact_id || args.contact_id || null,
      contact_name: result.contact_name || args.contact_name || null,
      message: String(result.message || '').trim(),
    };
  }
  if (!pendingWorkflow) return;

  const { error } = await supabase
    .from(sessionTable)
    .update({
      pending_schedule_meeting: pendingWorkflow,
      pending_schedule_meeting_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.warn(`[unified-chat] Failed to store pending_schedule_meeting: ${error.message}`);
  }
}

async function clearPendingScheduleMeeting(
  supabase: any,
  sessionId: string | undefined,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
) {
  if (!sessionId) return;
  const { error } = await supabase
    .from(sessionTable)
    .update({ pending_schedule_meeting: null, pending_schedule_meeting_at: null })
    .eq('id', sessionId);

  if (error) {
    console.warn(`[unified-chat] Failed to clear pending_schedule_meeting: ${error.message}`);
  }
}


async function executeRegistryTool(
  toolName: string,
  args: Record<string, any>,
  ctx: Omit<ToolExecutionContext, 'args'>
): Promise<any> {
  const skill = getSkill(toolName);
  if (!skill) throw new Error(`Unsupported tool: ${toolName}`);
  if (!STABLE_TOOL_SET.has(toolName)) throw new Error(`Tool temporarily disabled in stable mode: ${toolName}`);
  const argValidation = validateToolArgs(skill, args);
  if (!argValidation.ok) {
    throw new Error(`INVALID_TOOL_ARGS: ${argValidation.message || argValidation.errors.join('; ')}`);
  }
  return await skill.execute({ ...ctx, args: argValidation.args });
}

const handler = async (req: Request): Promise<Response> => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  const traceId = getTraceId(req, 'chat');

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (missingCriticalEnv.length > 0 || !supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const internalCall = isInternalServiceCall(req);
    let userId: string;
    let internalOrganizationId: string | undefined;

    if (internalCall) {
      const internalBody = await req.clone().json().catch(() => null);
      userId = internalBody?.userId;
      internalOrganizationId = internalBody?.organizationId;

      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required for internal calls' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      console.log(`[unified-chat] Internal service call for user ${String(userId).slice(0, 8)}...`);
    } else {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      userId = authData.user.id;
    }

    const rate = checkRateLimit(`unified-chat:${userId}`, { requests: 60, windowMs: 60000, blockDurationMs: 300000 });
    if (!rate.allowed) {
      return createSecureErrorResponse(new Error('Rate limit exceeded'), 'Too many requests. Please wait before trying again.', 429);
    }

    const body = await req.json();
    const validation = validateInput(body, { type: 'object', required: ['message'] });
    if (!validation.isValid) {
      return createSecureErrorResponse(new Error('Invalid input'), `Invalid request: ${validation.errors.join(', ')}`, 400);
    }

    const { message, conversationHistory = [], channel } = validation.sanitizedData;
    const resolvedChannel = ['web', 'whatsapp', 'telegram', 'sms'].includes(channel) ? channel : 'web';
    const requestIdempotencyKey = String(
      validation.sanitizedData.idempotencyKey
        || validation.sanitizedData.requestId
        || ''
    ).trim();
    const providedPageContext = validation.sanitizedData?.pageContext;
    const normalizedPageContext = normalizePageContext(providedPageContext);
    const providedEntityContext = validation.sanitizedData?.entityContext;
    const providedActiveContext = validation.sanitizedData?.activeContext;
    const providedFeedbackContext = validation.sanitizedData?.feedbackContext;
    const providedPendingWorkflow = validation.sanitizedData?.pendingWorkflow;
    const resolvedEntityContext = mergeEntityContextWithPageContext(providedEntityContext, providedPageContext);
    const resolvedActiveContext = mergeActiveContextWithPageContext(
      providedActiveContext,
      providedPageContext,
      resolvedEntityContext
    );
    const pageContextKey = serializePageContextForCache(providedPageContext);

    const admin = createClient(supabaseUrl, serviceKey);
    const requestedOrganizationId = internalOrganizationId || validation.sanitizedData.organizationId || null;
    let authorizedOrg;
    try {
      authorizedOrg = await resolveAuthorizedOrganization(admin, userId, requestedOrganizationId);
    } catch (accessError) {
      if (accessError instanceof AuthError) {
        return new Response(JSON.stringify({ error: accessError.message, traceId }), {
          status: accessError.statusCode,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      throw accessError;
    }

    const organizationId = authorizedOrg?.organizationId;
    if (!organizationId) {
      return new Response(JSON.stringify({
        response: "I see you haven't set up your organization yet. Please create or join an organization first.",
        needsOrganization: true,
        traceId,
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const durableRate = await checkPersistentRateLimit(admin, `unified-chat:${organizationId}:${userId}`, {
      requests: 60,
      windowMs: 60000,
      blockDurationMs: 300000,
    });
    if (!durableRate.allowed) {
      return createSecureErrorResponse(new Error('Rate limit exceeded'), 'Too many requests. Please wait before trying again.', 429);
    }

    // Pending extraction confirmation: check if user is confirming/rejecting a previous extraction preview
    const sessionId = validation.sanitizedData.sessionId;
    const sessionTable = resolvedChannel === 'web' ? 'chat_sessions' : 'messaging_sessions';
    const extractionConfirmation = isExtractionConfirmation(message);
    if (extractionConfirmation && sessionId) {
      if (extractionConfirmation === 'confirm') {
        const confirmResponse = await confirmPendingExtraction({
          sessionId,
          sessionTable,
          organizationId,
          userId,
          admin,
          corsHeaders,
        });
        if (confirmResponse) return confirmResponse;
        // No pending extraction found — fall through to normal routing
      } else {
        // Check if there's actually a pending extraction to reject
        const { data: session } = await admin
          .from(sessionTable)
          .select('pending_extraction')
          .eq('id', sessionId)
          .maybeSingle();
        if (session?.pending_extraction) {
          return await rejectPendingExtraction({ sessionId, sessionTable, admin, corsHeaders });
        }
        // No pending extraction — fall through (user just said "no" in general conversation)
      }
    }

    // Document detection: check if message looks like meeting notes / sloppy CRM data
    const documentDetection = detectDocument(message);
    if (documentDetection.isDocument) {
      console.log(`[unified-chat] Document detected (score=${documentDetection.confidence.toFixed(2)}, signals=${documentDetection.signals.join(',')}). Routing to extraction pipeline.`);

      // Deterministic fast path: extract entities from sloppy notes without LLM
      const extractionResponse = await runExtractionPipeline({
        message,
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        sessionTable: resolvedChannel === 'web' ? 'chat_sessions' : 'messaging_sessions',
        admin,
        corsHeaders,
        documentDetection,
      });

      if (extractionResponse) {
        return extractionResponse; // Extraction succeeded — return preview
      }
      // If extraction failed, fall through to normal LLM processing
      console.log('[unified-chat] Extraction pipeline returned null, falling through to LLM');
    }

    const historyText = (conversationHistory || []).slice(-6).map((m: any) => String(m?.content || '')).join(' ').toLowerCase();
    const intentContext = {
      entityContext: resolvedEntityContext,
      activeContext: resolvedActiveContext,
      channel: resolvedChannel,
      historyText,
    };
    const rollout = resolveModelIntentRollout({ organizationId, userId });
    const heuristicIntent = interpretMessageIntentHeuristic(message, intentContext);
    let authoritativeIntent = heuristicIntent;

    // If document detected, override intent to force extraction path
    if (documentDetection.isDocument && authoritativeIntent.intent !== 'document_ingestion') {
      console.log(`[unified-chat] Overriding intent from '${authoritativeIntent.intent}' to document ingestion`);
      authoritativeIntent = {
        ...authoritativeIntent,
        intent: 'create',
        isDataOrAction: true,
        domains: ['create', 'search'],
        _documentDetection: documentDetection,
      };
    }
    let comparisonIntent: any = null;

    if (rollout.enabled) {
      if (rollout.mode === 'shadow') {
        comparisonIntent = await interpretMessageIntent(message, intentContext);
      } else if (rollout.mode === 'live') {
        authoritativeIntent = await interpretMessageIntent(message, intentContext);
        comparisonIntent = heuristicIntent;
      }
    }

    const authoritativeRetrievalPlan = resolveRetrievalPlan(authoritativeIntent);
    const comparisonRetrievalPlan = comparisonIntent ? resolveRetrievalPlan(comparisonIntent) : null;
    const comparisonClarification = comparisonIntent
      ? evaluateClarificationPolicy(comparisonIntent, comparisonRetrievalPlan, {
        resolvedEntityContext,
        resolvedActiveContext,
        pageContext: normalizedPageContext,
        messageText: message,
      })
      : null;
    // Check for pending session state to inform clarification policy
    let hasPendingDealCreation = false;
    let hasPendingExtraction = false;
    let hasPendingSequenceAction = false;
    let pendingDealData: any = null;
    let pendingSequenceActionData: any = null;
    let pendingDraftEmailData: any = null;
    let pendingDealUpdateData: any = null;
    let pendingScheduleMeetingData: any = null;
    if (sessionId) {
      const { data: pendingCheck } = await admin
        .from(sessionTable)
        .select('pending_deal_creation, pending_extraction, pending_sequence_action, pending_draft_email, pending_draft_email_at, pending_deal_update, pending_deal_update_at, pending_schedule_meeting, pending_schedule_meeting_at')
        .eq('id', sessionId)
        .maybeSingle();
      hasPendingDealCreation = !!pendingCheck?.pending_deal_creation;
      hasPendingExtraction = !!pendingCheck?.pending_extraction;
      hasPendingSequenceAction = !!pendingCheck?.pending_sequence_action;
      if (pendingCheck?.pending_deal_creation) {
        pendingDealData = pendingCheck.pending_deal_creation;
      }
      if (pendingCheck?.pending_sequence_action) {
        pendingSequenceActionData = pendingCheck.pending_sequence_action;
      }
      if (isFreshPendingDraftEmail(pendingCheck?.pending_draft_email, pendingCheck?.pending_draft_email_at)) {
        pendingDraftEmailData = pendingCheck.pending_draft_email;
      }
      if (isFreshPendingDealUpdate(pendingCheck?.pending_deal_update, pendingCheck?.pending_deal_update_at)) {
        pendingDealUpdateData = pendingCheck.pending_deal_update;
      }
      if (isFreshPendingScheduleMeeting(pendingCheck?.pending_schedule_meeting, pendingCheck?.pending_schedule_meeting_at)) {
        pendingScheduleMeetingData = pendingCheck.pending_schedule_meeting;
      }
    }

    const clarification = evaluateClarificationPolicy(authoritativeIntent, authoritativeRetrievalPlan, {
      resolvedEntityContext,
      resolvedActiveContext,
      pageContext: normalizedPageContext,
      messageText: message,
      hasPendingDealCreation,
      hasPendingExtraction,
      historyText,
    });
    const telemetryShadowIntent = rollout.enabled
      ? (rollout.mode === 'shadow' ? comparisonIntent : authoritativeIntent)
      : null;
    const telemetryShadowPlan = rollout.enabled
      ? (rollout.mode === 'shadow' ? comparisonRetrievalPlan : authoritativeRetrievalPlan)
      : null;
    const telemetryShadowClarification = rollout.enabled
      ? (rollout.mode === 'shadow' ? comparisonClarification : clarification)
      : null;
    const intentTraceFields = buildIntentTraceFields({
      mode: rollout.mode,
      extractorEnabled: rollout.enabled,
      productionIntent: heuristicIntent,
      comparisonIntent: telemetryShadowIntent,
      comparisonPlan: telemetryShadowPlan,
      comparisonClarification: telemetryShadowClarification,
      groundingState: null,
    });
    const publicIntentMeta = buildPublicIntentMeta({
      intent: authoritativeIntent,
      retrievalPlan: authoritativeRetrievalPlan,
      rolloutMode: rollout.mode,
      clarificationNeeded: clarification?.needsClarification === true,
      comparisonIntent: telemetryShadowIntent,
      comparisonPlan: telemetryShadowPlan,
    });
    const queryAssistContext = {
      resolvedEntityContext,
      resolvedActiveContext,
    };
    const preExecutionQueryAssist = evaluateQueryAssist({
      message,
      intent: authoritativeIntent,
      retrievalPlan: authoritativeRetrievalPlan,
      clarification,
      groundingState: clarification?.needsClarification ? 'clarification_needed' : null,
      crmOperations: [],
      response: clarification?.message || '',
      historyEntries: Array.isArray(conversationHistory) ? conversationHistory : [],
    });
    const preExecutionQueryAssistSuggestions = preExecutionQueryAssist.enabled
      ? buildQueryAssistSuggestions({
        reason: preExecutionQueryAssist.reason,
        intent: authoritativeIntent,
        context: queryAssistContext,
        message,
      })
      : [];
    const publicPreExecutionQueryAssistMeta = buildPublicQueryAssistMeta({
      rolloutMode: rollout.mode,
      queryAssist: preExecutionQueryAssist,
      suggestions: preExecutionQueryAssistSuggestions,
    });
    const followUpLike = authoritativeIntent.isFollowUp;
    const compoundLike = authoritativeIntent.isCompound;
    const dataOrActionRequest = authoritativeIntent.isDataOrAction;
    const needsToolsBase = dataOrActionRequest || followUpLike || compoundLike;
    const domainsHint = authoritativeIntent.domains;
    const normalizedHistory = (conversationHistory || []).map((m: any) => ({ role: m.role, content: m.content }));
    const effectivePendingWorkflow = normalizePendingDraftWorkflow(providedPendingWorkflow)
      || normalizePendingDraftWorkflow(pendingDraftEmailData);
    const effectivePendingScheduleMeeting = normalizePendingScheduleMeeting(pendingScheduleMeetingData);
    if (effectivePendingScheduleMeeting && isPendingScheduleMeetingCancel(message)) {
      const processingMs = Date.now() - started;
      await clearPendingScheduleMeeting(admin, validation.sanitizedData.sessionId, sessionTable);
      return new Response(JSON.stringify({
        response: 'Canceled the scheduling email. Nothing was sent.',
        crmOperations: [],
        citations: [],
        meta: {
          traceId,
          cancelledWorkflow: 'schedule_meeting',
          processingTimeMs: processingMs,
        },
        provenance: {
          source: 'general_chat',
          recordsFound: 0,
          searchPerformed: false,
          confidence: 'high',
          processingTimeMs: processingMs,
          analysisMode: 'general',
          isolationEnforced: false,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const immediatePendingSchedulePlan = buildDeterministicPendingScheduleMeetingPlan(
      message,
      effectivePendingScheduleMeeting,
      new Set(['schedule_meeting']),
    );
    const immediatePendingScheduleCall = immediatePendingSchedulePlan?.toolCalls?.[0];
    if (immediatePendingScheduleCall?.function?.name === 'schedule_meeting') {
      const args = safeJsonParse(immediatePendingScheduleCall.function.arguments || '{}') || {};
      const result = await executeRegistryTool('schedule_meeting', args, {
        supabase: admin,
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        sessionTable,
        traceId,
        authHeader: internalCall ? undefined : authHeader,
      });
      if (result?._needsConfirmation || result?._needsInput) {
        await storePendingScheduleMeeting(admin, validation.sanitizedData.sessionId, sessionTable, args, result);
      } else if (!result?.error && result?.success !== false) {
        await clearPendingScheduleMeeting(admin, validation.sanitizedData.sessionId, sessionTable);
      }

      const processingMs = Date.now() - started;
      const response = result?.message || (result?.success === false
        ? 'I could not complete that scheduling action.'
        : 'I completed the scheduling action.');
      return new Response(JSON.stringify({
        response,
        crmOperations: [{ tool: 'schedule_meeting', args, result }],
        citations: [],
        meta: {
          traceId,
          deterministicMutationPlan: 'resume_schedule_meeting',
          execution: buildPublicExecutionMeta({
            taskClass: 'crm_write',
            needsTools: true,
            schemaCount: 1,
            retrievalPath: 'none',
            toolPlannerInvoked: true,
            deterministicPathUsed: true,
            groundingState: result?.success === false ? 'failure' : 'verified',
          }),
          processingTimeMs: processingMs,
        },
        provenance: {
          source: 'database',
          recordsFound: result?.contact?.id ? 1 : 0,
          searchPerformed: false,
          confidence: result?.success === false ? 'medium' : 'high',
          processingTimeMs: processingMs,
          analysisMode: 'general',
          isolationEnforced: false,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (
      effectivePendingWorkflow
      && !normalizedHistory.some((m: any) => /need a recipient email before it becomes actionable/i.test(String(m?.content || '')))
    ) {
      normalizedHistory.push(
        { role: 'user', content: effectivePendingWorkflow.userPrompt },
        { role: 'assistant', content: effectivePendingWorkflow.assistantPrompt },
      );
    }
    const historyPendingDealData = !hasPendingDealCreation
      ? inferPendingDealDataFromHistory(normalizedHistory)
      : null;
    const historyPendingDeleteDealData = inferPendingDeleteDealFromHistory(normalizedHistory);
    const historyPendingUpdateDealData = inferPendingUpdateDealFromHistory(normalizedHistory);
    const effectivePendingUpdateDealData = normalizePendingDealUpdate(pendingDealUpdateData) || historyPendingUpdateDealData;
    const historyPendingDraftEmailData = inferPendingDraftEmailFromHistory(normalizedHistory);
    const effectivePendingDealData = hasPendingDealCreation ? pendingDealData : historyPendingDealData;
    const hasPendingDealContext = hasPendingDealCreation || !!historyPendingDealData;
    const hasPendingDeleteDealContext = !!historyPendingDeleteDealData;
    const hasPendingUpdateDealContext = !!effectivePendingUpdateDealData;
    const hasPendingDraftEmailContext = !!historyPendingDraftEmailData;
    const hasPendingScheduleMeetingContext = !!effectivePendingScheduleMeeting;
    const hasPendingMutationContext = hasPendingDealContext || hasPendingSequenceAction || hasPendingDeleteDealContext || hasPendingUpdateDealContext || hasPendingDraftEmailContext || hasPendingScheduleMeetingContext;
    const provisionalRoutingPolicy = determineRoutingPolicy({
      message,
      historyText,
      domains: domainsHint,
      channel: resolvedChannel,
      needsTools: needsToolsBase,
      verificationRequired: dataOrActionRequest,
      intentHint: authoritativeIntent,
    });
    const shouldHonorRetrievalPlan = Number(authoritativeIntent?.confidence || 0) >= 0.75
      && authoritativeRetrievalPlan.path !== 'none';
    const deterministicMutationOverride = hasDeterministicMutationCue(message);
    const negatedDealCreate = /\b(?:do\s+not|don't|dont|never)\s+create\s+(?:an?\s+)?(?:new\s+)?(?:deal|opportunit(?:y|ies))\b/i.test(message);
    const shouldBypassPipelineRetrievalForMutation = !negatedDealCreate && (
      /\b(?:create|add|new)\b[\s\S]*\b(?:deal|opportunit(?:y|ies)|account|company|contact|lead)\b/i.test(message)
      || /\b(?:delete|remove|erase|update|rename|change)\b[\s\S]*\b(?:deal|opportunit(?:y|ies)|account|company|contact|lead)\b/i.test(message)
    );
    const shouldDeferDeterministicMutationFallback = shouldDeferDeterministicMutationPlan({
      intentConfidence: authoritativeIntent?.confidence,
      retrievalPlan: authoritativeRetrievalPlan,
      hasPendingDealContext: hasPendingMutationContext,
    }) && !deterministicMutationOverride;
    const retrievalPlanRequiresTools = shouldHonorRetrievalPlan
      && shouldRetrievalPlanRequireTools(authoritativeRetrievalPlan);
    const taskClassRequiresTools = shouldTaskClassRequireTools(provisionalRoutingPolicy.taskClass);
    const messageRequiresTools = looksLikeCrmRequestMessage(message, historyText);
    const needsTools = needsToolsBase || retrievalPlanRequiresTools || taskClassRequiresTools || messageRequiresTools || hasPendingMutationContext;
    const routingPolicy = needsTools === needsToolsBase
      ? provisionalRoutingPolicy
      : determineRoutingPolicy({
        message,
        historyText,
        domains: domainsHint,
        channel: resolvedChannel,
        needsTools,
        verificationRequired: dataOrActionRequest,
        intentHint: authoritativeIntent,
      });
    const shouldTryResponseCache = shouldAttemptResponseCache(message, followUpLike, compoundLike, dataOrActionRequest);
    const trimmedHistory = trimHistory(
      normalizedHistory,
      QUALITY_MODE ? (followUpLike || compoundLike ? 14 : 12) : (followUpLike ? 10 : 8),
      QUALITY_MODE ? (followUpLike || compoundLike ? 2200 : 1800) : 1200
    );
    let domainFilter = needsTools
      ? (domainsHint.length > 0 ? domainsHint : FALLBACK_DOMAINS)
      : undefined;
    const deterministicSchedulingOverride = /\b(?:schedule|book|set\s+up|arrange)\b[\s\S]*\b(?:call|meeting|calendar\s+invite|meeting\s+invite|lunch|coffee)\b|\b(?:availability|scheduling\s+email)\b[\s\S]*\b(?:for|with)\b/i.test(message);
    if (deterministicMutationOverride && domainFilter) {
      domainFilter = Array.from(new Set([...domainFilter, 'create', 'update', 'search'] as SkillDomain[]));
    }
    if (deterministicMutationOverride && !domainFilter) {
      domainFilter = ['create', 'update', 'search'];
    }
    if (deterministicSchedulingOverride && domainFilter && !domainFilter.includes('scheduling')) {
      domainFilter = Array.from(new Set([...domainFilter, 'scheduling', 'email', 'context', 'search'] as SkillDomain[]));
    }
    if (deterministicSchedulingOverride && !domainFilter) {
      domainFilter = ['scheduling', 'email', 'context', 'search'];
    }
    // Ensure create tools are available when resuming a pending deal creation
    if (hasPendingDealContext && domainFilter && !domainFilter.includes('create')) {
      domainFilter = [...domainFilter, 'create', 'search'];
    }
    if (hasPendingDealContext && !domainFilter) {
      domainFilter = ['create', 'search'];
    }
    if (hasPendingSequenceAction && domainFilter && !domainFilter.includes('sequences')) {
      domainFilter = [...domainFilter, 'sequences'];
    }
    if (hasPendingSequenceAction && !domainFilter) {
      domainFilter = ['sequences'];
    }
    if (hasPendingDeleteDealContext && domainFilter && !domainFilter.includes('update')) {
      domainFilter = [...domainFilter, 'update', 'search'];
    }
    if (hasPendingDeleteDealContext && !domainFilter) {
      domainFilter = ['update', 'search'];
    }
    if (hasPendingUpdateDealContext && domainFilter && !domainFilter.includes('update')) {
      domainFilter = [...domainFilter, 'update', 'search'];
    }
    if (hasPendingUpdateDealContext && !domainFilter) {
      domainFilter = ['update', 'search'];
    }
    if (hasPendingDraftEmailContext && domainFilter && !domainFilter.includes('intelligence')) {
      domainFilter = [...domainFilter, 'intelligence', 'email', 'search'];
    }
    if (hasPendingDraftEmailContext && !domainFilter) {
      domainFilter = ['intelligence', 'email', 'search'];
    }
    if (hasPendingScheduleMeetingContext && domainFilter && !domainFilter.includes('scheduling')) {
      domainFilter = [...domainFilter, 'scheduling', 'search', 'context'];
    }
    if (hasPendingScheduleMeetingContext && !domainFilter) {
      domainFilter = ['scheduling', 'search', 'context'];
    }

    let routing = routeRequest({
      message,
      historyLength: trimmedHistory.length,
      analysisMode: 'general',
      hasEntityContext: !!resolvedEntityContext || !!pageContextKey,
      channel: resolvedChannel,
      isUrgent: false,
      toolCount: STABLE_TOOL_SET.size,
      dataRequest: needsTools,
      domainHints: domainFilter && domainFilter.length > 0 ? domainFilter : undefined,
      followUpLike,
      compoundLike,
      qualityMode: QUALITY_MODE,
      minTier: routingPolicy.minimumTier,
    });

    console.log('[unified-chat] intent', {
      mode: rollout.mode,
      intent: authoritativeIntent.intent,
      executionPath: authoritativeIntent.executionPath,
      entityType: authoritativeIntent.entityType,
      entityHint: authoritativeIntent.entityHint,
      entityId: authoritativeIntent.entityId,
      confidence: authoritativeIntent.confidence,
      forcePath: authoritativeIntent.forcePath,
      shadowIntent: comparisonIntent?.intent || null,
    });

    const shouldReturnClarification = !deterministicMutationOverride
      && !hasPendingMutationContext
      && clarification.needsClarification
      && Number(authoritativeIntent?.confidence || 0) >= 0.72;

    if (shouldReturnClarification) {
      await logRuntimeDecisionTrace(admin, {
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        channel: resolvedChannel,
        routingTier: routing.tier,
        domains: domainsHint,
        toolCount: 0,
        synthesisTriggered: false,
        tokenIn: 0,
        tokenOut: 0,
        totalTokens: 0,
        cacheHit: false,
        cacheType: 'none',
        latencyMs: Date.now() - started,
        status: 'success',
        summary: clarification.message || 'Could you clarify what you mean?',
        aiProvider: 'deterministic',
        aiModel: 'clarification',
        taskClass: routingPolicy.taskClass,
        riskLevel: routingPolicy.riskLevel,
        minimumTier: routingPolicy.minimumTier,
        selectedTier: routing.tier,
        mutationIntent: routingPolicy.mutationIntent,
        routingPolicyVersion: routingPolicy.policyVersion,
        verificationPolicy: 'none',
        blockingFailure: false,
        mixedIntent: false,
        factualClaimsDetected: false,
        legacyWouldBlock: false,
        extractedIntent: authoritativeIntent.intent,
        queryAssistEnabled: preExecutionQueryAssist.enabled,
        queryAssistReason: preExecutionQueryAssist.reason,
        queryAssistDisplayMode: preExecutionQueryAssist.displayMode,
        queryAssistSuggestionCount: preExecutionQueryAssistSuggestions.length,
        traceId,
        ...intentTraceFields,
      }).catch(() => { });

      return new Response(JSON.stringify(buildClarificationResponsePayload({
        message: clarification.message || 'Could you clarify what you mean?',
        reason: clarification.reason || 'clarification_needed',
        channel: resolvedChannel,
        processingTimeMs: Date.now() - started,
        intentMeta: publicIntentMeta,
        queryAssistMeta: publicPreExecutionQueryAssistMeta,
        traceId,
        executionMeta: buildPublicExecutionMeta({
          taskClass: routingPolicy.taskClass,
          needsTools,
          schemaCount: 0,
          retrievalPath: authoritativeRetrievalPlan.path,
          toolPlannerInvoked: false,
          deterministicPathUsed: false,
          groundingState: 'clarification_needed',
        }),
      })), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (shouldForceDeterministicPath(authoritativeIntent) && authoritativeIntent.intent === 'deal_analysis') {
      const scoutpadArgs: { deal_id?: string; deal_name?: string; zoom_level?: 'tactical' | 'strategic' } = {};
      if (authoritativeIntent.entityType === 'deal' && authoritativeIntent.entityId) scoutpadArgs.deal_id = authoritativeIntent.entityId;
      else if (authoritativeIntent.entityHint) scoutpadArgs.deal_name = authoritativeIntent.entityHint;
      if (authoritativeIntent.zoomLevel) scoutpadArgs.zoom_level = authoritativeIntent.zoomLevel;

      const scoutpadResult = await executeRegistryTool('analyze_deal', scoutpadArgs, {
        supabase: admin,
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        sessionTable: resolvedChannel === 'web' ? 'chat_sessions' : 'messaging_sessions',
        entityContext: resolvedEntityContext,
        activeContext: resolvedActiveContext,
        traceId,
      });

      const processing = Date.now() - started;
      const baseResponseText = String(
        scoutpadResult?.message
        || (scoutpadResult?.success
          ? 'Opening SCOUTPAD analysis.'
          : 'Which deal should I analyze with SCOUTPAD?')
      );
      const scoutpadOperations = [{ tool: 'analyze_deal', args: scoutpadArgs, result: scoutpadResult }];
      const scoutpadCitations = collectCitationsFromToolExecution('analyze_deal', scoutpadArgs, scoutpadResult);
      const {
        verification: scoutpadVerification,
        factualClaimsDetected: scoutpadFactualClaimsDetected,
      } = evaluateHybridVerification({
        message,
        response: baseResponseText,
        crmOperations: scoutpadOperations,
        citations: scoutpadCitations,
        routingTaskClass: 'scoutpad',
        dataOrActionRequest: true,
      });
      const scoutpadGroundingState = classifyGroundingState({
        verification: scoutpadVerification,
        crmOperations: scoutpadOperations,
        citations: scoutpadCitations,
        response: baseResponseText,
        clarificationNeeded: false,
      });
      let responseText = applyVerificationPolicyToResponse(baseResponseText, scoutpadVerification);
      if (['failure', 'no_results'].includes(scoutpadGroundingState)) {
        responseText = buildGroundedFailureMessage(scoutpadGroundingState, {
          toolErrors: scoutpadOperations.filter((op: any) => op.result?.error).map((op: any) => op.tool),
          toolsRan: scoutpadOperations.map((op: any) => op.tool),
        });
      }
      const scoutpadQueryAssist = evaluateQueryAssist({
        message,
        intent: authoritativeIntent,
        retrievalPlan: authoritativeRetrievalPlan,
        clarification,
        groundingState: scoutpadGroundingState,
        crmOperations: scoutpadOperations,
        response: responseText,
        historyEntries: Array.isArray(conversationHistory) ? conversationHistory : [],
      });
      const scoutpadQueryAssistSuggestions = scoutpadQueryAssist.enabled
        ? buildQueryAssistSuggestions({
          reason: scoutpadQueryAssist.reason,
          intent: authoritativeIntent,
          context: queryAssistContext,
          message,
        })
        : [];
      const publicScoutpadQueryAssistMeta = buildPublicQueryAssistMeta({
        rolloutMode: rollout.mode,
        queryAssist: scoutpadQueryAssist,
        suggestions: scoutpadQueryAssistSuggestions,
      });
      const scoutpadResponseCitations = scoutpadGroundingState === 'verified' || scoutpadGroundingState === 'advisory_only'
        ? scoutpadCitations
        : [];
      const publicScoutpadVerification = {
        ...scoutpadVerification,
        citation_count: scoutpadResponseCitations.length,
      };
      const scoutpadTokenUsageColumns = buildIndustryTokenUsageColumns({
        intentModel: 'deterministic',
        intentUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        synthesisModel: null,
        synthesisUsage: null,
        cacheHit: false,
      });

      await logRuntimeDecisionTrace(admin, {
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        channel: resolvedChannel,
        routingTier: 'pro',
        domains: ['coaching'],
        toolCount: 1,
        synthesisTriggered: false,
        tokenIn: 0,
        tokenOut: 0,
        totalTokens: 0,
        cacheHit: false,
        cacheType: 'none',
        latencyMs: processing,
        status: scoutpadVerification.blocking_failure
          ? 'blocked'
          : (scoutpadResult?.success ? 'success' : 'error'),
        summary: responseText,
        aiProvider: 'deterministic',
        aiModel: 'deterministic',
        tokenUsageColumns: scoutpadTokenUsageColumns,
        taskClass: 'scoutpad',
        riskLevel: 'critical',
        minimumTier: 'pro',
        selectedTier: 'pro',
        mutationIntent: false,
        routingPolicyVersion: 'routing-policy-v1',
        verificationPolicy: scoutpadVerification.policy,
        blockingFailure: scoutpadVerification.blocking_failure,
        mixedIntent: scoutpadVerification.mixed_intent,
        factualClaimsDetected: scoutpadFactualClaimsDetected,
        legacyWouldBlock: scoutpadVerification.legacy_would_block,
        extractedIntent: authoritativeIntent.intent,
        queryAssistEnabled: scoutpadQueryAssist.enabled,
        queryAssistReason: scoutpadQueryAssist.reason,
        queryAssistDisplayMode: scoutpadQueryAssist.displayMode,
        queryAssistSuggestionCount: scoutpadQueryAssistSuggestions.length,
        ...intentTraceFields,
      }).catch(() => { });

      return new Response(JSON.stringify({
        response: responseText,
        crmOperations: scoutpadOperations,
        citations: scoutpadResponseCitations,
        verification: publicScoutpadVerification,
        action: scoutpadResult?.action,
        meta: {
          channel: resolvedChannel,
          intent: publicIntentMeta,
          queryAssist: publicScoutpadQueryAssistMeta,
          execution: buildPublicExecutionMeta({
            taskClass: 'scoutpad',
            needsTools: true,
            schemaCount: 1,
            retrievalPath: authoritativeRetrievalPlan.path,
            toolPlannerInvoked: false,
            deterministicPathUsed: true,
            groundingState: scoutpadGroundingState,
          }),
          forcedScoutpad: true,
          routingPolicy: {
            version: 'routing-policy-v1',
            taskClass: 'scoutpad',
            riskLevel: 'critical',
            minimumTier: 'pro',
            selectedTier: 'pro',
            mutationIntent: false,
          },
          strictVerification: scoutpadVerification.policy === 'strict',
          verificationPolicy: scoutpadVerification.policy,
          processingTimeMs: processing,
          mode: 'deterministic',
          aiRuntime: {
            mode: 'deterministic',
            provider: null,
            model: null,
            tokenUsageColumns: scoutpadTokenUsageColumns,
          },
        },
        provenance: {
          source: 'database',
          recordsFound: scoutpadResult?.success ? 1 : 0,
          searchPerformed: true,
          confidence: scoutpadResult?.success ? 'high' : 'medium',
          processingTimeMs: processing,
          analysisMode: 'scoutpad',
          isolationEnforced: false,
          tokenUsage: {
            intent: { prompt: 0, completion: 0 },
            synthesis: null,
            total: 0,
            industry_standard_rows: scoutpadTokenUsageColumns,
          },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const useLegacyPipelineShortcut = !(shouldHonorRetrievalPlan && authoritativeRetrievalPlan.path === 'pipeline_context');
    // "show all deals", "list every deal" etc. should NOT hit pipeline fast path — route to search_crm instead
    const isExhaustiveList = /\b(all\s+(my\s+)?deals|every\s+(single\s+)?deal|list\s+all|show\s+all)\b/i.test(message);
    const isPipelineLike = !isExhaustiveList && !documentDetection.isDocument && !shouldBypassPipelineRetrievalForMutation && useLegacyPipelineShortcut
      && (authoritativeIntent.intent === 'pipeline_summary' || authoritativeIntent.intent === 'pipeline_window' || isDirectPipelineSummaryRequest(message));
    const followupPipeline = !documentDetection.isDocument && isPipelineFollowUpRequest(message, historyText);
    const analyticsPageType = String(normalizedPageContext?.pageType || normalizedPageContext?.type || '').toLowerCase();
    const isAnalyticsDashboardReview = (analyticsPageType === 'analytics' || analyticsPageType === 'analytics_dashboard')
      && /\b(explain|review|analy[sz]e|attention|pay attention|dashboard|view|what should i)\b/i.test(message || '')
      && !/\b(create|generate|build|make)\b[\s\S]*\bdashboards?\b/i.test(message || '');

    // Deterministic fast path for "show all deals" — bypass LLM, call search_crm directly
    if (isExhaustiveList) {
      console.log('[unified-chat] Exhaustive list request detected — bypassing LLM, querying deals directly');
      const { data: allDeals, error: listError } = await admin
        .from('deals')
        .select('*, accounts(name), contacts(full_name,email,company)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!listError && allDeals && allDeals.length > 0) {
        const dealLines = allDeals.map((d: any) => {
          const amount = d.amount ? `$${d.amount >= 1000 ? (d.amount / 1000).toFixed(0) + 'K' : d.amount}` : '$0';
          const closeDate = d.expected_close_date || 'no close date';
          const account = d.accounts?.name || 'no account';
          return `- **${d.name}** — ${d.stage} — ${amount} — ${closeDate} — ${account}`;
        }).join('\n');
        const totalValue = allDeals.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
        const listResponse = `${allDeals.length} deals found (total value: $${totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + 'K' : totalValue}):\n\n${dealLines}`;

        const listCitations = allDeals.slice(0, 8).map((d: any) => ({
          table: 'deals',
          rowId: d.id,
          sourceTool: 'search_crm',
          valueSnapshot: { name: d.name, stage: d.stage, amount: d.amount },
        }));

        const processingTime = Date.now() - (validation as any)._startTime || 0;
        return new Response(JSON.stringify({
          response: listResponse,
          crmOperations: [{ tool: 'search_crm', args: { entity_type: 'deals', list_all: true }, result: { results: allDeals, count: allDeals.length, entity_type: 'deals' } }],
          citations: listCitations,
          verification: { is_true: true, citation_count: listCitations.length, policy: 'strict', source_status: 'source_backed', blocking_failure: false },
          meta: { channel: resolvedChannel, entityContext: { referencedEntities: {}, primaryEntity: undefined }, execution: { deterministicPathUsed: true, path: 'exhaustive_list' } },
          provenance: { source: 'database', recordsFound: allDeals.length, confidence: 'high', processingTimeMs: processingTime },
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
      // If query fails, fall through to LLM path
      console.log('[unified-chat] Exhaustive list query failed, falling through to LLM:', listError?.message);
    }

    if (isAnalyticsDashboardReview) {
      console.log('[unified-chat] Analytics dashboard review detected — querying deals directly');
      const { data: deals, error } = await admin
        .from('deals')
        .select('id, name, amount, stage, probability, expected_close_date, updated_at, created_at')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(1000);

      if (!error && deals) {
        const summary = buildAnalyticsDashboardSummaryFromDeals(deals, message);
        const analyticsToolResult = {
          ...summary.metrics,
          count: deals.length,
          totalDeals: summary.metrics.totalDeals,
          results: summary.citationRows,
          entity_type: 'deals',
          __citationRows: summary.citationRows,
          __forceNoCitations: summary.citationRows.length === 0,
        };
        const analyticsOperations = [{
          tool: 'get_pipeline_stats',
          args: { inferred: true, source: 'analytics_dashboard' },
          result: analyticsToolResult,
        }];
        const analyticsCitations = collectCitationsFromToolExecution('get_pipeline_stats', { inferred: true, source: 'analytics_dashboard' }, analyticsToolResult);
        const {
          verification: analyticsVerification,
          factualClaimsDetected: analyticsFactualClaimsDetected,
        } = evaluateHybridVerification({
          message,
          response: summary.response,
          crmOperations: analyticsOperations,
          citations: analyticsCitations,
          routingTaskClass: 'analytics',
          dataOrActionRequest: true,
        });
        const analyticsGroundingState = classifyGroundingState({
          verification: analyticsVerification,
          crmOperations: analyticsOperations,
          citations: analyticsCitations,
          response: summary.response,
          clarificationNeeded: false,
        });
        let verifiedAnalyticsResponse = applyVerificationPolicyToResponse(summary.response, analyticsVerification);
        if (['failure', 'no_results'].includes(analyticsGroundingState)) {
          verifiedAnalyticsResponse = buildGroundedFailureMessage(analyticsGroundingState, {
            toolErrors: analyticsOperations.filter((op: any) => op.result?.error).map((op: any) => op.tool),
            toolsRan: analyticsOperations.map((op: any) => op.tool),
          });
        }

        const analyticsQueryAssist = evaluateQueryAssist({
          message,
          intent: authoritativeIntent,
          retrievalPlan: authoritativeRetrievalPlan,
          clarification,
          groundingState: analyticsGroundingState,
          crmOperations: analyticsOperations,
          response: verifiedAnalyticsResponse,
          historyEntries: Array.isArray(conversationHistory) ? conversationHistory : [],
        });
        const analyticsQueryAssistSuggestions = analyticsQueryAssist.enabled
          ? buildQueryAssistSuggestions({
            reason: analyticsQueryAssist.reason,
            intent: authoritativeIntent,
            context: queryAssistContext,
            message,
          })
          : [];
        const publicAnalyticsQueryAssistMeta = buildPublicQueryAssistMeta({
          rolloutMode: rollout.mode,
          queryAssist: analyticsQueryAssist,
          suggestions: analyticsQueryAssistSuggestions,
        });
        const responseAnalyticsCitations = analyticsGroundingState === 'verified' || analyticsGroundingState === 'advisory_only'
          ? analyticsCitations
          : [];
        const publicAnalyticsVerification = {
          ...analyticsVerification,
          citation_count: responseAnalyticsCitations.length,
        };
        const processing = Date.now() - started;
        const analyticsTokenUsageColumns = buildIndustryTokenUsageColumns({
          intentModel: 'deterministic',
          intentUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          synthesisModel: null,
          synthesisUsage: null,
          cacheHit: false,
        });
        await logRuntimeDecisionTrace(admin, {
          organizationId,
          userId,
          sessionId: validation.sanitizedData.sessionId,
          channel: resolvedChannel,
          routingTier: 'pro',
          domains: ['analytics', 'search'],
          toolCount: 1,
          synthesisTriggered: false,
          tokenIn: 0,
          tokenOut: 0,
          totalTokens: 0,
          cacheHit: false,
          cacheType: 'none',
          latencyMs: processing,
          status: analyticsVerification.blocking_failure ? 'blocked' : 'success',
          summary: verifiedAnalyticsResponse,
          aiProvider: 'deterministic',
          aiModel: 'deterministic',
          tokenUsageColumns: analyticsTokenUsageColumns,
          taskClass: 'analytics',
          riskLevel: 'high',
          minimumTier: 'pro',
          selectedTier: 'pro',
          mutationIntent: false,
          routingPolicyVersion: 'routing-policy-v1',
          verificationPolicy: analyticsVerification.policy,
          blockingFailure: analyticsVerification.blocking_failure,
          mixedIntent: analyticsVerification.mixed_intent,
          factualClaimsDetected: analyticsFactualClaimsDetected,
          legacyWouldBlock: analyticsVerification.legacy_would_block,
          extractedIntent: authoritativeIntent.intent,
          queryAssistEnabled: analyticsQueryAssist.enabled,
          queryAssistReason: analyticsQueryAssist.reason,
          queryAssistDisplayMode: analyticsQueryAssist.displayMode,
          queryAssistSuggestionCount: analyticsQueryAssistSuggestions.length,
          ...intentTraceFields,
        }).catch(() => { });

        return new Response(JSON.stringify({
          response: verifiedAnalyticsResponse,
          crmOperations: analyticsOperations,
          citations: responseAnalyticsCitations,
          verification: publicAnalyticsVerification,
          meta: {
            channel: resolvedChannel,
            intent: publicIntentMeta,
            queryAssist: publicAnalyticsQueryAssistMeta,
            execution: buildPublicExecutionMeta({
              taskClass: 'analytics',
              needsTools: true,
              schemaCount: 1,
              retrievalPath: 'analytics_dashboard_review',
              toolPlannerInvoked: false,
              deterministicPathUsed: true,
              groundingState: analyticsGroundingState,
            }),
            routingPolicy: {
              version: 'routing-policy-v1',
              taskClass: 'analytics',
              riskLevel: 'high',
              minimumTier: 'pro',
              selectedTier: 'pro',
              mutationIntent: false,
            },
            strictVerification: analyticsVerification.policy === 'strict',
            verificationPolicy: analyticsVerification.policy,
            processingTimeMs: processing,
            mode: 'deterministic',
            aiRuntime: {
              mode: 'deterministic',
              provider: null,
              model: null,
              tokenUsageColumns: analyticsTokenUsageColumns,
            },
          },
          provenance: {
            source: 'database',
            recordsFound: deals.length,
            searchPerformed: true,
            confidence: 'high',
            processingTimeMs: processing,
            analysisMode: 'analytics_dashboard',
            isolationEnforced: false,
            tokenUsage: {
              intent: { prompt: 0, completion: 0 },
              synthesis: null,
              total: 0,
              industry_standard_rows: analyticsTokenUsageColumns,
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      console.log('[unified-chat] Analytics dashboard query failed, falling through to LLM:', error?.message);
    }

    if (isPipelineLike || followupPipeline) {
      const { data: deals, error } = await admin
        .from('deals')
        .select('id, name, amount, stage, probability, expected_close_date, updated_at, created_at')
        .eq('organization_id', organizationId)
        .limit(1000);

      if (!error && deals) {
        const summary = buildDirectPipelineSummaryFromDeals(deals, message);
        const prioritizedDealIds = Array.isArray((summary as any).citationDealIds)
          ? ((summary as any).citationDealIds as string[])
          : [];
        const prioritizedIndex = new Map(prioritizedDealIds.map((id, idx) => [String(id), idx]));
        const indexedDeals = deals.map((deal: any, idx: number) => ({ deal, idx }));
        const citationOrderedDeals = prioritizedDealIds.length > 0
          ? indexedDeals
            .sort((a, b) => {
              const aRank = prioritizedIndex.has(String(a.deal?.id))
                ? (prioritizedIndex.get(String(a.deal?.id)) as number)
                : Number.MAX_SAFE_INTEGER;
              const bRank = prioritizedIndex.has(String(b.deal?.id))
                ? (prioritizedIndex.get(String(b.deal?.id)) as number)
                : Number.MAX_SAFE_INTEGER;
              if (aRank !== bRank) return aRank - bRank;
              return a.idx - b.idx;
            })
            .map((entry) => entry.deal)
          : deals;
        const pipelineToolResult = {
          totalDeals: typeof (summary as any).scopedCount === 'number' ? (summary as any).scopedCount : prioritizedDealIds.length,
          count: typeof (summary as any).scopedCount === 'number' ? (summary as any).scopedCount : prioritizedDealIds.length,
          results: citationOrderedDeals,
          entity_type: 'deals',
          __citationRows: citationOrderedDeals.slice(0, 8),
          __forceNoCitations: citationOrderedDeals.length === 0,
        };
        const pipelineOperations = [{ tool: 'get_pipeline_stats', args: { inferred: true }, result: pipelineToolResult }];
        const pipelineCitations = collectCitationsFromToolExecution('get_pipeline_stats', { inferred: true }, pipelineToolResult);
        const {
          verification: pipelineVerification,
          factualClaimsDetected: pipelineFactualClaimsDetected,
        } = evaluateHybridVerification({
          message,
          response: summary.response,
          crmOperations: pipelineOperations,
          citations: pipelineCitations,
          routingTaskClass: 'analytics',
          dataOrActionRequest: true,
        });
        const pipelineGroundingState = classifyGroundingState({
          verification: pipelineVerification,
          crmOperations: pipelineOperations,
          citations: pipelineCitations,
          response: summary.response,
          clarificationNeeded: false,
        });
        let verifiedPipelineResponse = applyVerificationPolicyToResponse(summary.response, pipelineVerification);
        if (['failure', 'no_results'].includes(pipelineGroundingState)) {
          verifiedPipelineResponse = buildGroundedFailureMessage(pipelineGroundingState, {
            toolErrors: pipelineOperations.filter((op: any) => op.result?.error).map((op: any) => op.tool),
            toolsRan: pipelineOperations.map((op: any) => op.tool),
          });
        }
        const pipelineQueryAssist = evaluateQueryAssist({
          message,
          intent: authoritativeIntent,
          retrievalPlan: authoritativeRetrievalPlan,
          clarification,
          groundingState: pipelineGroundingState,
          crmOperations: pipelineOperations,
          response: verifiedPipelineResponse,
          historyEntries: Array.isArray(conversationHistory) ? conversationHistory : [],
        });
        const pipelineQueryAssistSuggestions = pipelineQueryAssist.enabled
          ? buildQueryAssistSuggestions({
            reason: pipelineQueryAssist.reason,
            intent: authoritativeIntent,
            context: queryAssistContext,
            message,
          })
          : [];
        const publicPipelineQueryAssistMeta = buildPublicQueryAssistMeta({
          rolloutMode: rollout.mode,
          queryAssist: pipelineQueryAssist,
          suggestions: pipelineQueryAssistSuggestions,
        });
        const responsePipelineCitations = pipelineGroundingState === 'verified' || pipelineGroundingState === 'advisory_only'
          ? pipelineCitations
          : [];
        const publicPipelineVerification = {
          ...pipelineVerification,
          citation_count: responsePipelineCitations.length,
        };
        const processing = Date.now() - started;
        const pipelineTokenUsageColumns = buildIndustryTokenUsageColumns({
          intentModel: 'deterministic',
          intentUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          synthesisModel: null,
          synthesisUsage: null,
          cacheHit: false,
        });
        await logRuntimeDecisionTrace(admin, {
          organizationId,
          userId,
          sessionId: validation.sanitizedData.sessionId,
          channel: resolvedChannel,
          routingTier: 'pro',
          domains: ['analytics', 'search'],
          toolCount: 1,
          synthesisTriggered: false,
          tokenIn: 0,
          tokenOut: 0,
          totalTokens: 0,
          cacheHit: false,
          cacheType: 'none',
          latencyMs: processing,
          status: pipelineVerification.blocking_failure ? 'blocked' : 'success',
          summary: verifiedPipelineResponse,
          aiProvider: 'deterministic',
          aiModel: 'deterministic',
          tokenUsageColumns: pipelineTokenUsageColumns,
          taskClass: 'analytics',
          riskLevel: 'high',
          minimumTier: 'pro',
          selectedTier: 'pro',
          mutationIntent: false,
          routingPolicyVersion: 'routing-policy-v1',
          verificationPolicy: pipelineVerification.policy,
          blockingFailure: pipelineVerification.blocking_failure,
          mixedIntent: pipelineVerification.mixed_intent,
          factualClaimsDetected: pipelineFactualClaimsDetected,
          legacyWouldBlock: pipelineVerification.legacy_would_block,
          extractedIntent: authoritativeIntent.intent,
          queryAssistEnabled: pipelineQueryAssist.enabled,
          queryAssistReason: pipelineQueryAssist.reason,
          queryAssistDisplayMode: pipelineQueryAssist.displayMode,
          queryAssistSuggestionCount: pipelineQueryAssistSuggestions.length,
          ...intentTraceFields,
        }).catch(() => { });

        return new Response(JSON.stringify({
          response: verifiedPipelineResponse,
          crmOperations: pipelineOperations,
          citations: responsePipelineCitations,
          verification: publicPipelineVerification,
          meta: {
            channel: resolvedChannel,
            intent: publicIntentMeta,
            queryAssist: publicPipelineQueryAssistMeta,
            execution: buildPublicExecutionMeta({
              taskClass: 'analytics',
              needsTools: true,
              schemaCount: 1,
              retrievalPath: authoritativeRetrievalPlan.path,
              toolPlannerInvoked: false,
              deterministicPathUsed: true,
              groundingState: pipelineGroundingState,
            }),
            dealLinks: summary.dealLinks,
            routingPolicy: {
              version: 'routing-policy-v1',
              taskClass: 'analytics',
              riskLevel: 'high',
              minimumTier: 'pro',
              selectedTier: 'pro',
              mutationIntent: false,
            },
            strictVerification: pipelineVerification.policy === 'strict',
            verificationPolicy: pipelineVerification.policy,
            processingTimeMs: processing,
            mode: 'deterministic',
            aiRuntime: {
              mode: 'deterministic',
              provider: null,
              model: null,
              tokenUsageColumns: pipelineTokenUsageColumns,
            },
          },
          provenance: {
            source: 'database',
            recordsFound: deals.length,
            searchPerformed: true,
            confidence: 'high',
            processingTimeMs: processing,
            analysisMode: 'general',
            isolationEnforced: false,
            tokenUsage: {
              intent: { prompt: 0, completion: 0 },
              synthesis: null,
              total: 0,
              industry_standard_rows: pipelineTokenUsageColumns,
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    if (!hasAnyProvider()) {
      return new Response(JSON.stringify({
        response: "I'm sorry, but the AI service is not configured.",
        error: 'No AI provider available',
        citations: [],
        verification: {
          mode: 'strict_db_citations',
          requires_verification: true,
          is_true: false,
          failed_checks: ['NO_AI_PROVIDER'],
          citation_count: 0,
          operation_count: 0,
          verified_at: new Date().toISOString(),
          policy: 'strict',
          blocking_failure: true,
          mixed_intent: false,
          source_status: 'source_gap',
          user_summary: 'No AI provider is configured, so verification could not run.',
          legacy_would_block: true,
        },
        meta: {
          channel: resolvedChannel,
          intent: publicIntentMeta,
          execution: buildPublicExecutionMeta({
            taskClass: routingPolicy.taskClass,
            needsTools,
            schemaCount: 0,
            retrievalPath: authoritativeRetrievalPlan.path,
            toolPlannerInvoked: false,
            deterministicPathUsed: false,
            groundingState: 'failure',
          }),
        },
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Follow-up/compound prompts need deeper context and tool access.
    if (followUpLike && routing.tier === 'lite') {
      routing = {
        ...routing,
        tier: 'standard',
        maxTokens: Math.max(routing.maxTokens, 1800),
        reason: `${routing.reason}; followup_bump=standard`,
      };
    }
    if (compoundLike && routing.tier !== 'pro') {
      routing = {
        ...routing,
        tier: 'pro',
        maxTokens: Math.max(routing.maxTokens, 2600),
        reason: `${routing.reason}; compound_bump=pro`,
      };
    }
    routing = applyMinimumRoutingTier(routing, routingPolicy.minimumTier);

    // For exhaustive list requests, exclude pipeline tools and override any intent-router preference
    const excludedTools = isExhaustiveList ? new Set(['get_pipeline_context', 'get_pipeline_stats']) : null;
    let preferredToolNames = shouldApplyPreferredRetrievalToolFilter({
      shouldHonorRetrievalPlan,
      retrievalPlan: authoritativeRetrievalPlan,
      hasPendingDealContext: hasPendingMutationContext || deterministicMutationOverride,
    })
      ? new Set(authoritativeRetrievalPlan.preferredTools)
      : null;
    // Clear preferred tools if they conflict with exclusion (e.g. intent router wants get_pipeline_context but user asked for all deals)
    if (excludedTools && preferredToolNames) {
      for (const excluded of excludedTools) preferredToolNames.delete(excluded);
      if (preferredToolNames.size === 0) preferredToolNames = null;
    }
    if (domainFilter?.includes('scheduling')) {
      preferredToolNames = null;
    }
    const schemas = needsTools
      ? getRegistryToolSchemas({ tier: routing.tier, domains: domainFilter })
        .filter((s) => STABLE_TOOL_SET.has(s.function.name))
        .filter((s) => !getToolPermissionError(String(s.function.name || ''), authorizedOrg?.role))
        .filter((s) => !excludedTools || !excludedTools.has(s.function.name))
        .filter((s) => !preferredToolNames || preferredToolNames.size === 0 || preferredToolNames.has(String(s?.function?.name || '')))
      : [];
    const allowedToolNames = new Set(
      (schemas || [])
        .map((schema: any) => String(schema?.function?.name || '').trim())
        .filter(Boolean)
    );
    if (shouldHonorRetrievalPlan && authoritativeRetrievalPlan?.forcedTool) {
      allowedToolNames.add(String(authoritativeRetrievalPlan.forcedTool));
    }
    if (
      /\b(create|add|make|set|schedule)\b[\s\S]*\b(task|follow[\s-]?up|next\s+step|todo|reminder)\b/i.test(message)
      && !getToolPermissionError('create_task', authorizedOrg?.role)
    ) {
      allowedToolNames.add('create_task');
    }
    const skillInstructions = needsTools
      ? getSkillInstructions({ tier: routing.tier, domains: domainFilter })
      : '';
    const feedbackSignals = dedupeFeedbackSignals([
      ...extractClientFeedbackSignals(providedFeedbackContext),
      ...(await loadRecentFeedbackSignals(admin, userId, organizationId).catch((err) => {
        console.warn('[unified-chat] Failed to load chat feedback signals:', err?.message || err);
        return [];
      })),
      ...(await loadLearningFeedbackSignals(admin, userId, organizationId).catch((err) => {
        console.warn('[unified-chat] Failed to load learning feedback signals:', err?.message || err);
        return [];
      })),
    ]);
    const feedbackGuidance = buildFeedbackGuidance(feedbackSignals);
    const pageContextPrompt = buildPageContextPrompt(providedPageContext);
    const plannerIntentContext = shouldHonorRetrievalPlan
      ? buildPlannerIntentContext(authoritativeIntent, authoritativeRetrievalPlan)
      : '';
    // Build entity context prompt section for pronoun resolution
    let entityContextPrompt = '';
    if (resolvedEntityContext?.primaryEntity || resolvedEntityContext?.referencedEntities) {
      const parts: string[] = ['ACTIVE ENTITY CONTEXT (for pronoun resolution — "that", "it", "this deal", etc.):'];
      if (resolvedEntityContext.primaryEntity) {
        const pe = resolvedEntityContext.primaryEntity;
        parts.push(`Primary entity: ${pe.name} (${pe.type}, id: ${pe.id})`);
      }
      const refs = resolvedEntityContext.referencedEntities;
      if (refs) {
        for (const [type, entities] of Object.entries(refs)) {
          if (Array.isArray(entities) && entities.length > 0) {
            const names = entities.slice(0, 3).map((e: any) => `${e.name} (id: ${e.id})`).join(', ');
            parts.push(`Recent ${type}: ${names}`);
          }
        }
      }
      parts.push('When the user uses pronouns like "that", "it", "this", "the deal", resolve to the primary entity or most recently referenced entity above.');
      entityContextPrompt = parts.join('\n');
    }

    // Build pending deal creation context if the user is supplying missing fields
    let pendingDealPrompt = '';
    if (effectivePendingDealData && hasPendingDealContext) {
      const pd = Array.isArray(effectivePendingDealData) ? effectivePendingDealData[0] : effectivePendingDealData;
      const fields = [
        pd.account_name && `account_name: "${pd.account_name}"`,
        pd.amount != null && `amount: ${pd.amount}`,
        pd.name && `name: "${pd.name}"`,
        pd.stage && `stage: "${pd.stage}"`,
        pd.close_date && `close_date: "${pd.close_date}"`,
        pd.contact_name && `contact_name: "${pd.contact_name}"`,
      ].filter(Boolean).join(', ');
      const missing = [
        !pd.close_date && 'close_date',
        !pd.contact_name && 'contact_name',
      ].filter(Boolean).join(', ');
      pendingDealPrompt = `PENDING DEAL CREATION\nYou previously asked for missing fields to complete a deal. The partial deal data so far: { ${fields} }.\nMissing fields: ${missing || 'none'}.\nThe user is now providing the missing information. Extract the values from their message, merge with the partial data above, and call create_deal with the COMPLETE set of fields. Accept fuzzy dates like "end of June" or "Q3" — the system resolves them automatically.`;
      console.log(`[unified-chat] Injecting pending deal context: ${fields} (missing: ${missing})`);
    }

    let pendingSequencePrompt = '';
    if (hasPendingSequenceAction && pendingSequenceActionData) {
      const fields = [
        pendingSequenceActionData.action && `action: "${pendingSequenceActionData.action}"`,
        pendingSequenceActionData.sequence_name && `sequence_name: "${pendingSequenceActionData.sequence_name}"`,
        pendingSequenceActionData.contact_name && `contact_name: "${pendingSequenceActionData.contact_name}"`,
        pendingSequenceActionData.contact_email && `contact_email: "${pendingSequenceActionData.contact_email}"`,
        pendingSequenceActionData.confirmation_type && `confirmation_type: "${pendingSequenceActionData.confirmation_type}"`,
      ].filter(Boolean).join(', ');
      pendingSequencePrompt = `PENDING SEQUENCE ACTION\nYou are resuming a sequence workflow. The pending action so far: { ${fields} }.\nThe user is now clarifying the missing sequence or contact detail. Merge their reply with the pending action above and call manage_sequence with the completed arguments.`;
      console.log(`[unified-chat] Injecting pending sequence context: ${fields}`);
    }

    const promptSections = [
      buildSystemPrompt(),
      skillInstructions,
      plannerIntentContext,
      pageContextPrompt,
      entityContextPrompt,
      pendingDealPrompt,
      pendingSequencePrompt,
      feedbackGuidance,
    ].filter((section) => String(section || '').trim().length > 0);
    const systemPrompt = promptSections.join('\n\n');
    const contextualUserMessage = augmentFollowUpMessage(message, trimmedHistory);

    let responseCacheKey: string | null = null;
    if (shouldTryResponseCache) {
      responseCacheKey = await buildResponseCacheKey(
        organizationId,
        userId,
        message,
        RESPONSE_CACHE_BUCKET_SECONDS,
        pageContextKey
      );
      const cachedPayload = await loadCachedResponse(admin, responseCacheKey, organizationId, userId);
      if (cachedPayload) {
        const cachedVerification = cachedPayload?.verification;
        const cachedCitations = Array.isArray(cachedPayload?.citations) ? cachedPayload.citations : [];
        const cacheIsStrictVerified = cachedVerification?.mode === 'strict_db_citations'
          && cachedVerification?.is_true === true
          && (cachedVerification?.policy ? cachedVerification?.policy === 'strict' : true)
          && cachedCitations.length > 0;
        const cacheRowsStillValid = cacheIsStrictVerified
          ? await hasValidRetrievedCitationRows(admin, organizationId, cachedCitations)
          : false;

        if (cacheIsStrictVerified && cacheRowsStillValid) {
          const processing = Date.now() - started;
          const cachedModel = String(cachedPayload?.meta?.aiRuntime?.model || 'response-cache');
          const responseCacheTokenUsageColumns = buildIndustryTokenUsageColumns({
            intentModel: cachedModel,
            intentUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            synthesisModel: null,
            synthesisUsage: null,
            cacheHit: true,
          });
          await logRuntimeDecisionTrace(admin, {
            organizationId,
            userId,
            sessionId: validation.sanitizedData.sessionId,
            channel: resolvedChannel,
            routingTier: routing.tier,
            domains: domainFilter || [],
            toolCount: Array.isArray(cachedPayload?.crmOperations) ? cachedPayload.crmOperations.length : 0,
            synthesisTriggered: false,
            tokenIn: 0,
            tokenOut: 0,
            totalTokens: 0,
            cacheHit: true,
            cacheType: 'response',
            latencyMs: processing,
            status: 'success',
            summary: cachedPayload?.response || 'response_cache_hit',
            aiProvider: 'cache',
            aiModel: cachedModel,
            tokenUsageColumns: responseCacheTokenUsageColumns,
            taskClass: routingPolicy.taskClass,
            riskLevel: routingPolicy.riskLevel,
            minimumTier: routingPolicy.minimumTier,
            selectedTier: routing.tier,
            mutationIntent: routingPolicy.mutationIntent,
            routingPolicyVersion: routingPolicy.policyVersion,
            verificationPolicy: cachedVerification?.policy || null,
            blockingFailure: cachedVerification?.blocking_failure === true,
            mixedIntent: cachedVerification?.mixed_intent === true,
            traceId,
            factualClaimsDetected: false,
            legacyWouldBlock: cachedVerification?.legacy_would_block === true,
            extractedIntent: authoritativeIntent?.intent || null,
            ...intentTraceFields,
          }).catch(() => { });

          return new Response(JSON.stringify({
            ...cachedPayload,
            meta: {
              ...(cachedPayload?.meta || {}),
              traceId,
              intent: publicIntentMeta,
              execution: buildPublicExecutionMeta({
                taskClass: routingPolicy.taskClass,
                needsTools,
                schemaCount: 0,
                retrievalPath: authoritativeRetrievalPlan.path,
                toolPlannerInvoked: false,
                deterministicPathUsed: false,
                groundingState: cachedPayload?.meta?.groundingState || null,
              }),
              processingTimeMs: processing,
              routingPolicy: {
                version: routingPolicy.policyVersion,
                taskClass: routingPolicy.taskClass,
                riskLevel: routingPolicy.riskLevel,
                minimumTier: routingPolicy.minimumTier,
                selectedTier: routing.tier,
                mutationIntent: routingPolicy.mutationIntent,
              },
              responseCache: { hit: true, type: 'read_only_response' },
              aiRuntime: {
                mode: 'cache',
                provider: 'cache',
                model: 'response-cache',
                synthesisProvider: null,
                synthesisModel: null,
                tokenUsageColumns: responseCacheTokenUsageColumns,
              },
            },
            provenance: {
              ...(cachedPayload?.provenance || {}),
              source: 'response_cache',
              processingTimeMs: processing,
              tokenUsage: {
                intent: { prompt: 0, completion: 0 },
                synthesis: null,
                total: 0,
                industry_standard_rows: responseCacheTokenUsageColumns,
              },
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        console.warn('[unified-chat] Skipping cached response due to strict verification or citation freshness check failure');
      }
    }

    // Filter short non-informative assistant responses from history to prevent the model
    // from mimicking patterns like "Done.", "What exactly should I update?", etc.
    const PLANNER_CONTAMINATION = /^(done\.?|what exactly should i update|which deal would you like|which record|i searched your crm but|i could not retrieve|results don't match|data lookup failed|i wasn't able to complete)/i;
    const cleanedHistory = trimmedHistory.filter((m: any) => {
      if (m.role !== 'assistant') return true;
      const content = String(m.content || '').trim();
      return content.length > 80 || !PLANNER_CONTAMINATION.test(content);
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanedHistory,
      { role: 'user', content: contextualUserMessage },
    ] as Array<{ role: string; content: string }>;

    const meta: Record<string, any> = {
      channel: resolvedChannel,
      traceId,
      intent: publicIntentMeta,
      routingPolicy: {
        version: routingPolicy.policyVersion,
        taskClass: routingPolicy.taskClass,
        riskLevel: routingPolicy.riskLevel,
        minimumTier: routingPolicy.minimumTier,
        selectedTier: routing.tier,
        mutationIntent: routingPolicy.mutationIntent,
      },
      contextMode: {
        followUpLike,
        compoundLike,
      },
      tooling: {
        needsTools,
        domains: domainFilter || [],
        schemaCount: schemas.length,
      },
      execution: buildPublicExecutionMeta({
        taskClass: routingPolicy.taskClass,
        needsTools,
        schemaCount: schemas.length,
        retrievalPath: authoritativeRetrievalPlan.path,
        toolPlannerInvoked: false,
        deterministicPathUsed: false,
        groundingState: null,
      }),
      feedback: {
        guidanceApplied: !!feedbackGuidance,
        signalCount: feedbackSignals.length,
      },
    };

    let llm: Awaited<ReturnType<typeof callWithFallback>>;
    let toolPlanCacheKey: string | null = null;
    let cacheUsedForToolPlan = false;
    let routerUsedForToolPlan = false;
    let deterministicMutationToolPlanUsed = false;
    const executionRequired = needsTools
      && (retrievalPlanRequiresTools || shouldTaskClassRequireTools(routingPolicy.taskClass) || messageRequiresTools);

    const deterministicCompoundCreateToolCalls = !shouldDeferDeterministicMutationFallback
      ? buildCompoundCreateToolCalls(message, allowedToolNames)
      : null;
    const deterministicPendingDealPlan = !shouldDeferDeterministicMutationFallback
      ? (
        hasPendingDealCreation
          ? buildDeterministicPendingDealPlan(message, effectivePendingDealData, allowedToolNames)
          : buildDeterministicPendingDealPlanFromHistory(message, normalizedHistory, allowedToolNames)
      )
      : null;
    const deterministicPendingSequencePlan = !shouldDeferDeterministicMutationFallback
      ? (
        hasPendingSequenceAction
          ? buildDeterministicPendingSequencePlan(message, pendingSequenceActionData, allowedToolNames)
          : null
      )
      : null;
    const deterministicPendingUpdateAccountRenamePlan = !shouldDeferDeterministicMutationFallback
      ? buildDeterministicPendingUpdateAccountRenamePlan(message, normalizedHistory, allowedToolNames)
      : null;
    const deterministicPendingUpdateDealPlan = !shouldDeferDeterministicMutationFallback
      ? (
        effectivePendingUpdateDealData
          ? buildDeterministicPendingUpdateDealPlanFromData(message, effectivePendingUpdateDealData, allowedToolNames)
          : buildDeterministicPendingUpdateDealPlan(message, normalizedHistory, allowedToolNames)
      )
      : null;
    const deterministicPendingDeleteDealPlan = !shouldDeferDeterministicMutationFallback
      ? buildDeterministicPendingDeleteDealPlan(message, normalizedHistory, allowedToolNames)
      : null;
    const deterministicPendingScheduleMeetingPlan = !shouldDeferDeterministicMutationFallback
      ? buildDeterministicPendingScheduleMeetingPlan(message, effectivePendingScheduleMeeting, allowedToolNames)
      : null;
    const hasExplicitPendingDraftEmailWorkflow = effectivePendingWorkflow?.type === 'draft_email_missing_recipient';
    const deterministicPendingDraftEmailPlan = (!shouldDeferDeterministicMutationFallback || hasExplicitPendingDraftEmailWorkflow)
      ? buildDeterministicPendingDraftEmailPlan(message, normalizedHistory, allowedToolNames)
      : null;

    const liveForcedToolPlan = !shouldBypassPipelineRetrievalForMutation && shouldUseLiveForcedRetrievalPlan({
      shouldHonorRetrievalPlan,
      retrievalPlan: authoritativeRetrievalPlan,
      deterministicPendingDealPlanAvailable: !!deterministicPendingDealPlan || !!deterministicPendingSequencePlan || !!deterministicPendingUpdateDealPlan || !!deterministicPendingDeleteDealPlan || !!deterministicPendingDraftEmailPlan || !!deterministicPendingScheduleMeetingPlan,
    });
    if (deterministicPendingScheduleMeetingPlan) {
      llm = {
        ...deterministicPendingScheduleMeetingPlan,
        routingDecision: routing,
      } as Awaited<ReturnType<typeof callWithFallback>>;
      deterministicMutationToolPlanUsed = true;
      meta.deterministicMutationPlan = 'resume_schedule_meeting';
      meta.execution = {
        ...(meta.execution || {}),
        toolPlannerInvoked: true,
        deterministicPathUsed: true,
      };
    }

    if (!deterministicMutationToolPlanUsed && deterministicCompoundCreateToolCalls) {
      llm = {
        content: '',
        provider: 'deterministic-router',
        model: 'compound-create-router',
        toolCalls: deterministicCompoundCreateToolCalls,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        routingDecision: routing,
      };
      routerUsedForToolPlan = true;
      deterministicMutationToolPlanUsed = true;
      meta.compoundCreateRouterHit = true;
      meta.deterministicMutationPlan = 'compound_create';
      meta.execution = {
        ...(meta.execution || {}),
        toolPlannerInvoked: false,
        deterministicPathUsed: true,
      };
    }

    if (!routerUsedForToolPlan && liveForcedToolPlan) {
      llm = {
        content: '',
        provider: 'intent-router',
        model: 'deterministic-router',
        toolCalls: [{
          id: 'route_0',
          type: 'function',
          function: {
            name: authoritativeRetrievalPlan.forcedTool,
            arguments: JSON.stringify(authoritativeRetrievalPlan.args || {}),
          },
        }],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        routingDecision: routing,
      };
      routerUsedForToolPlan = true;
      meta.routerHit = true;
      meta.execution = {
        ...(meta.execution || {}),
        toolPlannerInvoked: true,
      };
    }

    if (!routerUsedForToolPlan && !shouldDeferDeterministicMutationFallback) {
      if (deterministicPendingDealPlan) {
        llm = {
          ...deterministicPendingDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_create_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      if (deterministicPendingSequencePlan) {
        llm = {
          ...deterministicPendingSequencePlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_manage_sequence';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      if (deterministicPendingUpdateAccountRenamePlan) {
        llm = {
          ...deterministicPendingUpdateAccountRenamePlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_update_account_rename';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      if (deterministicPendingUpdateDealPlan) {
        llm = {
          ...deterministicPendingUpdateDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_update_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      if (deterministicPendingDeleteDealPlan) {
        llm = {
          ...deterministicPendingDeleteDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_delete_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (
      !routerUsedForToolPlan
      && !deterministicMutationToolPlanUsed
      && (!shouldDeferDeterministicMutationFallback || hasExplicitPendingDraftEmailWorkflow)
    ) {
      if (deterministicPendingDraftEmailPlan) {
        llm = {
          ...deterministicPendingDraftEmailPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_draft_email';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      if (deterministicPendingScheduleMeetingPlan) {
        llm = {
          ...deterministicPendingScheduleMeetingPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'resume_schedule_meeting';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicUpdateAccountRenamePlan = buildDeterministicUpdateAccountRenamePlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicUpdateAccountRenamePlan) {
        llm = {
          ...deterministicUpdateAccountRenamePlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'update_account_rename';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicUpdateDealPlan = buildDeterministicUpdateDealPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicUpdateDealPlan) {
        llm = {
          ...deterministicUpdateDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'update_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicCreateAccountThenDealPlan = buildDeterministicCreateAccountThenDealPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicCreateAccountThenDealPlan) {
        llm = {
          ...deterministicCreateAccountThenDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'create_account_then_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicCreateDealPlan = buildDeterministicCreateDealPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicCreateDealPlan) {
        llm = {
          ...deterministicCreateDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'create_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicScheduleMeetingPlan = buildDeterministicScheduleMeetingPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicScheduleMeetingPlan) {
        llm = {
          ...deterministicScheduleMeetingPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'schedule_meeting';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicCreateTaskPlan = buildDeterministicCreateTaskPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicCreateTaskPlan) {
        llm = {
          ...deterministicCreateTaskPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'create_task';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicCreateContactPlan = buildDeterministicCreateContactPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicCreateContactPlan) {
        llm = {
          ...deterministicCreateContactPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'create_contact';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback) {
      const deterministicDeleteDealPlan = buildDeterministicDeleteDealPlan(
        message,
        authoritativeIntent,
        allowedToolNames,
      );
      if (deterministicDeleteDealPlan) {
        llm = {
          ...deterministicDeleteDealPlan,
          routingDecision: routing,
        } as Awaited<ReturnType<typeof callWithFallback>>;
        deterministicMutationToolPlanUsed = true;
        meta.deterministicMutationPlan = 'delete_deal';
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
          deterministicPathUsed: true,
        };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !shouldDeferDeterministicMutationFallback && schemas.length > 0 && shouldAttemptToolPlanCache(message, followUpLike, compoundLike, historyText)) {
      toolPlanCacheKey = await buildToolPlanCacheKey(
        organizationId,
        resolvedChannel,
        routing.tier,
        message,
        domainFilter || [],
        pageContextKey
      );
      const cachedPlan = await loadCachedToolPlan(admin, toolPlanCacheKey);
      if (cachedPlan && cachedPlan.length > 0) {
        llm = {
          content: '',
          provider: 'cache',
          model: 'tool-plan-cache',
          toolCalls: toToolCallsFromCache(cachedPlan),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          routingDecision: routing,
        };
        cacheUsedForToolPlan = true;
        meta.toolPlanCache = { hit: true, calls: cachedPlan.length };
        meta.execution = {
          ...(meta.execution || {}),
          toolPlannerInvoked: true,
        };
      } else {
        meta.toolPlanCache = { hit: false };
      }
    }

    if (!routerUsedForToolPlan && !deterministicMutationToolPlanUsed && !cacheUsedForToolPlan) {
      try {
        llm = await callWithFallback({
          messages,
          tier: routing.tier,
          temperature: routing.temperature,
          maxTokens: QUALITY_MODE ? Math.min(2400, Math.max(routing.maxTokens, 900)) : routing.maxTokens,
          tools: schemas.length > 0 ? schemas : undefined,
          routingDecision: routing,
        });
      } catch (primaryErr: any) {
        if (!isRetryableAiError(primaryErr)) throw primaryErr;

        // Recovery mode: smaller context + lower generation budget to avoid hard failures.
        const compactHistory = trimHistory(normalizedHistory, 8, 900);
        const compactUserMessage = augmentFollowUpMessage(message, compactHistory);
        const recoveryTier: 'lite' | 'standard' = routing.tier === 'pro' ? 'standard' : 'lite';
        const recoveryMessages = [
          { role: 'system', content: `${systemPrompt}\n\nRecovery mode: prioritize tool calls and concise completion. Do not overthink.` },
          ...compactHistory,
          { role: 'user', content: compactUserMessage },
        ] as Array<{ role: string; content: string }>;

        llm = await callWithFallback({
          messages: recoveryMessages,
          tier: recoveryTier,
          temperature: 0.15,
          maxTokens: Math.min(1200, Math.max(700, Math.floor(routing.maxTokens * 0.65))),
          tools: schemas.length > 0 ? schemas : undefined,
          routingDecision: { ...routing, reason: `${routing.reason}; recovery_retry=true; recovery_tier=${recoveryTier}` },
        });
        meta.recoveryMode = true;
      }
      meta.execution = {
        ...(meta.execution || {}),
        toolPlannerInvoked: true,
      };

      if (toolPlanCacheKey && llm.toolCalls && llm.toolCalls.length > 0) {
        const calls = extractCacheableToolCalls(llm.toolCalls);
        if (calls.length > 0) {
          await storeToolPlanCache(admin, toolPlanCacheKey, calls);
          meta.toolPlanCache = { ...(meta.toolPlanCache || {}), stored: true, calls: calls.length };
        }
      }
    }

    // If model answered with plain text on a data/action query, force a tool-planning pass.
    if (
      FORCE_TOOL_PLANNER
      && (!llm.toolCalls || llm.toolCalls.length === 0)
      && schemas.length > 0
      && (dataOrActionRequest || executionRequired)
    ) {
      try {
        const planner = await callWithFallback({
          messages: [
            { role: 'system', content: `${systemPrompt}\n\nThis user request needs CRM data/actions. Return tool calls for every sub-request before final answer. For compound asks, call multiple tools in the same turn.` },
            ...trimmedHistory,
            { role: 'user', content: contextualUserMessage },
          ] as Array<{ role: string; content: string }>,
          tier: routing.tier === 'lite' ? 'standard' : routing.tier,
          temperature: 0.05,
          maxTokens: 800,
          tools: schemas,
          tool_choice: 'auto',
          routingDecision: { ...routing, reason: `${routing.reason}; forced_tool_plan=true` },
        });
        if (planner.toolCalls && planner.toolCalls.length > 0) {
          llm = planner;
          meta.forcedToolPlanning = true;
          meta.execution = {
            ...(meta.execution || {}),
            toolPlannerInvoked: true,
          };
        }
      } catch (planErr) {
        console.warn('[unified-chat] forced planner pass failed:', (planErr as any)?.message || planErr);
      }
    }

    console.log(`[unified-chat] primary provider=${llm.provider} model=${llm.model} tier=${routing.tier}`);

    const plannerResponseText = String(llm.content || '');
    const noToolPlanAvailable = (!llm.toolCalls || llm.toolCalls.length === 0);
    const plannerTextSuppressed = noToolPlanAvailable
      && (dataOrActionRequest || executionRequired || messageRequiresTools)
      && (
        looksLikePlanningPlaceholderText(plannerResponseText)
        || looksLikeTemplatePlaceholderText(plannerResponseText)
      );
    let response = llm.toolCalls && llm.toolCalls.length > 0
      ? ''
      : (executionRequired ? '' : plannerResponseText);
    if (
      plannerTextSuppressed
      || (
        noToolPlanAvailable
        && (dataOrActionRequest || executionRequired || messageRequiresTools)
        && /^\s*crm\b/i.test(response)
      )
    ) {
      response = '';
      meta.internalPlannerTextSuppressed = true;
    }
    if ((executionRequired || messageRequiresTools) && noToolPlanAvailable) {
      response = '';
      meta.executionBridgeBlocked = true;
      meta.internalPlannerTextSuppressed = true;
    }
    const crmOperations: any[] = [];
    let action: any;
    let synthesisUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
    let synthesisProvider: string | null = null;
    let synthesisModel: string | null = null;
    let mutationApplied = false;

    if (llm.toolCalls && llm.toolCalls.length > 0) {
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      // Partition tool calls: run read-only in parallel, mutations sequentially
      const toolCallCtx = {
        supabase: admin,
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        sessionTable: resolvedChannel === 'web' ? 'chat_sessions' : 'messaging_sessions',
        entityContext: resolvedEntityContext,
        activeContext: resolvedActiveContext,
        traceId,
        authHeader: internalCall ? undefined : authHeader,
      };

      const validCalls = llm.toolCalls.slice(0, 8).filter((tc: any) => {
        const toolName = tc.function?.name;
        if (!toolName) return false;
        if (!allowedToolNames.has(toolName)) {
          console.warn(`[unified-chat] Ignoring non-allowed tool call: ${toolName}`);
          if (!Array.isArray(meta.ignoredToolCalls)) meta.ignoredToolCalls = [];
          if (meta.ignoredToolCalls.length < 8) meta.ignoredToolCalls.push(toolName);
          return false;
        }
        return true;
      });

      const readOnlyCalls = validCalls.filter((tc: any) => !MUTATION_TOOLS.has(tc.function?.name));
      const mutationCalls = validCalls.filter((tc: any) => MUTATION_TOOLS.has(tc.function?.name));

      async function executeSingleTool(tc: any, callIndex = 0) {
        const toolName = tc.function?.name;
        const parsedArgs = safeJsonParse(tc.function?.arguments || '{}') || {};
        const args = toolName === 'schedule_meeting'
          ? repairScheduleMeetingArgsFromMessage(parsedArgs, message)
          : parsedArgs;
        const isMutation = MUTATION_TOOLS.has(toolName);
        const permissionError = getToolPermissionError(toolName, authorizedOrg?.role);
        if (permissionError) {
          const result = {
            error: true,
            permissionDenied: true,
            message: permissionError,
          };
          crmOperations.push({ tool: toolName, args, result });
          return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
        }
        const toolIdempotencyKey = isMutation && requestIdempotencyKey
          ? `${requestIdempotencyKey}:${toolName}:${callIndex}`
          : '';
        try {
          if (toolIdempotencyKey) {
            const requestHash = await stableRequestHash({ toolName, args });
            const claim = await claimIdempotencyKey(admin, {
              organizationId,
              userId,
              scope: 'unified-chat-tool',
              key: toolIdempotencyKey,
              requestHash,
              traceId,
            });

            if (claim.state === 'completed') {
              const result = claim.responsePayload;
              crmOperations.push({ tool: toolName, args, result, idempotency: 'replayed' });
              return { role: 'tool', tool_call_id: tc.id, content: serializeToolResultForPrompt(result) };
            }

            if (claim.state === 'failed') {
              const result = claim.responsePayload || {
                error: true,
                message: claim.errorMessage || 'This operation previously failed. I did not run it again.',
              };
              crmOperations.push({ tool: toolName, args, result, idempotency: 'failed_replayed' });
              return { role: 'tool', tool_call_id: tc.id, content: serializeToolResultForPrompt(result) };
            }

            if (claim.state === 'in_progress') {
              const result = {
                error: true,
                message: 'This operation is already processing. I did not run it again.',
              };
              crmOperations.push({ tool: toolName, args, result, idempotency: 'in_progress' });
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
            }

            if (claim.state === 'conflict') {
              const result = {
                error: true,
                message: claim.errorMessage || 'This idempotency key was already used for another operation.',
              };
              crmOperations.push({ tool: toolName, args, result, idempotency: 'conflict' });
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
            }
          }

          const result = await executeRegistryTool(toolName, args, toolCallCtx);
          crmOperations.push({ tool: toolName, args, result });
          if (MUTATION_TOOLS.has(toolName) && !result?.error) mutationApplied = true;
          if (result?.action) action = result.action;
          if (toolName === 'update_deal') {
            if (result?._needsConfirmation && result?._confirmationType === 'update_deal_conflict') {
              await storePendingDealUpdate(admin, validation.sanitizedData.sessionId, sessionTable, result.pending_update || result);
            } else if (!result?.error && !result?._needsConfirmation) {
              await clearPendingDealUpdate(admin, validation.sanitizedData.sessionId, sessionTable);
            }
          }
          if (result?.schedulingSlots) {
            meta.schedulingSlots = result.schedulingSlots;
          }
          if (toolName === 'schedule_meeting' && result?._needsConfirmation && result?._confirmationType === 'schedule_meeting') {
            const preview = result.preview || {};
            meta.schedulePreview = {
              id: crypto.randomUUID(),
              contact: preview.contact || null,
              meeting_type: preview.meeting_type || args.meeting_type || 'Meeting',
              suggested_time: preview.suggested_time || null,
              suggested_start_iso: preview.suggested_start_iso || null,
              duration_minutes: preview.duration_minutes || null,
              available_slots: Array.isArray(preview.available_slots) ? preview.available_slots : [],
              email_draft: preview.email_draft || null,
            };
          }
          if (result?.isDraft) {
            meta.emailDraft = {
              id: crypto.randomUUID(),
              to_email: result.recipientEmail || result.recipient_email || '',
              to_name: result.recipientName || result.recipient_name || '',
              subject: result.subject || '',
              body: result.message || result.body || '',
              tone: result.tone || result.emailType || result.email_type || 'professional',
              deal_context: result.dealContext || result.deal_context || undefined,
            };
          }
          if (result?.needsScopeUpgrade) {
            meta.needsScopeUpgrade = {
              scope: result.requiredScope || 'https://www.googleapis.com/auth/gmail.send',
              message: result.message || 'Gmail send permission required.',
            };
          }
          if (toolIdempotencyKey) {
            await completeIdempotencyKey(admin, {
              organizationId,
              scope: 'unified-chat-tool',
              key: toolIdempotencyKey,
              responsePayload: result,
            });
          }
          if ((toolName === 'search_crm') && Array.isArray(result?.results)) {
            const dealLinks = result.results
              .filter((r: any) => r?.id && r?.name && !isClosed(r?.stage))
              .slice(0, 8)
              .map((r: any) => ({ id: r.id, name: r.name, stage: r.stage || null, amount: typeof r.amount === 'number' ? r.amount : null }));
            if (dealLinks.length > 0) meta.dealLinks = dealLinks;
          }
          return { role: 'tool', tool_call_id: tc.id, content: serializeToolResultForPrompt(result) };
        } catch (toolErr: any) {
          const errMsg = mapToolErrorToUserMessage(toolName, toolErr);
          console.warn(`[unified-chat] Tool error (${toolName}):`, toolErr?.message || toolErr);
          const failedResult = { error: true, message: errMsg };
          if (toolIdempotencyKey) {
            await failIdempotencyKey(admin, {
              organizationId,
              scope: 'unified-chat-tool',
              key: toolIdempotencyKey,
              errorMessage: errMsg,
              responsePayload: failedResult,
            });
          }
          crmOperations.push({ tool: toolName, args, result: failedResult });
          return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: true, message: errMsg }) };
        }
      }

      // Run read-only tools in parallel
      if (readOnlyCalls.length > 0) {
        const readResults = await Promise.all(readOnlyCalls.map((tc: any, index: number) => executeSingleTool(tc, index)));
        toolResults.push(...readResults);

        const pipelineContextOp = crmOperations.find((op: any) => op?.tool === 'get_pipeline_context' && !op?.result?.error);
        const alreadyHasCreateTask = mutationCalls.some((tc: any) => tc.function?.name === 'create_task')
          || crmOperations.some((op: any) => op?.tool === 'create_task');
        const pipelineReviewTaskArgs = !alreadyHasCreateTask && pipelineContextOp && allowedToolNames.has('create_task')
          ? buildPipelineReviewTaskArgs(pipelineContextOp.result, message)
          : null;
        if (pipelineReviewTaskArgs) {
          const taskResult = await executeSingleTool({
            id: 'pipeline_review_followup_task_0',
            type: 'function',
            function: {
              name: 'create_task',
              arguments: JSON.stringify(pipelineReviewTaskArgs),
            },
          }, 900);
          toolResults.push(taskResult);
          meta.deterministicMutationPlan = meta.deterministicMutationPlan || 'pipeline_review_followup_task';
          meta.execution = {
            ...(meta.execution || {}),
            deterministicPathUsed: true,
          };
        }
      }

      // Run mutations sequentially (order matters for dependent creates/updates)
      for (let index = 0; index < mutationCalls.length; index += 1) {
        const tc = mutationCalls[index];
        const result = await executeSingleTool(tc, index);
        toolResults.push(result);
      }

      if (toolResults.length > 0) {
        const synthEnabled = shouldRunSynthesis(message, routing.tier, toolResults.length);
        const successfulDraftEmailOp = crmOperations.find(({ tool, result }) => (
          tool === 'draft_email' && result?.isDraft && !result?.error
        ));
        const pendingScheduleMeetingOp = crmOperations.find(({ tool, result }) => (
          tool === 'schedule_meeting'
          && (
            (result?._needsConfirmation && result?._confirmationType === 'schedule_meeting')
            || (result?._needsInput && result?.clarification_type === 'missing_contact_email')
            || (result?._needsInput && result?.clarification_type === 'missing_contact_details')
          )
        ));
        const completedScheduleMeetingOp = crmOperations.find(({ tool, result }) => (
          tool === 'schedule_meeting'
          && !result?._needsConfirmation
          && !result?.error
          && result?.success !== false
        ));
        const pendingDraftEmailOp = crmOperations.find(({ tool, result }) => (
          tool === 'draft_email'
          && result?._needsInput
          && result?.clarification_type === 'missing_recipient_email'
        ));
        if (successfulDraftEmailOp) {
          await clearPendingDraftEmail(admin, validation.sanitizedData.sessionId, sessionTable);
        } else if (pendingDraftEmailOp) {
          await storePendingDraftEmail(
            admin,
            validation.sanitizedData.sessionId,
            sessionTable,
            message,
            pendingDraftEmailOp.result,
          );
        }
        if (pendingScheduleMeetingOp) {
          await storePendingScheduleMeeting(
            admin,
            validation.sanitizedData.sessionId,
            sessionTable,
            pendingScheduleMeetingOp.args || {},
            pendingScheduleMeetingOp.result,
          );
        } else if (completedScheduleMeetingOp) {
          await clearPendingScheduleMeeting(admin, validation.sanitizedData.sessionId, sessionTable);
        }
        const hasIncompleteToolResult = crmOperations.some(({ result }) => (
          result?._needsInput
          || result?._needsConfirmation
          || result?._needsLossReason
          || result?.success === false
        ));
        if (meta.compoundCreateRouterHit) {
          response = buildCompoundCreateSummary(crmOperations as any, message);
        } else if (successfulDraftEmailOp) {
          const draftResult = successfulDraftEmailOp.result || {};
          const recipient = draftResult.recipientName || draftResult.recipient_name || draftResult.recipientEmail || draftResult.recipient_email || 'the selected recipient';
          const dealLabel = draftResult.dealContext?.name || draftResult.deal_name || draftResult.account_name || 'this opportunity';
          response = `Draft prepared for ${recipient} regarding ${dealLabel}. Review it below before sending.`;
        } else if (
          pendingScheduleMeetingOp
          && pendingScheduleMeetingOp.result?._needsConfirmation
          && pendingScheduleMeetingOp.result?._confirmationType === 'schedule_meeting'
        ) {
          const preview = pendingScheduleMeetingOp.result?.preview || {};
          const contactName = preview.contact?.name || 'the selected contact';
          response = `Review this scheduling plan for ${contactName}. I found availability and prepared the email, but I will not send anything until you confirm.`;
        } else if (hasIncompleteToolResult) {
          response = buildToolOnlyResponse(crmOperations as any, message);
        } else if (!synthEnabled) {
          response = buildToolOnlyResponse(crmOperations as any, message);
        } else {
          try {
            const rawSynthesisHistory = trimHistory(trimmedHistory, 6, 900);
            // Filter out contaminating assistant messages (clarifications, failures, generic "Done.")
            // that can cause the synthesis model to mimic failure patterns instead of using tool results
            const CONTAMINATION_PATTERNS = /^(done\.?|what exactly should i update|which deal|which record|i searched your crm but|i could not retrieve|results don't match|data lookup failed)/i;
            const synthesisHistory = rawSynthesisHistory.filter((m: any) => {
              if (m.role !== 'assistant') return true;
              const content = String(m.content || '').trim();
              return content.length > 50 || !CONTAMINATION_PATTERNS.test(content);
            });
            const synth = await callWithFallback({
              messages: [
                {
                  role: 'system', content: (() => {
                    const toolNames = new Set(crmOperations.map(op => op.tool));
                    if (toolNames.has('draft_email')) {
                      return 'Using the CRM context from tool results, draft a personalized email for the user to review. Include a subject line. NEVER claim the email was sent. Do not invent data not in the tool results.';
                    }
                    return 'Answer using ONLY the tool results below. Do not invent data. IGNORE any prior assistant messages in the conversation — they may contain errors or clarifications that are no longer relevant. Focus EXCLUSIVELY on the tool result for THIS request.\n\nRules:\n- If the tool result contains success:true, report the success and summarize what changed.\n- If the tool result contains records, list and summarize them with key details.\n- Never claim "no results", "no matching records", "could not retrieve", or "data lookup failed" when tool results contain data.\n- Be concise.';
                  })()
                },
                ...synthesisHistory,
                { role: 'user', content: contextualUserMessage },
                { role: 'user', content: buildSynthesisToolResultsMessage(crmOperations) },
              ] as any,
              tier: routing.tier === 'lite' ? 'standard' : routing.tier,
              temperature: QUALITY_MODE ? 0.15 : 0.2,
              maxTokens: QUALITY_MODE ? Math.min(1800, Math.max(850, routing.maxTokens)) : Math.min(1100, Math.max(512, routing.maxTokens)),
            });
            response = synth.content || response;
            synthesisUsage = synth.usage || null;
            synthesisProvider = synth.provider || null;
            synthesisModel = synth.model || null;
            console.log(`[unified-chat] synthesis provider=${synthesisProvider} model=${synthesisModel}`);
          } catch (synthErr) {
            console.warn('[unified-chat] synthesis failed:', (synthErr as any)?.message || synthErr);
            if (!response) response = buildToolOnlyResponse(crmOperations as any, message);
          }
        }
      }
    }

      if (mutationApplied) {
        await invalidateResponseCacheForOrganization(admin, organizationId).catch(() => { });
        meta.responseCacheInvalidated = true;
      }

      const finalCitations = collectCitationsFromOperations(crmOperations);
      const {
        verification,
        factualClaimsDetected,
      } = evaluateHybridVerification({
        message,
        response,
        crmOperations,
        citations: finalCitations,
        routingTaskClass: routingPolicy.taskClass,
        dataOrActionRequest,
      });

      const groundingState = classifyGroundingState({
        verification,
        crmOperations,
        citations: finalCitations,
        response,
        clarificationNeeded: false,
      });
      const forcedGroundingState = shouldSuppressUngroundedCrmText({
        message,
        historyText,
        responseText: response,
        taskClass: routingPolicy.taskClass,
        retrievalPath: authoritativeRetrievalPlan.path,
        crmOperationsCount: crmOperations.length,
        clarificationNeeded: false,
      })
        ? 'failure'
        : groundingState;
      const shouldOverrideForGrounding = (
        ['crm_read', 'analytics', 'scoutpad'].includes(routingPolicy.taskClass)
        || messageRequiresTools
      )
        && (forcedGroundingState === 'failure' || forcedGroundingState === 'no_results')
        && (
          dataOrActionRequest
          || detectFactualClaims({ message, response })
          || crmOperations.length === 0
          || !!meta.internalPlannerTextSuppressed
          || looksLikeTemplatePlaceholderText(response)
          || looksLikePlanningPlaceholderText(response)
          || !String(response || '').trim()
        );
      if (shouldOverrideForGrounding) {
        response = buildGroundedFailureMessage(forcedGroundingState, {
          toolErrors: crmOperations.filter((op) => op.result?.error).map((op) => op.tool),
          toolsRan: crmOperations.map((op) => op.tool),
        });
      }

      response = applyVerificationPolicyToResponse(response, verification);
      const postExecutionQueryAssist = evaluateQueryAssist({
        message,
        intent: authoritativeIntent,
        retrievalPlan: authoritativeRetrievalPlan,
        clarification,
        groundingState: forcedGroundingState,
        crmOperations,
        response,
        historyEntries: Array.isArray(conversationHistory) ? conversationHistory : [],
      });
      const postExecutionQueryAssistSuggestions = postExecutionQueryAssist.enabled
        ? buildQueryAssistSuggestions({
          reason: postExecutionQueryAssist.reason,
          intent: authoritativeIntent,
          context: queryAssistContext,
          message,
        })
        : [];
      const publicPostExecutionQueryAssistMeta = buildPublicQueryAssistMeta({
        rolloutMode: rollout.mode,
        queryAssist: postExecutionQueryAssist,
        suggestions: postExecutionQueryAssistSuggestions,
      });
      const effectiveVerification = (forcedGroundingState === 'failure' || forcedGroundingState === 'no_results')
        ? {
          ...verification,
          is_true: false,
          blocking_failure: true,
          source_status: 'source_gap',
        }
        : verification;
      const responseCitations = forcedGroundingState === 'verified' || forcedGroundingState === 'advisory_only'
        ? finalCitations
        : [];
      const publicVerification = {
        ...effectiveVerification,
        citation_count: responseCitations.length,
      };
      const pendingWorkflowOnly = hasOnlyPendingWorkflowOperations(crmOperations);

      const processingTime = Date.now() - started;
      const recordsFound = crmOperations.reduce((sum, op) =>
        sum + (op.result?.count || op.result?.totalDeals || op.result?.results?.length || (op.result?.id ? 1 : 0)), 0);
      const tokenIn = (llm.usage?.promptTokens || 0) + (synthesisUsage?.promptTokens || 0);
      const tokenOut = (llm.usage?.completionTokens || 0) + (synthesisUsage?.completionTokens || 0);
      const tokenTotal = (llm.usage?.totalTokens || 0) + (synthesisUsage?.totalTokens || 0);
      const synthesisTriggered = !!synthesisUsage;
      const runtimeStatus: 'success' | 'error' | 'blocked' = effectiveVerification.blocking_failure
        ? 'blocked'
        : (crmOperations.some((op) => op.result?.error) ? 'error' : 'success');
      const tokenUsageColumns = buildIndustryTokenUsageColumns({
        intentModel: llm.model,
        intentUsage: llm.usage || null,
        synthesisModel,
        synthesisUsage,
        cacheHit: cacheUsedForToolPlan,
      });
      // Build entity context from CRM operations for pronoun resolution
      const responseEntityContext: Record<string, any> = {
        referencedEntities: { ...resolvedEntityContext?.referencedEntities },
        primaryEntity: resolvedEntityContext?.primaryEntity || undefined,
      };

      // Helper to add an entity to the context
      const addEntityToContext = (type: string, id: string, name: string) => {
        const normalizedType = type === 'deal' ? 'deals' : type === 'contact' ? 'contacts' : type === 'account' ? 'accounts' : type + 's';
        if (!responseEntityContext.referencedEntities[normalizedType]) {
          responseEntityContext.referencedEntities[normalizedType] = [];
        }
        const existing = responseEntityContext.referencedEntities[normalizedType];
        if (!existing.some((e: any) => e.id === id)) {
          existing.unshift({ id, name, type, referencedAt: new Date().toISOString() });
          if (existing.length > 5) existing.pop();
        }
        // Set as primary entity (last referenced wins)
        responseEntityContext.primaryEntity = { type, id, name, referencedAt: new Date().toISOString() };
      };

      // Extract entities from tool results and update context
      for (const op of crmOperations) {
        const result = op.result;
        if (!result) continue;

        // Handle search_crm results (array of results with entity_type)
        if (result.results && Array.isArray(result.results) && result.entity_type) {
          const singularType = result.entity_type.replace(/s$/, '');
          for (const row of result.results.slice(0, 3)) {
            const rowId = row.id;
            const rowName = row.name || row.full_name || row.deal_name || row.title;
            if (rowId && rowName) {
              addEntityToContext(singularType, rowId, rowName);
            }
          }
          continue;
        }

        // Handle context RPC results with nested deal/account/contact objects
        if (result.__trusted_context || result.deal || result.account || result.contact) {
          if (result.deal?.id && result.deal?.name) {
            addEntityToContext('deal', result.deal.id, result.deal.name);
          }
          if (result.account?.id && result.account?.name) {
            addEntityToContext('account', result.account.id, result.account.name);
          }
          if (result.contact?.id && (result.contact?.name || result.contact?.full_name)) {
            addEntityToContext('contact', result.contact.id, result.contact.name || result.contact.full_name);
          }
          // Also check contacts array (deal context includes multiple)
          if (Array.isArray(result.contacts)) {
            for (const c of result.contacts.slice(0, 3)) {
              if (c.id && (c.name || c.full_name)) {
                addEntityToContext('contact', c.id, c.name || c.full_name);
              }
            }
          }
          continue;
        }

        // Handle single-entity results (create, update)
        const entityType = result.entity || op.tool?.replace(/^(get_|create_|update_|search_|analyze_)/, '').replace(/_context$/, '');
        const entityId = result.id || result.deal_id || result.contact_id || result.account_id;
        const entityName = result.name || result.full_name || result.deal_name;
        if (entityType && entityId && entityName) {
          addEntityToContext(entityType, entityId, entityName);
        }
      }

      // Post-synthesis hallucination guard: verify entities in response against tool results
      const hallucinationCheck = verifyResponseAgainstToolResults(response || '', crmOperations, responseCitations.length);
      if (hallucinationCheck.isHallucinated && hallucinationCheck.replacementResponse) {
        console.log(`[unified-chat] Hallucination detected (confidence=${hallucinationCheck.confidence.toFixed(2)}). Replacing response. Unverified: ${hallucinationCheck.unverifiedEntities.join(', ')}`);
        response = hallucinationCheck.replacementResponse;
      }

      // Choose an appropriate fallback when response is empty
      const fallbackResponse = (() => {
        if (response) return response;
        if (crmOperations.length > 0 && crmOperations.some((op: any) => op.result?.success)) return 'I completed the CRM action and logged it.';
        if (meta.executionBridgeBlocked) return 'I wasn\'t able to complete that action. Could you try rephrasing your request?';
        return 'I finished the request.';
      })();

      const responsePayload = {
        response: fallbackResponse,
        crmOperations,
        citations: responseCitations,
        verification: publicVerification,
        meta: {
          ...meta,
          entityContext: responseEntityContext,
          intent: publicIntentMeta,
          queryAssist: publicPostExecutionQueryAssistMeta,
          execution: buildPublicExecutionMeta({
            taskClass: routingPolicy.taskClass,
            needsTools,
            schemaCount: schemas.length,
            retrievalPath: authoritativeRetrievalPlan.path,
            toolPlannerInvoked: Boolean(meta.execution?.toolPlannerInvoked),
            deterministicPathUsed: Boolean(meta.execution?.deterministicPathUsed || routerUsedForToolPlan || deterministicMutationToolPlanUsed),
            groundingState: forcedGroundingState,
          }),
          strictVerification: effectiveVerification.policy === 'strict',
          verificationPolicy: effectiveVerification.policy,
          groundingState: forcedGroundingState,
          verification: publicVerification,
          responseCache: {
            hit: false,
            type: null,
          },
          processingTimeMs: processingTime,
          aiRuntime: {
            mode: 'llm',
            provider: llm.provider,
            model: llm.model,
            synthesisProvider,
            synthesisModel,
            tokenUsageColumns,
          },
        },
        action,
        provenance: {
          source: pendingWorkflowOnly
            ? 'clarification_needed'
            : (crmOperations.length > 0 ? 'database' : 'llm_general'),
          recordsFound,
          searchPerformed: crmOperations.some((op) => op.tool === 'search_crm'),
          confidence: crmOperations.some((op) => op.result?.error) ? 'medium' : 'high',
          processingTimeMs: processingTime,
          analysisMode: 'general',
          isolationEnforced: false,
          modelRouting: {
            intentTier: routing.tier,
            reason: routing.reason,
            confidence: routing.confidence,
            taskClass: routingPolicy.taskClass,
            riskLevel: routingPolicy.riskLevel,
            minimumTier: routingPolicy.minimumTier,
            selectedTier: routing.tier,
            mutationIntent: routingPolicy.mutationIntent,
            policyVersion: routingPolicy.policyVersion,
          },
          tokenUsage: {
            intent: {
              prompt: llm.usage?.promptTokens || 0,
              completion: llm.usage?.completionTokens || 0,
            },
            synthesis: synthesisUsage ? {
              prompt: synthesisUsage.promptTokens || 0,
              completion: synthesisUsage.completionTokens || 0,
              total: synthesisUsage.totalTokens || 0,
            } : null,
            total: tokenTotal,
            industry_standard_rows: tokenUsageColumns,
          },
        },
      };

      const eligibleForResponseCache = (
        !!responseCacheKey
        && shouldTryResponseCache
        && verification.policy === 'strict'
        && verification.is_true
        && finalCitations.length > 0
        && isReadOnlyToolSet(crmOperations)
        && !action
      );
      if (eligibleForResponseCache && responseCacheKey) {
        await storeResponseCache(admin, {
          cacheKey: responseCacheKey,
          organizationId,
          userId,
          message,
          payload: responsePayload,
          toolNames: Array.from(new Set(crmOperations.map((op) => String(op.tool || '')).filter(Boolean))),
          traceId,
        }).catch(() => { });
        responsePayload.meta = {
          ...responsePayload.meta,
          responseCache: {
            hit: false,
            stored: true,
            type: 'read_only_response',
          },
        };
      }

      await logRuntimeDecisionTrace(admin, {
        organizationId,
        userId,
        sessionId: validation.sanitizedData.sessionId,
        channel: resolvedChannel,
        routingTier: routing.tier,
        domains: domainFilter || [],
        toolCount: crmOperations.length,
        synthesisTriggered,
        tokenIn,
        tokenOut,
        totalTokens: tokenTotal,
        cacheHit: cacheUsedForToolPlan,
        cacheType: cacheUsedForToolPlan ? 'tool_plan' : 'none',
        latencyMs: processingTime,
        status: runtimeStatus,
        summary: response,
        aiProvider: llm.provider,
        aiModel: synthesisModel || llm.model,
        tokenUsageColumns,
        taskClass: routingPolicy.taskClass,
        riskLevel: routingPolicy.riskLevel,
        minimumTier: routingPolicy.minimumTier,
        selectedTier: routing.tier,
        mutationIntent: routingPolicy.mutationIntent,
        routingPolicyVersion: routingPolicy.policyVersion,
        verificationPolicy: verification.policy,
        blockingFailure: verification.blocking_failure,
        mixedIntent: verification.mixed_intent,
        traceId,
        factualClaimsDetected,
        legacyWouldBlock: verification.legacy_would_block,
        extractedIntent: authoritativeIntent?.intent || null,
        queryAssistEnabled: postExecutionQueryAssist.enabled,
        queryAssistReason: postExecutionQueryAssist.reason,
        queryAssistDisplayMode: postExecutionQueryAssist.displayMode,
        queryAssistSuggestionCount: postExecutionQueryAssistSuggestions.length,
        ...buildIntentTraceFields({
          mode: rollout.mode,
          extractorEnabled: rollout.enabled,
          productionIntent: heuristicIntent,
          comparisonIntent: telemetryShadowIntent,
          comparisonPlan: telemetryShadowPlan,
          comparisonClarification: telemetryShadowClarification,
          groundingState,
        }),
      }).catch(() => { });

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error: any) {
      console.error('[unified-chat] Error:', error);
      const msg = error?.message || String(error);
      const retryable = isRetryableAiError(error);
      return new Response(JSON.stringify({
        response: retryable
          ? 'I hit a temporary model provider issue (latency/compatibility). Please retry your request now and I will continue with the same context.'
          : buildSafeErrorResponseMessage(msg),
        error: msg,
        traceId,
        citations: [],
        verification: {
          mode: 'strict_db_citations',
          requires_verification: true,
          is_true: false,
          failed_checks: ['UNIFIED_CHAT_EXCEPTION'],
          citation_count: 0,
          operation_count: 0,
          verified_at: new Date().toISOString(),
          policy: 'strict',
          blocking_failure: true,
          mixed_intent: false,
          source_status: 'source_gap',
          user_summary: 'The assistant encountered an internal processing error before evidence could be verified.',
          legacy_would_block: true,
        },
        meta: { traceId },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  };

  serve(handler);
