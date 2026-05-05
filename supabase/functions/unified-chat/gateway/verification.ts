import {
  buildStrictVerification,
  buildVerificationUserSummary,
  determineVerificationPolicy,
  hasCitationRelevantOperation,
  hasOnlyPendingWorkflowOperations,
} from '../citations-utils.mjs';

type VerificationPolicy = 'strict' | 'advisory' | 'none';

export type HybridVerification = ReturnType<typeof buildStrictVerification> & {
  policy: VerificationPolicy;
  blocking_failure: boolean;
  mixed_intent: boolean;
  source_status: 'source_backed' | 'source_gap' | 'not_applicable';
  user_summary: string | null;
  legacy_would_block: boolean;
};

export function isRecoverableProvider400Error(error: any): boolean {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode !== 400) return false;

  const msg = `${String(error?.message || '')} ${String(error?.responseBody || '')}`.toLowerCase();
  if (!msg) return false;

  const recoverableMarkers = [
    'api error: 400',
    'context length',
    'maximum context length',
    'prompt is too long',
    'exceeds context window',
    'input is too long',
    'too many tokens',
    'unsupported',
    'unknown parameter',
    'invalid parameter',
    'invalid value',
    'invalid request',
    'does not exist',
    'not found',
    'response_format',
    'tool_choice',
  ];

  return recoverableMarkers.some((marker) => msg.includes(marker));
}

export function isRecoverableProvider404Error(error: any): boolean {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode !== 404) return false;

  const msg = `${String(error?.message || '')} ${String(error?.responseBody || '')}`.toLowerCase();
  if (!msg) return false;

  const recoverableMarkers = [
    'api error: 404',
    'model not found',
    'model_not_found',
    'unknown model',
    'does not exist',
    'not found',
    'no such model',
    'endpoint not found',
    'route not found',
  ];

  return recoverableMarkers.some((marker) => msg.includes(marker));
}

export function isRetryableAiError(error: any): boolean {
  const statusCode = Number(error?.statusCode || 0);
  if (isRecoverableProvider400Error(error)) return true;
  if (isRecoverableProvider404Error(error)) return true;
  if (statusCode === 408 || statusCode === 413 || statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('timed out')
    || msg.includes('timeout')
    || msg.includes('rate limit')
    || msg.includes('all ai providers failed')
    || msg.includes('service unavailable')
    || msg.includes('fetch failed')
    || msg.includes('cannot truncate prompt with n_keep')
    || (msg.includes('n_keep') && msg.includes('n_ctx'))
    || msg.includes('context length')
    || msg.includes('maximum context length')
    || msg.includes('prompt is too long')
    || msg.includes('exceeds context window')
    || msg.includes('too many tokens');
}

export function buildSafeErrorResponseMessage(errorMessage: string): string {
  const raw = String(errorMessage || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return 'I ran into an issue while processing that request. Please try again.';
  }

  // Avoid leaking raw upstream HTML pages into user-visible chat responses.
  if (lower.includes('<!doctype html') || /<html[\s>]/i.test(raw)) {
    return 'I hit an upstream model gateway error while processing that request. Please try again now.';
  }

  const statusMatch = raw.match(/\bapi error:\s*(\d{3})\b/i);
  if (statusMatch?.[1]) {
    return `I hit an upstream model provider error (${statusMatch[1]}). Please retry now.`;
  }

  const normalized = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'I ran into an issue while processing that request. Please try again.';
  }
  return `I ran into an issue: ${normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized}`;
}

