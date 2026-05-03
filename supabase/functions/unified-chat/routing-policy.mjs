/**
 * Unified chat routing policy contract.
 *
 * Purpose:
 * - classify request into task class
 * - estimate operational risk
 * - resolve minimum allowed routing tier
 */

const SMALL_CHAT_PATTERNS = [
  /^(hi|hello|hey|yo|thanks|thank you|ok|okay|yes|no|cool|great)[\s.!?]*$/i,
  /^(good morning|good afternoon|good evening)[\s.!?]*$/i,
];

const SCOUTPAD_PATTERNS = [
  /\bscoutpad\b/i,
  /\b(analy[sz]e|coach|review|deep dive)\b.*\b(deal|opportunity|account|company|pipeline)\b/i,
];

const ANALYTICS_PATTERNS = [
  /\b(pipeline|forecast|velocity|conversion|report|dashboard|trend|breakdown|distribution|kpi)\b/i,
  /\b(quarter|q[1-4]|monthly|weekly|year over year|yoy|mom)\b/i,
];

const MUTATION_PATTERNS = [
  /\b(create|add|update|change|edit|delete|remove|set|mark|assign|log|record|send|link|attach|associate)\b/i,
  /\b(new deal|new contact|new account|new task|log activity)\b/i,
];

const READ_PATTERNS = [
  /\b(show|list|find|get|what is|what's|which|lookup|search)\b/i,
  /\b(deal|contact|account|task|activity|pipeline|opportunity)\b/i,
];

function normalizeDomains(domains) {
  if (!Array.isArray(domains)) return new Set();
  return new Set(domains.map((d) => String(d || '').toLowerCase()).filter(Boolean));
}

export function inferMutationIntent({ message, domains = [] }) {
  const lower = String(message || '').toLowerCase().trim();
  if (!lower) return false;
  const domainSet = normalizeDomains(domains);
  if (domainSet.has('create') || domainSet.has('update')) return true;
  return MUTATION_PATTERNS.some((pattern) => pattern.test(lower));
}

export function classifyTaskClass({ message, historyText = '', domains = [], channel = 'web', intentHint = null }) {
  const lower = String(message || '').toLowerCase().trim();
  if (!lower) return 'chat_small';

  const domainSet = normalizeDomains(domains);
  const history = String(historyText || '').toLowerCase();

  if (intentHint?.confidence >= 0.8) {
    if (intentHint.intent === 'deal_analysis') return 'scoutpad';
    if (intentHint.intent === 'pipeline_summary' || intentHint.intent === 'pipeline_window') return 'analytics';
    if (intentHint.intent === 'crm_mutation') return 'crm_write';
    if (intentHint.intent === 'crm_lookup' || intentHint.intent === 'entity_lookup' || intentHint.intent === 'message_history') return 'crm_read';
    if (intentHint.intent === 'drafting') return 'crm_read';
  }

  if (SCOUTPAD_PATTERNS.some((pattern) => pattern.test(lower))) {
    return 'scoutpad';
  }

  if (domainSet.has('coaching') && /\b(analy[sz]e|coach|deal|opportunity)\b/i.test(lower)) {
    return 'scoutpad';
  }

  if (ANALYTICS_PATTERNS.some((pattern) => pattern.test(lower)) || domainSet.has('analytics')) {
    return 'analytics';
  }

  if (inferMutationIntent({ message: lower, domains })) {
    return 'crm_write';
  }

  if (domainSet.has('search') || domainSet.has('leads') || domainSet.has('sequences')) {
    return 'crm_read';
  }

  if (READ_PATTERNS.every((pattern) => pattern.test(lower))) {
    return 'crm_read';
  }

  if (SMALL_CHAT_PATTERNS.some((pattern) => pattern.test(lower)) && lower.length <= 80) {
    return 'chat_small';
  }

  if ((channel === 'whatsapp' || channel === 'telegram' || channel === 'sms') && lower.length <= 20) {
    // Messaging channels receive many short follow-ups; default to small chat unless explicit CRM intent.
    if (!/\b(deal|contact|account|task|pipeline|forecast|create|update|delete|search)\b/i.test(lower)) {
      return 'chat_small';
    }
  }

  if (/\b(deal|contact|account|task|pipeline|activity|opportunity)\b/i.test(lower)
    || /\b(this quarter|that deal|same as above)\b/i.test(lower)
    || /\b(deal|pipeline|account|contact)\b/i.test(history)) {
    return 'crm_read';
  }

  return 'chat_small';
}

export function classifyRiskLevel({
  taskClass,
  needsTools = false,
  mutationIntent = false,
  verificationRequired = false,
}) {
  if (taskClass === 'scoutpad') return 'critical';
  if (taskClass === 'analytics') return 'high';
  if (mutationIntent || taskClass === 'crm_write') return 'high';
  if (verificationRequired || needsTools || taskClass === 'crm_read') return 'medium';
  return 'low';
}

export function resolveMinimumTier({ taskClass, riskLevel }) {
  if (taskClass === 'scoutpad' || taskClass === 'analytics') return 'pro';
  if (taskClass === 'crm_write') return 'standard';
  if (taskClass === 'crm_read') return (riskLevel === 'critical' || riskLevel === 'high') ? 'pro' : 'standard';
  if (taskClass === 'chat_small') return riskLevel === 'low' ? 'lite' : 'standard';
  return 'standard';
}

export function determineRoutingPolicy({
  message,
  historyText = '',
  domains = [],
  channel = 'web',
  needsTools = false,
  verificationRequired = false,
  intentHint = null,
}) {
  const taskClass = classifyTaskClass({ message, historyText, domains, channel, intentHint });
  const mutationIntent = inferMutationIntent({ message, domains });
  const riskLevel = classifyRiskLevel({
    taskClass,
    needsTools,
    mutationIntent,
    verificationRequired,
  });
  const minimumTier = resolveMinimumTier({ taskClass, riskLevel });

  return {
    taskClass,
    riskLevel,
    minimumTier,
    mutationIntent,
    policyVersion: 'routing-policy-v1',
  };
}
