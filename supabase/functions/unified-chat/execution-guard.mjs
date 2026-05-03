const CRM_REQUEST_PATTERNS = [
  /\b(?:deal|deals|pipeline|opportunit(?:y|ies)|contact|contacts|account|accounts|company|companies)\b/i,
  /\b(?:closing|closable|close date|forecast|convo|convos|conversation|conversations|message|messages|history)\b/i,
  /\b(?:follow[\s-]?up|draft|email|task|tasks)\b/i,
  /\b(?:tell me about|pull up|where is|who is|show me|what deals do i have|whatve i got|what's on my plate|whats on my plate)\b/i,
  /\b(?:hows it going with|how's it going with|how is it going with|any news on|what's the story with|whats the story with)\b/i,
];

const DEICTIC_CRM_PATTERNS = [
  /\b(?:this|that|it|one)\b/i,
];

const HISTORY_ENTITY_PATTERNS = [
  /\b(?:deal|pipeline|account|contact|opportunity|convo|conversation|message)\b/i,
];

const PLANNING_PLACEHOLDER_PATTERNS = [
  /\b(?:i(?:'|’)ll|i will)\s+(?:check|look up|pull up|gather|retrieve|access)\b/i,
  /\b(?:i(?:'|’)ll|i will)\s+need to\s+(?:check|look up|pull up|gather|retrieve|access)\b/i,
  /\blet me\s+(?:check|look up|gather|pull up|retrieve|access)\b/i,
  /\b(?:checking|retrieving|accessing)\s+(?:the )?crm\b/i,
  /\bto provide you with\b/i,
  /\bbased on (?:the )?crm data\b/i,
  /^crm[,:\s]/i,
  /please provide me with/i,
];

const TEMPLATE_PLACEHOLDER_PATTERNS = [
  /\[[^[\]]+\]/,
  /\bdeal\s+\d+\s*:\s*\[deal/i,
];

export function looksLikeCrmRequestMessage(message, historyText = '') {
  const lower = String(message || '').toLowerCase().trim();
  const history = String(historyText || '').toLowerCase();
  if (!lower) return false;

  if (CRM_REQUEST_PATTERNS.some((pattern) => pattern.test(lower))) {
    return true;
  }

  if (DEICTIC_CRM_PATTERNS.some((pattern) => pattern.test(lower))
    && HISTORY_ENTITY_PATTERNS.some((pattern) => pattern.test(history))) {
    return true;
  }

  return false;
}

export function looksLikePlanningPlaceholderText(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  return PLANNING_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(raw));
}

export function looksLikeTemplatePlaceholderText(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  return TEMPLATE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(raw));
}

export function shouldSuppressUngroundedCrmText({
  message,
  historyText = '',
  responseText = '',
  taskClass = '',
  retrievalPath = '',
  crmOperationsCount = 0,
  clarificationNeeded = false,
}) {
  if (clarificationNeeded) return false;
  if (crmOperationsCount > 0) return false;

  const crmLikeMessage = looksLikeCrmRequestMessage(message, historyText);
  const crmLikeTaskClass = ['crm_read', 'crm_write', 'analytics', 'scoutpad'].includes(String(taskClass || '').trim());
  const crmLikeRetrievalPath = [
    'scoutpad',
    'pipeline_context',
    'deal_context',
    'contact_context',
    'entity_messages',
    'draft_with_context',
    'planner_fallback',
  ].includes(String(retrievalPath || '').trim());
  const placeholderText = looksLikePlanningPlaceholderText(responseText)
    || looksLikeTemplatePlaceholderText(responseText);

  return placeholderText && (crmLikeMessage || crmLikeTaskClass || crmLikeRetrievalPath);
}