export function evaluateHybridVerification(params: {
  message: string;
  response: string;
  crmOperations: any[];
  citations: any[];
  routingTaskClass?: 'chat_small' | 'crm_read' | 'crm_write' | 'analytics' | 'scoutpad';
  dataOrActionRequest: boolean;
}): {
  verification: HybridVerification;
  factualClaimsDetected: boolean;
} {
  const policyDecision = determineVerificationPolicy({
    message: params.message,
    response: params.response,
    crmOperations: params.crmOperations,
    routingTaskClass: params.routingTaskClass,
    dataOrActionRequest: params.dataOrActionRequest,
  });

  const strictVerification = buildStrictVerification({
    requiresVerification: policyDecision.policy === 'strict',
    crmOperations: params.crmOperations,
    citations: params.citations,
    response: params.response,
  });

  const legacyRequiresVerification = (params.dataOrActionRequest || params.crmOperations.length > 0);
  const legacyStrictVerification = buildStrictVerification({
    requiresVerification: legacyRequiresVerification,
    crmOperations: params.crmOperations,
    citations: params.citations,
    response: params.response,
  });
  const legacyWouldBlock = legacyRequiresVerification && !legacyStrictVerification.is_true;
  const citationRelevantOperation = hasCitationRelevantOperation(params.crmOperations);
  const pendingWorkflowOnly = hasOnlyPendingWorkflowOperations(params.crmOperations);
  const sourceStatus: 'source_backed' | 'source_gap' | 'not_applicable' = policyDecision.policy === 'none'
    ? 'not_applicable'
    : (params.citations.length > 0
      ? 'source_backed'
      : (pendingWorkflowOnly
        ? 'not_applicable'
        : (policyDecision.policy === 'strict' || citationRelevantOperation ? 'source_gap' : 'not_applicable')));
  const blockingFailure = policyDecision.policy === 'strict'
    && !strictVerification.is_true
    && !policyDecision.mixed_intent;

  const verification: HybridVerification = {
    ...strictVerification,
    policy: policyDecision.policy as VerificationPolicy,
    blocking_failure: blockingFailure,
    mixed_intent: policyDecision.mixed_intent === true,
    source_status: sourceStatus,
    user_summary: buildVerificationUserSummary(strictVerification.failed_checks, {
      policy: policyDecision.policy,
      sourceStatus,
    }),
    legacy_would_block: legacyWouldBlock,
  };

  return {
    verification,
    factualClaimsDetected: policyDecision.factual_claims_detected === true,
  };
}

export function applyVerificationPolicyToResponse(
  rawResponse: string,
  verification: HybridVerification
): string {
  const baseResponse = String(rawResponse || '').trim() || 'Done.';

  // Never block the response entirely. The verification metadata is sent
  // alongside the response so the client UI can display the appropriate
  // badge (verified, unverified, source gap, etc.). Blocking replaces the
  // AI's useful answer with an error, which is a worse user experience
  // than showing the answer with an "unverified" label.

  return baseResponse;
}

// ============================================================================
// POST-SYNTHESIS HALLUCINATION GUARD
// Verifies that entities mentioned in the LLM response actually exist in
// tool results. Catches fabricated deal names, contacts, amounts.
// ============================================================================

export interface HallucinationCheckResult {
  isHallucinated: boolean;
  confidence: number; // 0-1, how confident we are this is hallucinated
  claimedEntities: string[];
  verifiedEntities: string[];
  unverifiedEntities: string[];
  replacementResponse: string | null;
}

/**
 * Extract entity names that the LLM claims exist in CRM data.
 * Looks for patterns like bold names, deal/contact/company references.
 */
