function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeFailureTurn(content) {
  const text = String(content || '').toLowerCase();
  if (!text) return false;
  return (
    /found no matching records/.test(text)
    || /found no deal/.test(text)
    || /found no contact/.test(text)
    || /found no account/.test(text)
    || /could not retrieve verified crm data/.test(text)
    || /query didn't execute properly/.test(text)
    || /i searched the crm but found no/.test(text)
    || /could you clarify/.test(text)
    || /which deal/.test(text)
    || /which contact/.test(text)
    || /which account/.test(text)
  );
}

function countRecentFailureTurns(historyEntries = []) {
  return historyEntries
    .slice(-8)
    .filter((entry) => String(entry?.role || '').toLowerCase() === 'assistant')
    .filter((entry) => looksLikeFailureTurn(entry?.content))
    .length;
}

function hasToolErrors(crmOperations = []) {
  return crmOperations.some((op) => op?.result?.error);
}

export function evaluateQueryAssist({
  message = '',
  intent = null,
  retrievalPlan = null,
  clarification = null,
  groundingState = null,
  crmOperations = [],
  response = '',
  historyEntries = [],
}) {
  const safeIntent = isObject(intent) ? intent : {};
  const safeClarification = isObject(clarification) ? clarification : {};
  const safeRetrievalPlan = isObject(retrievalPlan) ? retrievalPlan : {};
  const lowerMessage = String(message || '').toLowerCase();
  const repeatedFailureCount = countRecentFailureTurns(historyEntries)
    + (looksLikeFailureTurn(response) ? 1 : 0);

  if (safeIntent.intent === 'small_talk' || safeIntent.intent === 'unknown') {
    return { enabled: false, reason: null, displayMode: null };
  }

  if (safeClarification.needsClarification) {
    const reason = String(safeClarification.reason || '').trim();
    if (['missing_deal', 'missing_entity', 'missing_message_target', 'missing_drafting_target', 'unsafe_mutation'].includes(reason)) {
      return {
        enabled: true,
        reason: 'missing_entity',
        displayMode: 'suggest_examples',
      };
    }

    return {
      enabled: true,
      reason: 'ambiguous_entity',
      displayMode: 'suggest_examples',
    };
  }

  if (
    groundingState === 'failure'
    && ['pipeline_summary', 'pipeline_window'].includes(String(safeIntent.intent || ''))
    && !safeIntent.resolvedTimeRange
    && /\b(close|closing|closable|coming up|landing|upcoming|soon)\b/.test(lowerMessage)
  ) {
    return {
      enabled: true,
      reason: 'missing_time_range',
      displayMode: 'suggest_examples',
    };
  }

  if (
    groundingState === 'failure'
    && safeIntent.intent === 'entity_lookup'
    && safeIntent.entityType === 'account'
    && safeRetrievalPlan.path === 'planner_fallback'
  ) {
    return {
      enabled: true,
      reason: 'unsupported_scope',
      displayMode: 'suggest_examples',
    };
  }

  if (groundingState === 'no_results') {
    return {
      enabled: true,
      reason: 'no_results',
      displayMode: 'suggest_examples',
    };
  }

  if ((groundingState === 'failure' || hasToolErrors(crmOperations)) && repeatedFailureCount >= 2) {
    return {
      enabled: true,
      reason: 'repeated_failure',
      displayMode: 'tip_only',
    };
  }

  return { enabled: false, reason: null, displayMode: null };
}
