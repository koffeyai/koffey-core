import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateRequest, AuthError, getServiceRoleClient } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

type FeedbackRating = 'up' | 'down' | null;

function normalizeFeedbackRating(value: unknown): FeedbackRating {
  return value === 'up' || value === 'down' ? value : null;
}

function sanitizeFeedbackComment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isUuidLike(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function normalizeLearningKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function computeAmountBand(amount: number | null): string {
  if (!Number.isFinite(Number(amount))) return 'unknown';
  const v = Number(amount);
  if (v < 10000) return 'small';
  if (v < 50000) return 'mid';
  if (v < 200000) return 'large';
  return 'enterprise';
}

function inferFeedbackSignalKeys(
  rating: FeedbackRating,
  comment: string | null
): { featureKey: string | null; objectionKey: string | null } {
  const text = String(comment || '').trim().toLowerCase();
  if (!text) {
    return {
      featureKey: rating === 'up' ? 'assistant_response_quality' : null,
      objectionKey: rating === 'down' ? 'assistant_response_quality' : null,
    };
  }

  const featureMatch = text.match(/\b(feature|strength|good|helpful|accurate|clear|concise)\b/);
  const objectionMatch = text.match(/\b(hallucinat|wrong|inaccurate|missing|unclear|verbose|irrelevant|bad)\b/);

  return {
    featureKey: (rating === 'up' || featureMatch) ? normalizeLearningKey(text.slice(0, 80)) : null,
    objectionKey: (rating === 'down' || objectionMatch) ? normalizeLearningKey(text.slice(0, 80)) : null,
  };
}

function extractEntityIdsFromCitations(metadata: Record<string, unknown>): {
  dealId: string | null;
  accountId: string | null;
  contactId: string | null;
} {
  const citations = Array.isArray(metadata.citations) ? metadata.citations : [];
  let dealId: string | null = null;
  let accountId: string | null = null;
  let contactId: string | null = null;

  for (const entry of citations) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const citation = entry as Record<string, unknown>;
    const table = String(citation.table || '').toLowerCase();
    const rowId = String(citation.rowId || '').trim();
    if (!rowId || !isUuidLike(rowId)) continue;
    if (!dealId && table === 'deals') dealId = rowId;
    if (!accountId && table === 'accounts') accountId = rowId;
    if (!contactId && table === 'contacts') contactId = rowId;
  }

  return { dealId, accountId, contactId };
}

function sanitizeTokenUsageRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const toNumberOrNull = (v: unknown): number | null => {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const model = typeof row.model === 'string' ? row.model.slice(0, 80) : 'unknown';
  const unit = typeof row.unit === 'string' ? row.unit.slice(0, 40) : '1M tokens';

  return {
    source: row.source === 'intent' || row.source === 'synthesis' ? row.source : 'total',
    model,
    unit,
    input_price_cache_hit: toNumberOrNull(row.input_price_cache_hit),
    input_price_cache_miss: toNumberOrNull(row.input_price_cache_miss),
    output_price: toNumberOrNull(row.output_price),
    context_window: toNumberOrNull(row.context_window),
    input_tokens: toNumberOrNull(row.input_tokens) ?? 0,
    output_tokens: toNumberOrNull(row.output_tokens) ?? 0,
    total_tokens: toNumberOrNull(row.total_tokens) ?? 0,
    cache_hit: row.cache_hit === true,
    estimated_input_cost_cache_hit: toNumberOrNull(row.estimated_input_cost_cache_hit),
    estimated_input_cost_cache_miss: toNumberOrNull(row.estimated_input_cost_cache_miss),
    estimated_output_cost: toNumberOrNull(row.estimated_output_cost),
    estimated_total_cost_cache_hit: toNumberOrNull(row.estimated_total_cost_cache_hit),
    estimated_total_cost_cache_miss: toNumberOrNull(row.estimated_total_cost_cache_miss),
    currency: typeof row.currency === 'string' ? row.currency.slice(0, 8) : 'USD',
  };
}

function sanitizeTokenUsageRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((row) => sanitizeTokenUsageRow(row))
    .filter(Boolean) as Record<string, unknown>[];
}

function sanitizeAiMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;

  const out: Record<string, unknown> = {};

  if (raw.verification && typeof raw.verification === 'object' && !Array.isArray(raw.verification)) {
    const verification = raw.verification as Record<string, unknown>;
    out.verification = {
      mode: typeof verification.mode === 'string' ? verification.mode.slice(0, 64) : null,
      is_true: verification.is_true === true,
      requires_verification: verification.requires_verification === true,
      failed_checks: Array.isArray(verification.failed_checks)
        ? verification.failed_checks.slice(0, 10).map((item) => String(item).slice(0, 120))
        : [],
      citation_count: Number.isFinite(Number(verification.citation_count)) ? Number(verification.citation_count) : 0,
      operation_count: Number.isFinite(Number(verification.operation_count)) ? Number(verification.operation_count) : 0,
      verified_at: typeof verification.verified_at === 'string' ? verification.verified_at : new Date().toISOString(),
      policy: verification.policy === 'strict' || verification.policy === 'advisory' || verification.policy === 'none'
        ? verification.policy
        : null,
      blocking_failure: verification.blocking_failure === true,
      mixed_intent: verification.mixed_intent === true,
      source_status: verification.source_status === 'source_backed'
        || verification.source_status === 'source_gap'
        || verification.source_status === 'not_applicable'
        ? verification.source_status
        : null,
      user_summary: typeof verification.user_summary === 'string'
        ? verification.user_summary.slice(0, 400)
        : null,
      legacy_would_block: verification.legacy_would_block === true,
    };
  }

  if (Array.isArray(raw.citations)) {
    out.citations = raw.citations.slice(0, 30).map((citation: any) => ({
      id: typeof citation?.id === 'string' ? citation.id.slice(0, 80) : null,
      kind: citation?.kind === 'derived' ? 'derived' : 'retrieved',
      table: typeof citation?.table === 'string' ? citation.table.slice(0, 80) : 'unknown',
      rowId: citation?.rowId != null ? String(citation.rowId).slice(0, 80) : null,
      columns: Array.isArray(citation?.columns)
        ? citation.columns.slice(0, 12).map((col: unknown) => String(col).slice(0, 64))
        : [],
      sourceTool: typeof citation?.sourceTool === 'string' ? citation.sourceTool.slice(0, 80) : 'unknown_tool',
      valueSnapshot: citation?.valueSnapshot && typeof citation.valueSnapshot === 'object'
        ? Object.fromEntries(Object.entries(citation.valueSnapshot).slice(0, 12))
        : null,
      query: citation?.query && typeof citation.query === 'object'
        ? Object.fromEntries(Object.entries(citation.query).slice(0, 12))
        : null,
      uiLink: citation?.uiLink && typeof citation.uiLink === 'object'
        ? {
            view: typeof citation.uiLink.view === 'string' ? citation.uiLink.view.slice(0, 40) : null,
            entityType: typeof citation.uiLink.entityType === 'string' ? citation.uiLink.entityType.slice(0, 40) : null,
            entityId: citation.uiLink.entityId != null ? String(citation.uiLink.entityId).slice(0, 80) : null,
          }
        : null,
      evidenceText: typeof citation?.evidenceText === 'string' ? citation.evidenceText.slice(0, 240) : null,
    }));
  }

  if (raw.tokenUsage && typeof raw.tokenUsage === 'object' && !Array.isArray(raw.tokenUsage)) {
    const tokenUsage = raw.tokenUsage as Record<string, unknown>;
    const intent = tokenUsage.intent && typeof tokenUsage.intent === 'object'
      ? (tokenUsage.intent as Record<string, unknown>)
      : null;
    const synthesis = tokenUsage.synthesis && typeof tokenUsage.synthesis === 'object'
      ? (tokenUsage.synthesis as Record<string, unknown>)
      : null;
    out.tokenUsage = {
      intent: intent
        ? {
            prompt: Number.isFinite(Number(intent.prompt)) ? Number(intent.prompt) : 0,
            completion: Number.isFinite(Number(intent.completion)) ? Number(intent.completion) : 0,
          }
        : null,
      synthesis: synthesis
        ? {
            prompt: Number.isFinite(Number(synthesis.prompt)) ? Number(synthesis.prompt) : 0,
            completion: Number.isFinite(Number(synthesis.completion)) ? Number(synthesis.completion) : 0,
            total: Number.isFinite(Number(synthesis.total)) ? Number(synthesis.total) : 0,
          }
        : null,
      total: Number.isFinite(Number(tokenUsage.total)) ? Number(tokenUsage.total) : 0,
      industry_standard_rows: sanitizeTokenUsageRows(tokenUsage.industry_standard_rows),
    };
  }

  if (raw.aiRuntime && typeof raw.aiRuntime === 'object' && !Array.isArray(raw.aiRuntime)) {
    const aiRuntime = raw.aiRuntime as Record<string, unknown>;
    out.aiRuntime = {
      mode: typeof aiRuntime.mode === 'string' ? aiRuntime.mode.slice(0, 40) : null,
      provider: typeof aiRuntime.provider === 'string' ? aiRuntime.provider.slice(0, 40) : null,
      model: typeof aiRuntime.model === 'string' ? aiRuntime.model.slice(0, 120) : null,
      synthesisProvider: typeof aiRuntime.synthesisProvider === 'string'
        ? aiRuntime.synthesisProvider.slice(0, 40)
        : null,
      synthesisModel: typeof aiRuntime.synthesisModel === 'string'
        ? aiRuntime.synthesisModel.slice(0, 120)
        : null,
      tokenUsageColumns: sanitizeTokenUsageRows(aiRuntime.tokenUsageColumns),
    };
  }

  if (raw.intent && typeof raw.intent === 'object' && !Array.isArray(raw.intent)) {
    const intent = raw.intent as Record<string, unknown>;
    out.intent = {
      classification: typeof intent.classification === 'string' ? intent.classification.slice(0, 64) : null,
      classificationSource: typeof intent.classificationSource === 'string' ? intent.classificationSource.slice(0, 40) : null,
      confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : null,
      retrievalPath: typeof intent.retrievalPath === 'string' ? intent.retrievalPath.slice(0, 64) : null,
      rolloutMode: typeof intent.rolloutMode === 'string' ? intent.rolloutMode.slice(0, 16) : null,
      clarificationNeeded: intent.clarificationNeeded === true,
      timeRangeKind: typeof intent.timeRangeKind === 'string' ? intent.timeRangeKind.slice(0, 40) : null,
      filtersPresent: intent.filtersPresent === true,
      shadowClassification: typeof intent.shadowClassification === 'string' ? intent.shadowClassification.slice(0, 64) : null,
      shadowRetrievalPath: typeof intent.shadowRetrievalPath === 'string' ? intent.shadowRetrievalPath.slice(0, 64) : null,
      shadowConfidence: Number.isFinite(Number(intent.shadowConfidence)) ? Number(intent.shadowConfidence) : null,
      intentMatch: typeof intent.intentMatch === 'boolean' ? intent.intentMatch : null,
    };
  }

  if (raw.execution && typeof raw.execution === 'object' && !Array.isArray(raw.execution)) {
    const execution = raw.execution as Record<string, unknown>;
    out.execution = {
      taskClass: typeof execution.taskClass === 'string' ? execution.taskClass.slice(0, 40) : null,
      needsTools: execution.needsTools === true,
      schemaCount: Number.isFinite(Number(execution.schemaCount)) ? Number(execution.schemaCount) : 0,
      retrievalPath: typeof execution.retrievalPath === 'string' ? execution.retrievalPath.slice(0, 64) : null,
      toolPlannerInvoked: execution.toolPlannerInvoked === true,
      deterministicPathUsed: execution.deterministicPathUsed === true,
      groundingState: typeof execution.groundingState === 'string' ? execution.groundingState.slice(0, 40) : null,
    };
  }

  if (raw.provenance && typeof raw.provenance === 'object' && !Array.isArray(raw.provenance)) {
    const provenance = raw.provenance as Record<string, unknown>;
    out.provenance = {
      source: typeof provenance.source === 'string' ? provenance.source.slice(0, 40) : null,
      recordsFound: Number.isFinite(Number(provenance.recordsFound)) ? Number(provenance.recordsFound) : null,
      searchPerformed: provenance.searchPerformed === true,
      confidence: typeof provenance.confidence === 'string' ? provenance.confidence.slice(0, 32) : null,
    };
  }

  if (raw.queryAssist && typeof raw.queryAssist === 'object' && !Array.isArray(raw.queryAssist)) {
    const queryAssist = raw.queryAssist as Record<string, unknown>;
    out.queryAssist = {
      enabled: queryAssist.enabled === true,
      reason: typeof queryAssist.reason === 'string' ? queryAssist.reason.slice(0, 40) : null,
      displayMode: typeof queryAssist.displayMode === 'string' ? queryAssist.displayMode.slice(0, 32) : null,
    };
  }

  return out;
}