function extractClaimedEntities(responseText: string): string[] {
  const claimed = new Set<string>();

  // Bold text patterns (markdown): **Name** or __Name__
  const boldMatches = responseText.match(/\*\*([^*]+)\*\*|__([^_]+)__/g) || [];
  for (const m of boldMatches) {
    const name = m.replace(/\*\*|__/g, '').trim();
    // Skip generic labels like "Deal Details:", "Total pipeline value:", "Stage:"
    if (name.length > 2 && name.length < 100 && !/^(deal|stage|amount|close|contact|total|value|owner|forecast|action|insight)/i.test(name)) {
      claimed.add(name);
    }
  }

  // "Deal Name:" or "Deal N:" patterns
  const dealNamePatterns = responseText.match(/Deal\s*(?:\d+)?:\s*([^\n–—-]+?)(?:\s*[-–—]|$)/gm) || [];
  for (const m of dealNamePatterns) {
    const name = m.replace(/^Deal\s*(?:\d+)?:\s*/, '').replace(/\s*[-–—].*$/, '').trim();
    if (name.length > 2 && name.length < 100) {
      claimed.add(name);
    }
  }

  // Company names in context (Capitalized Multi-Word before common CRM terms)
  const companyPatterns = responseText.match(/(?:^|\n)\s*(?:[-•*]\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*(?:[-–—]|:|\()/gm) || [];
  for (const m of companyPatterns) {
    const name = m.replace(/^[\s\-•*]+/, '').replace(/\s*[-–—:(\n].*$/, '').trim();
    if (name.length > 3 && name.length < 60) {
      claimed.add(name);
    }
  }

  return Array.from(claimed);
}

/**
 * Extract all verified entity names/identifiers from tool results.
 * These are the ground truth — data that actually came from the database.
 */
function extractToolResultEntities(crmOperations: any[]): Set<string> {
  const verified = new Set<string>();

  for (const op of crmOperations) {
    const result = op?.result;
    if (!result) continue;

    // Single entity results
    for (const field of ['name', 'full_name', 'deal_name', 'account_name', 'contact_name', 'title']) {
      const val = result[field];
      if (val && typeof val === 'string' && val.length > 1) {
        verified.add(val.trim());
        // Also add lowercase for case-insensitive matching
        verified.add(val.trim().toLowerCase());
      }
    }

    // Array results (search results, pipeline deals)
    const items = result.results || result.deals || result.contacts || result.accounts || [];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item) continue;
        for (const field of ['name', 'full_name', 'deal_name', 'account_name', 'title']) {
          const val = item[field];
          if (val && typeof val === 'string' && val.length > 1) {
            verified.add(val.trim());
            verified.add(val.trim().toLowerCase());
          }
        }
      }
    }

    // Pipeline context nested structures
    if (result.closing_soon && Array.isArray(result.closing_soon)) {
      for (const d of result.closing_soon) {
        if (d?.name) { verified.add(d.name.trim()); verified.add(d.name.trim().toLowerCase()); }
      }
    }
    if (result.at_risk && Array.isArray(result.at_risk)) {
      for (const d of result.at_risk) {
        if (d?.name) { verified.add(d.name.trim()); verified.add(d.name.trim().toLowerCase()); }
      }
    }
    if (result.recent_wins && Array.isArray(result.recent_wins)) {
      for (const d of result.recent_wins) {
        if (d?.name) { verified.add(d.name.trim()); verified.add(d.name.trim().toLowerCase()); }
      }
    }
    if (result.unscheduled && Array.isArray(result.unscheduled)) {
      for (const d of result.unscheduled) {
        if (d?.name) { verified.add(d.name.trim()); verified.add(d.name.trim().toLowerCase()); }
      }
    }

    // Stakeholders from deal context
    if (result.stakeholders && Array.isArray(result.stakeholders)) {
      for (const s of result.stakeholders) {
        if (s?.name) { verified.add(s.name.trim()); verified.add(s.name.trim().toLowerCase()); }
        if (s?.full_name) { verified.add(s.full_name.trim()); verified.add(s.full_name.trim().toLowerCase()); }
      }
    }

    // Deep scan: walk nested objects for name/full_name fields (catches deal context JSONB structures)
    const deepScan = (obj: any, depth: number) => {
      if (depth > 5 || !obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) deepScan(item, depth + 1);
        return;
      }
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if ((key === 'name' || key === 'full_name' || key === 'deal_name' || key === 'account_name') && typeof val === 'string' && val.length > 1) {
          verified.add(val.trim());
          verified.add(val.trim().toLowerCase());
        }
        if (typeof val === 'object' && val !== null) deepScan(val, depth + 1);
      }
    };
    deepScan(result, 0);
  }

  return verified;
}

/**
 * Check if a claimed entity name matches any verified entity.
 * Uses substring matching to handle partial names and variations.
 */
function entityMatchesVerified(claimed: string, verified: Set<string>): boolean {
  const claimedLower = claimed.toLowerCase().trim();
  if (verified.has(claimed) || verified.has(claimedLower)) return true;

  // Substring matching: "Stripe - API Monitoring" should match "Stripe"
  for (const v of verified) {
    const vLower = v.toLowerCase();
    if (vLower.length < 3) continue;
    if (claimedLower.includes(vLower) || vLower.includes(claimedLower)) return true;
  }

  return false;
}

/**
 * Post-synthesis verification: checks if entities in the LLM response
 * actually exist in the tool results. Catches hallucinated CRM data.
 */
export function verifyResponseAgainstToolResults(
  responseText: string,
  crmOperations: any[],
  citationCount: number = 0
): HallucinationCheckResult {
  const claimed = extractClaimedEntities(responseText);
  const verified = extractToolResultEntities(crmOperations);

  // If tools returned rich data (many citations), trust the response more
  // The guard is most valuable when tools return empty/sparse results
  if (citationCount >= 5 && claimed.length > 0) {
    return {
      isHallucinated: false,
      confidence: 1,
      claimedEntities: claimed,
      verifiedEntities: claimed, // Trust when citations are abundant
      unverifiedEntities: [],
      replacementResponse: null,
    };
  }

  // If no entities claimed, nothing to verify
  if (claimed.length === 0) {
    return {
      isHallucinated: false,
      confidence: 0,
      claimedEntities: [],
      verifiedEntities: [],
      unverifiedEntities: [],
      replacementResponse: null,
    };
  }

  // If tools returned no data at all, any entity claim is hallucinated
  const toolsReturnedData = crmOperations.some((op) => {
    const r = op?.result;
    if (!r) return false;
    if (r.count > 0 || r.total_count > 0) return true;
    if (r.results?.length > 0 || r.deals?.length > 0) return true;
    if (r.summary?.total_deals > 0) return true;
    if (r.closing_soon?.length > 0 || r.at_risk?.length > 0) return true;
    if (r.name || r.full_name || r.id) return true;
    // Context RPCs return nested objects (get_deal_context, get_contact_context)
    if (r.__trusted_context) return true;
    if (r.deal?.id || r.account?.id || r.contact?.id) return true;
    if (r.deal_id || r.account_id || r.contact_id || r.task_id) return true;
    if (r.pending_update?.deal_id || r.pending_delete?.deal_id) return true;
    return false;
  });

  if (!toolsReturnedData && claimed.length > 0) {
    console.log(`[hallucination-guard] BLOCKED: ${claimed.length} entities claimed but tools returned no data. Claimed: ${claimed.join(', ')}`);
    return {
      isHallucinated: true,
      confidence: 1.0,
      claimedEntities: claimed,
      verifiedEntities: [],
      unverifiedEntities: claimed,
      replacementResponse: 'I searched your CRM but found no matching records. Try a different search term or check if the data has been entered.',
    };
  }

  // Cross-reference each claimed entity
  const verifiedList: string[] = [];
  const unverifiedList: string[] = [];

  for (const entity of claimed) {
    if (entityMatchesVerified(entity, verified)) {
      verifiedList.push(entity);
    } else {
      unverifiedList.push(entity);
    }
  }

  const hallucinationRatio = unverifiedList.length / claimed.length;

  // Full hallucination: none of the claimed entities exist in tool results
  if (verifiedList.length === 0 && unverifiedList.length > 0) {
    console.log(`[hallucination-guard] BLOCKED: 0/${claimed.length} entities verified. Unverified: ${unverifiedList.join(', ')}`);
    return {
      isHallucinated: true,
      confidence: 0.95,
      claimedEntities: claimed,
      verifiedEntities: verifiedList,
      unverifiedEntities: unverifiedList,
      replacementResponse: 'I searched your CRM but the results don\'t match what I expected. Let me try again — could you rephrase your question?',
    };
  }

  // Partial hallucination: some entities are real, some are fabricated
  if (hallucinationRatio > 0.5) {
    console.log(`[hallucination-guard] PARTIAL: ${verifiedList.length}/${claimed.length} verified. Unverified: ${unverifiedList.join(', ')}`);
    return {
      isHallucinated: true,
      confidence: hallucinationRatio,
      claimedEntities: claimed,
      verifiedEntities: verifiedList,
      unverifiedEntities: unverifiedList,
      replacementResponse: null, // Don't replace partial — let verification badge handle it
    };
  }

  // Mostly or fully grounded
  if (unverifiedList.length > 0) {
    console.log(`[hallucination-guard] PASS (minor): ${verifiedList.length}/${claimed.length} verified. Unverified: ${unverifiedList.join(', ')}`);
  }

  return {
    isHallucinated: false,
    confidence: 1 - hallucinationRatio,
    claimedEntities: claimed,
    verifiedEntities: verifiedList,
    unverifiedEntities: unverifiedList,
    replacementResponse: null,
  };
}