/**
 * Conversation Logger - Persists chat history
 * SECURITY: Requires authentication.
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // ====== SECURITY: Authenticate the request ======
    // Check for internal call from chat-coordinator (uses service role key)
    const isInternalCall = req.headers.get('x-internal-call') === 'true';
    let userId: string;
    let requestBody: any;
    
    if (isInternalCall) {
      // For internal calls, trust userId from request body
      requestBody = await req.json();
      userId = requestBody.userId;
      if (!userId) {
        throw new Error('userId required for internal calls');
      }
      console.log('🔓 Internal call authenticated, userId:', userId);
    } else {
      // External calls require JWT authentication
      try {
        const auth = await authenticateRequest(req);
        userId = auth.userId;
      } catch (authError) {
        if (authError instanceof AuthError) {
          return new Response(
            JSON.stringify({ error: 'Authentication required', message: authError.message }),
            { status: authError.statusCode, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        throw authError;
      }
      requestBody = await req.json();
    }

    const {
      userMessage,
      aiResponse,
      crmOperations = [],
      sessionId,
      userMessageId,
      aiMessageId,
      feedback,
      aiMetadata,
    } = requestBody;

    if (!sessionId) {
      console.warn('⚠️ No sessionId provided');
    }

    if (!userMessage && !aiResponse && !feedback) {
      return new Response(
        JSON.stringify({ success: false, error: 'At least one of userMessage, aiResponse, or feedback is required' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = getServiceRoleClient();

    // Handle feedback writes (for thumbs up/down + optional notes)
    if (feedback) {
      const feedbackMessageId = typeof feedback?.messageId === 'string' ? feedback.messageId.trim() : '';
      const feedbackSessionId = typeof feedback?.sessionId === 'string' && feedback.sessionId.trim()
        ? feedback.sessionId.trim()
        : String(sessionId || '').trim();
      const feedbackRating = normalizeFeedbackRating(feedback?.rating);
      const feedbackComment = sanitizeFeedbackComment(feedback?.comment);
      const feedbackSource = typeof feedback?.source === 'string' ? feedback.source.slice(0, 40) : 'web';

      if (!feedbackMessageId || !feedbackSessionId) {
        return new Response(
          JSON.stringify({ success: false, error: 'feedback.messageId and sessionId are required' }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!feedbackRating && !feedbackComment) {
        return new Response(
          JSON.stringify({ success: false, error: 'Provide at least a rating or comment for feedback' }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: existingMessage, error: existingError } = await supabase
        .from('chat_messages')
        .select('id, metadata, message_type, session_id, user_id')
        .eq('id', feedbackMessageId)
        .eq('session_id', feedbackSessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) {
        console.error('❌ Failed to load message for feedback:', existingError.message);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save feedback' }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!existingMessage) {
        return new Response(
          JSON.stringify({ success: false, error: 'Message not found for feedback' }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (existingMessage.message_type !== 'assistant') {
        return new Response(
          JSON.stringify({ success: false, error: 'Feedback can only be attached to assistant messages' }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const metadata = toObjectRecord(existingMessage.metadata);
      const priorFeedback = toObjectRecord(metadata.feedback);
      const nowIso = new Date().toISOString();
      const savedFeedback = {
        rating: feedbackRating,
        comment: feedbackComment,
        source: feedbackSource,
        updated_at: nowIso,
        created_at: typeof priorFeedback.created_at === 'string' ? priorFeedback.created_at : nowIso,
      };
      const updatedMetadata = {
        ...metadata,
        feedback: savedFeedback,
      };

      const { error: updateError } = await supabase
        .from('chat_messages')
        .update({ metadata: updatedMetadata })
        .eq('id', feedbackMessageId)
        .eq('session_id', feedbackSessionId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('❌ Failed to persist feedback:', updateError.message);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save feedback' }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: sessionRow, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('organization_id')
        .eq('id', feedbackSessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (sessionError) {
        console.warn('⚠️ Failed to load session for feedback learning event:', sessionError.message);
      }

      if (sessionRow?.organization_id) {
        const { dealId: citedDealId, accountId: citedAccountId, contactId: citedContactId } =
          extractEntityIdsFromCitations(metadata);

        let dealId: string | null = citedDealId;
        let accountId: string | null = citedAccountId;
        let contactId: string | null = citedContactId;
        let industry: string | null = null;
        let amountBand: string | null = null;
        let segmentKey: string | null = null;

        if (dealId) {
          const { data: dealRow } = await supabase
            .from('deals')
            .select('id, account_id, contact_id, amount')
            .eq('id', dealId)
            .eq('organization_id', sessionRow.organization_id)
            .maybeSingle();
          if (dealRow) {
            accountId = accountId || dealRow.account_id || null;
            contactId = contactId || dealRow.contact_id || null;
            amountBand = computeAmountBand(Number.isFinite(Number(dealRow.amount)) ? Number(dealRow.amount) : null);
          }
        }

        if (accountId) {
          const { data: accountRow } = await supabase
            .from('accounts')
            .select('industry')
            .eq('id', accountId)
            .eq('organization_id', sessionRow.organization_id)
            .maybeSingle();
          industry = typeof accountRow?.industry === 'string' && accountRow.industry.trim()
            ? accountRow.industry.trim().toLowerCase()
            : null;
        }

        if (industry || amountBand) {
          segmentKey = `industry:${industry || 'unknown'}|amount:${amountBand || 'unknown'}`;
        }

        const { featureKey, objectionKey } = inferFeedbackSignalKeys(feedbackRating, feedbackComment);
        const learningEventKey = feedbackRating
          ? `assistant_feedback_${feedbackRating}`
          : 'assistant_feedback_comment';

        const learningMetadata = {
          feedback: savedFeedback,
          message_id: feedbackMessageId,
          session_id: feedbackSessionId,
          source: feedbackSource,
          verification: metadata.verification || null,
          ai_runtime: metadata.aiRuntime || null,
          intent: metadata.intent || null,
          execution: metadata.execution || null,
          provenance: metadata.provenance || null,
          query_assist: metadata.queryAssist || null,
        };

        const { error: learningError } = await supabase
          .from('sales_learning_events')
          .insert({
            organization_id: sessionRow.organization_id,
            user_id: userId,
            deal_id: dealId,
            account_id: accountId,
            contact_id: contactId,
            event_type: 'interaction',
            event_key: learningEventKey,
            segment_key: segmentKey,
            industry,
            amount_band: amountBand,
            objection_key: objectionKey,
            feature_key: featureKey,
            metadata: learningMetadata,
            occurred_at: nowIso,
          });

        if (learningError) {
          console.warn('⚠️ Failed to persist feedback learning event:', learningError.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          sessionId: feedbackSessionId,
          messageId: feedbackMessageId,
          feedback: savedFeedback,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const errors: string[] = [];

    // Log user message (only if provided)
    if (userMessage) {
      const insertPayload: Record<string, unknown> = {
        session_id: sessionId,
        user_id: userId,
        message_type: 'user',
        content: userMessage,
        metadata: { timestamp: new Date().toISOString() }
      };
      if (userMessageId) insertPayload.id = userMessageId;

      const { error: userError } = await supabase.from('chat_messages').insert(insertPayload);
      if (userError) {
        console.error('❌ Failed to persist user message:', userError.message);
        errors.push(`user: ${userError.message}`);
      }
    }

    // Log AI response (only if provided)
    if (aiResponse) {
      const sanitizedAiMetadata = sanitizeAiMetadata(aiMetadata);
      const insertPayload: Record<string, unknown> = {
        session_id: sessionId,
        user_id: userId,
        message_type: 'assistant',
        content: aiResponse,
        metadata: {
          timestamp: new Date().toISOString(),
          operations: crmOperations.length,
          ...sanitizedAiMetadata,
        }
      };
      if (aiMessageId) insertPayload.id = aiMessageId;

      const { error: aiError } = await supabase.from('chat_messages').insert(insertPayload);
      if (aiError) {
        console.error('❌ Failed to persist AI response:', aiError.message);
        errors.push(`assistant: ${aiError.message}`);
      }
    }

    if ((userMessage || aiResponse) && sessionId) {
      const { error: touchError } = await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString(), is_active: true })
        .eq('id', sessionId)
        .eq('user_id', userId);

      if (touchError) {
        console.warn('⚠️ Failed to update chat session activity:', touchError.message);
      }
    }

    return new Response(
      JSON.stringify({ success: errors.length === 0, sessionId, errors: errors.length > 0 ? errors : undefined }),
      { status: errors.length > 0 ? 207 : 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('Conversation logger error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
