import {
  isLikelyFollowUpMessage,
  isCompoundRequest,
  isDataOrActionRequest,
  isDirectPipelineSummaryRequest,
} from '../request-intelligence.mjs';
import { estimateRelevantDomains } from '../skills/domain-estimator.mjs';
import { inferMutationIntent } from '../routing-policy.mjs';
import { extractIntentWithModel } from './model-extractor.mjs';
import { resolveTimeRangeHint } from './time-range-resolver.mjs';
import { normalizeIntentFilters } from './filter-normalizer.mjs';

const ANALYSIS_INTENT = /\b(?:analy(?:z(?:e|ing)|s(?:e|is|ing))|evaluat(?:e|ion|ing)|coach(?:ing)?|scoutpad|grade|review|deep dive)\b/i;
const ANALYTICS_EXCLUSION = /\b(?:pipeline|forecast|dashboard|report|conversion|velocity|activity stats?)\b/i;
const TARGET_ENTITY_CUE = /\b(?:deal|deals|opportunity|opportunities|account|accounts|company|this|that|it)\b/i;
const GENERIC_PLACEHOLDERS = new Set([
  'this',
  'that',
  'it',
  'deal',
  'deals',
  'opportunity',
  'opportunities',
  'account',
  'accounts',
  'contact',
  'contacts',
  'company',
  'companies',
]);
const SMALL_TALK_PATTERNS = [
  /^(hi|hello|hey|yo|thanks|thank you|ok|okay|yes|no|cool|great|sure|sounds good)[\s.!?]*$/i,
  /^(good morning|good afternoon|good evening)[\s.!?]*$/i,
];
const MESSAGE_HISTORY_PATTERNS = [
  /\b(convo|convos|conversation|conversations|messages?|chat history|recent convos?)\b/i,
  /\b(what did we discuss|what did they say|conversation history|communication history)\b/i,
];
const DRAFTING_PATTERNS = [
  /\b(draft|compose|write)\b.*\b(email|message|follow[\s-]?up|reply)\b/i,
  /\b(?:send|write|draft|compose)\s+(?:a\s+)?(?:note|message|email|follow[\s-]?up)\s+to\b/i,
  /\bwrite something to move this deal forward\b/i,
];
const NEXT_STEP_GUIDANCE_PATTERNS = [
  /\bwhat\s+should\s+i\s+do\s+next\b/i,
  /\b(?:what'?s|what is)\s+(?:the\s+)?next\s+(?:step|move|action)\b/i,
  /\bhow\s+should\s+i\s+follow\s+up\b/i,
  /\brecommend(?:ed)?\s+next\s+(?:step|move|action)\b/i,
];
const DEAL_CONTEXT_COMPOUND_PATTERNS = [
  /\b(?:what'?s|what is)\s+(?:the\s+)?status\s+of\b[\s\S]*\b(?:deal|opportunit(?:y|ies))\b/i,
  /\b(?:main\s+)?points?\s+of\s+contact\b[\s\S]*\b(?:deal|opportunit(?:y|ies))\b/i,
  /\b(?:stakeholders?|power\s+ranks?|power\s+rankings?|influence\s+map|buying\s+committee)\b[\s\S]*\b(?:deal|opportunit(?:y|ies))\b/i,
  /\b(?:deal|opportunit(?:y|ies))\b[\s\S]*\b(?:main\s+)?points?\s+of\s+contact\b/i,
  /\b(?:deal|opportunit(?:y|ies))\b[\s\S]*\b(?:stakeholders?|power\s+ranks?|power\s+rankings?|influence\s+map|buying\s+committee)\b/i,
];
const NATURAL_ENTITY_QUERY_PATTERNS = [
  /\b(tell me about|pull up|status of|what'?s the status of|what is the status of|where is|who is)\b/i,
  /\b(how'?s it going with|hows it going with|how is it going with)\b/i,
  /\b(any news on|what'?s the story with|whats the story with)\b/i,
];
const PIPELINE_WINDOW_PATTERNS = [
  /\b(next\s+\d+\s+(?:days?|weeks?|months?))\b/i,
  /\b(closing soon|coming up|landing soon|upcoming|closable)\b/i,
  /\b(on my plate)\b/i,
];
const ENTITY_EXTRACTION_PATTERNS = [
  /^(?:please\s+)?(?:can you\s+)?(?:analy(?:z(?:e|ing)|s(?:e|is|ing))|evaluat(?:e|ion|ing)|review|grade)\s+(?:of\s+|on\s+|for\s+)?(?:the\s+)?(?:deal|deals|opportunity|opportunities|account|accounts|company)?\s*(.+)$/i,
  /^(?:coach(?: me)?(?: on)?|scoutpad(?: analysis)?(?: for)?|deep dive(?: on| into)?)\s+(?:the\s+)?(?:deal|deals|opportunity|opportunities|account|accounts|company)?\s*(.+)$/i,
  /^(?:please\s+)?(?:can you\s+)?(?:run|do|perform|give me|provide)\s+(?:an?\s+)?(?:analy(?:z(?:e|ing)|s(?:e|is|ing))|review|deep dive|evaluat(?:e|ion|ing))\s+(?:of|on|for)\s+(?:the\s+)?(?:deal|deals|opportunity|opportunities|account|accounts|company)?\s*(.+)$/i,
];
const ENTITY_LOOKUP_EXTRACTION_PATTERNS = [
  /^(?:please\s+)?(?:can you\s+)?(?:tell me about|pull up|what'?s\s+the\s+status\s+of|what\s+is\s+the\s+status\s+of|status of|where is|who is)\s+(.+)$/i,
  /^(?:please\s+)?(?:can you\s+)?(?:how'?s it going with|hows it going with|how is it going with)\s+(.+)$/i,
  /^(?:please\s+)?(?:can you\s+)?(?:any news on|what'?s the story with|whats the story with)\s+(.+)$/i,
  /^(?:please\s+)?(?:can you\s+)?(?:what\s+should\s+i\s+do\s+next\s+(?:with|for|on)|what'?s\s+the\s+next\s+(?:step|move|action)\s+(?:for|with|on)|how\s+should\s+i\s+follow\s+up\s+(?:with|on)|recommend(?:ed)?\s+next\s+(?:step|move|action)\s+(?:for|with|on))\s+(.+?)(?:\s+based\s+on\b.*)?$/i,
];
const BARE_ACCOUNT_CREATE_PATTERN = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|create|new)\s+(.+)$/i;
const DASH_SUFFIX_PATTERN = /\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|q[1-4]\s+\d{4}|\w{3,9}\s+\d{4}|\$[\d,.]+[KMB]?|prospecting|qualification|proposal|negotiation|closed[_\s]?(?:won|lost)?|\d+%?).*$/i;
const DEAL_SUFFIX_PATTERN = /\s+(?:deal|deals|opportunity|opportunities)$/i;
const CONTACT_SUFFIX_PATTERN = /\s+(?:contact|contacts)$/i;
const ACCOUNT_SUFFIX_PATTERN = /\s+(?:account|accounts)$/i;
const ALLOWED_INTENTS = new Set([
  'deal_analysis',
  'pipeline_summary',
  'pipeline_window',
  'entity_lookup',
  'message_history',
  'drafting',
  'crm_mutation',
  'crm_lookup',
  'small_talk',
  'unknown',
]);

function createBaseContract() {
  return {
    version: 'intent-v2',
    classificationSource: 'heuristic',
    intent: 'unknown',
    executionPath: 'none',
    entityType: null,
    entityHintRaw: null,
    entityHint: null,
    entityId: null,
    zoomLevel: null,
    confidence: 0,
    forcePath: false,
    domains: [],
    isFollowUp: false,
    isCompound: false,
    isDataOrAction: false,
    mutationIntent: false,
    timeRangeHint: null,
    resolvedTimeRange: null,
    filters: null,
  };
}

function singularizeEntityType(rawType) {
  const lower = String(rawType || '').toLowerCase().trim();
  if (!lower) return null;
  if (['deal', 'deals', 'opportunity', 'opportunities'].includes(lower)) return 'deal';
  if (['contact', 'contacts'].includes(lower)) return 'contact';
  if (['account', 'accounts', 'company', 'companies'].includes(lower)) return 'account';
  return null;
}

function getReferencedEntities(entityContext, entityType) {
  if (!entityContext?.referencedEntities || !entityType) return [];
  const key = entityType === 'deal' ? 'deals' : entityType === 'contact' ? 'contacts' : 'accounts';
  return Array.isArray(entityContext.referencedEntities[key]) ? entityContext.referencedEntities[key] : [];
}

function normalizeForMatch(name, entityType) {
  return String(normalizeEntityHint(name, { entityType }) || '').toLowerCase();
}

function namesOverlap(left, right) {
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function preserveLeadingArticle(cleaned, entityType) {
  return entityType === 'account' && /^the\s+.+\bcompany\b/i.test(cleaned);
}

function stripTrailingEntitySuffix(cleaned, entityType) {
  if (entityType === 'deal') return cleaned.replace(DEAL_SUFFIX_PATTERN, '');
  if (entityType === 'contact') return cleaned.replace(CONTACT_SUFFIX_PATTERN, '');
  if (entityType === 'account') return cleaned.replace(ACCOUNT_SUFFIX_PATTERN, '');
  return cleaned;
}

function inferMentionedEntityType(message) {
  const lower = String(message || '').toLowerCase();
  if (/\b(deal|deals|dael|opportunity|opportunities)\b/.test(lower)) return 'deal';
  if (/\b(contact|contacts)\b/.test(lower)) return 'contact';
  if (/\b(account|accounts|company|companies)\b/.test(lower)) return 'account';
  return null;
}

function isDealContextCompoundQuery(message) {
  const raw = String(message || '');
  if (!raw.trim()) return false;
  return DEAL_CONTEXT_COMPOUND_PATTERNS.some((pattern) => pattern.test(raw));
}

function detectBareAccountCreateCommand(message) {
  const raw = String(message || '').trim();
  if (!raw) return null;

  const match = raw.match(BARE_ACCOUNT_CREATE_PATTERN);
  if (!match) return null;

  let target = String(match[1] || '').trim();
  if (!target) return null;

  if (/\b(deal|opportunity|contact|task|activity|meeting|call|email|note|report|pipeline|forecast)\b/i.test(target)) {
    return null;
  }

  if (
    /[$€£]\s*\d/.test(target)
    || /\b\d+(?:\.\d+)?\s*(?:k|m|b|mrr|arr)\b/i.test(target)
    || /@/.test(target)
    || /https?:\/\//i.test(target)
    || /\b(?:today|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|q[1-4])\b/i.test(target)
    || /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(target)
    || /\b\d{4}-\d{2}-\d{2}\b/.test(target)
  ) {
    return null;
  }

  target = target
    .replace(/^(?:the\s+)?(?:account|company)\s+/i, '')
    .replace(/\s+(?:account|company)\s*$/i, '')
    .trim();

  const entityHint = normalizeEntityHint(target, { entityType: 'account' });
  if (!entityHint) return null;

  return {
    entityType: 'account',
    entityHintRaw: target,
    entityHint,
  };
}

function normalizeIntentMessage(message) {
  return String(message || '')
    .replace(/\bdael\b/gi, 'deal')
    .replace(/\boppurtunit(?:y|ies)\b/gi, 'opportunity')
    .replace(/\bopprotunit(?:y|ies)\b/gi, 'opportunity');
}

function isNextStepGuidanceRequest(message) {
  return NEXT_STEP_GUIDANCE_PATTERNS.some((pattern) => pattern.test(String(message || '')));
}

function inferHeuristicTimeRangeHint(message) {
  const lower = String(message || '').toLowerCase();
  const relativeMatch = lower.match(/\bnext\s+(\d+)\s+(day|days|week|weeks|month|months)\b/);
  if (relativeMatch) {
    const unit = relativeMatch[2].endsWith('s') ? relativeMatch[2] : `${relativeMatch[2]}s`;
    return {
      kind: `relative_${unit}`,
      raw: relativeMatch[0],
      value: Number(relativeMatch[1]),
    };
  }

  const quarterMatch = lower.match(/\b(?:end of\s+)?q([1-4])\b|\bthis quarter\b|\bthis qtr\b/);
  if (quarterMatch) {
    const quarter = quarterMatch[1] ? Number(quarterMatch[1]) : null;
    return {
      kind: 'quarter_end',
      raw: quarterMatch[0],
      quarter: quarter || undefined,
    };
  }

  const seasonMatch = lower.match(/\b(spring|summer|fall|winter)\b/);
  if (seasonMatch) {
    return {
      kind: 'season',
      raw: seasonMatch[0],
      season: seasonMatch[1],
    };
  }

  if (/\b(soon|coming up|landing soon|upcoming|closable)\b/.test(lower)) {
    return { kind: 'soon', raw: 'soon' };
  }

  return null;
}

function resolvePrimaryEntity(entityContext) {
  const entityType = singularizeEntityType(entityContext?.primaryEntity?.type);
  if (!entityType || !entityContext?.primaryEntity?.id) return null;
  return {
    entityType,
    entityId: String(entityContext.primaryEntity.id),
    entityHintRaw: entityContext.primaryEntity.name || null,
    entityHint: normalizeEntityHint(entityContext.primaryEntity.name || '', { entityType }),
  };
}

function resolveSingleActiveEntity(activeContext) {
  const entityType = singularizeEntityType(activeContext?.lastEntityType);
  if (!entityType) return null;
  if (!Array.isArray(activeContext?.lastEntityIds) || activeContext.lastEntityIds.length !== 1) return null;
  return {
    entityType,
    entityId: String(activeContext.lastEntityIds[0]),
    entityHintRaw: Array.isArray(activeContext?.lastEntityNames) && activeContext.lastEntityNames.length === 1
      ? activeContext.lastEntityNames[0]
      : null,
    entityHint: Array.isArray(activeContext?.lastEntityNames) && activeContext.lastEntityNames.length === 1
      ? normalizeEntityHint(activeContext.lastEntityNames[0], { entityType })
      : null,
  };
}

function resolveContextEntity(entityContext, activeContext) {
  return resolvePrimaryEntity(entityContext) || resolveSingleActiveEntity(activeContext);
}

function findReferencedEntityMatch(entityContext, entityType, normalizedHint) {
  if (!entityContext?.referencedEntities || !normalizedHint) return null;
  const targetTypes = entityType ? [entityType] : ['deal', 'contact', 'account'];

  for (const targetType of targetTypes) {
    const entities = getReferencedEntities(entityContext, targetType);
    for (const entity of entities) {
      const normalizedName = normalizeForMatch(entity?.name || '', targetType);
      if (!normalizedName) continue;
      if (namesOverlap(normalizedHint, normalizedName)) {
        return {
          entityType: targetType,
          entityId: entity?.id ? String(entity.id) : null,
          entityHintRaw: entity?.name || null,
          entityHint: normalizeEntityHint(entity?.name || '', { entityType: targetType }),
        };
      }
    }
  }

  return null;
}

function extractEntityHint(message, entityType) {
  const raw = String(message || '').trim();
  if (!raw) return { entityHintRaw: null, entityHint: null };

  for (const pattern of ENTITY_EXTRACTION_PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const entityHintRaw = String(match[1] || '').trim();
    const entityHint = normalizeEntityHint(entityHintRaw, { entityType });
    return { entityHintRaw: entityHintRaw || null, entityHint };
  }

  for (const pattern of ENTITY_LOOKUP_EXTRACTION_PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const entityHintRaw = String(match[1] || '').trim();
    const entityHint = normalizeEntityHint(entityHintRaw, { entityType });
    return { entityHintRaw: entityHintRaw || null, entityHint };
  }

  return { entityHintRaw: null, entityHint: null };
}

function applyDealContextCompoundOverride(contract, message, contextEntity, mutationIntent) {
  if (mutationIntent || !isDealContextCompoundQuery(message)) return false;

  const extractedDeal = extractEntityHint(message, 'deal');
  contract.intent = 'entity_lookup';
  contract.executionPath = 'standard';
  contract.forcePath = false;
  contract.confidence = Math.max(Number(contract.confidence || 0), 0.88);
  contract.entityType = 'deal';

  if (contextEntity?.entityType === 'deal' && contextEntity.entityId && !extractedDeal.entityHint) {
    contract.entityId = contextEntity.entityId;
    contract.entityHintRaw = contextEntity.entityHintRaw || contract.entityHintRaw || null;
    contract.entityHint = contextEntity.entityHint || contract.entityHint || null;
  } else {
    contract.entityHintRaw = extractedDeal.entityHintRaw || contract.entityHintRaw || null;
    contract.entityHint = extractedDeal.entityHint || contract.entityHint || null;
  }

  ensureDomain(contract.domains, 'context');
  return true;
}

function determineZoomLevel(message) {
  const raw = String(message || '').trim();
  if (!raw) return null;
  if (/\b(strategic|deep dive|with history|account history|full context)\b/i.test(raw)) return 'strategic';
  if (/\b(tactical|quick|brief)\b/i.test(raw)) return 'tactical';
  return null;
}

function ensureDomain(domains, domain) {
  if (!domains.includes(domain)) domains.push(domain);
}

function resolveClassificationSource({ modelUsed, contextUsed, textHintUsed }) {
  if (modelUsed && contextUsed) return 'hybrid';
  if (modelUsed) return 'model';
  if (contextUsed && !textHintUsed) return 'context';
  if (contextUsed && textHintUsed) return 'hybrid';
  return 'heuristic';
}

function coerceIntent(rawIntent) {
  const normalized = String(rawIntent || '').trim();
  return ALLOWED_INTENTS.has(normalized) ? normalized : 'unknown';
}

function coerceConfidence(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function coerceTimeRangeHint(rawHint) {
  if (!rawHint || typeof rawHint !== 'object') return null;
  const kind = String(rawHint.kind || '').trim().toLowerCase();
  if (!kind) return null;

  const out = {
    kind,
    raw: String(rawHint.raw || rawHint.text || '').trim() || kind,
  };

  if (rawHint.value != null) out.value = Number(rawHint.value);
  if (rawHint.quarter != null) out.quarter = Number(rawHint.quarter);
  if (rawHint.month != null) out.month = Number(rawHint.month);
  if (rawHint.season != null) out.season = String(rawHint.season).toLowerCase();
  if (rawHint.start != null) out.start = String(rawHint.start);
  if (rawHint.end != null) out.end = String(rawHint.end);
  return out;
}

function applyIntentExecution(contract) {
  switch (contract.intent) {
    case 'deal_analysis':
      contract.executionPath = 'scoutpad';
      contract.forcePath = true;
      ensureDomain(contract.domains, 'coaching');
      break;
    case 'pipeline_summary':
    case 'pipeline_window':
      contract.executionPath = 'analytics';
      contract.forcePath = false;
      ensureDomain(contract.domains, 'analytics');
      break;
    case 'entity_lookup':
      contract.executionPath = 'standard';
      contract.forcePath = false;
      ensureDomain(contract.domains, 'context');
      break;
    case 'message_history':
      contract.executionPath = 'standard';
      contract.forcePath = false;
      ensureDomain(contract.domains, 'context');
      break;
    case 'drafting':
      contract.executionPath = 'standard';
      contract.forcePath = false;
      ensureDomain(contract.domains, 'intelligence');
      break;
    case 'crm_mutation':
      contract.executionPath = 'standard';
      contract.forcePath = false;
      break;
    case 'crm_lookup':
      contract.executionPath = 'standard';
      contract.forcePath = false;
      ensureDomain(contract.domains, 'search');
      break;
    case 'small_talk':
    case 'unknown':
    default:
      contract.executionPath = 'none';
      contract.forcePath = false;
      break;
  }

  return contract;
}

function applyResolvedEntity(contract, contextEntity, referencedMatch, normalizedHint, rawHint, modelEntityType, contextUsedDefault = false) {
  let contextUsed = contextUsedDefault;

  if (referencedMatch?.entityId) {
    contract.entityType = referencedMatch.entityType || contract.entityType || modelEntityType;
    contract.entityId = referencedMatch.entityId;
    contract.entityHintRaw = rawHint || referencedMatch.entityHintRaw || contract.entityHintRaw || null;
    contract.entityHint = normalizedHint || referencedMatch.entityHint || contract.entityHint || null;
    contextUsed = true;
  } else if (!normalizedHint && contextEntity?.entityId) {
    contract.entityType = contract.entityType || contextEntity.entityType;
    contract.entityId = contextEntity.entityId;
    contract.entityHintRaw = contextEntity.entityHintRaw || contract.entityHintRaw || null;
    contract.entityHint = contextEntity.entityHint || contract.entityHint || null;
    contextUsed = true;
  } else {
    contract.entityType = contract.entityType || modelEntityType || null;
    contract.entityHintRaw = rawHint || contract.entityHintRaw || null;
    contract.entityHint = normalizedHint || contract.entityHint || null;
  }

  return contextUsed;
}

export function normalizeEntityHint(name, options = {}) {
  if (!name) return null;

  const entityType = singularizeEntityType(options.entityType);
  let cleaned = String(name).trim();
  if (!cleaned) return null;

  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  cleaned = cleaned.replace(/\s*\?\s*(?:who|what|where|when|why|how|which)\b[\s\S]*$/i, '');
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');
  cleaned = cleaned.replace(/^(?:of|on|for)\s+/i, '');

  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(DASH_SUFFIX_PATTERN, '').trim();
  }

  cleaned = cleaned.replace(/[?!.,:;]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  if (!preserveLeadingArticle(cleaned, entityType)) {
    cleaned = cleaned.replace(/^(?:the|a|an)\s+/i, '').trim();
  }
  cleaned = cleaned.replace(/^(?:my|our|your|their)\s+/i, '').trim();

  cleaned = stripTrailingEntitySuffix(cleaned, entityType).replace(/[?!.,:;]+$/g, '').trim();
  if (!cleaned) return null;

  const lowered = cleaned.toLowerCase();
  if (GENERIC_PLACEHOLDERS.has(lowered)) return null;

  return cleaned;
}

export function interpretMessageIntentHeuristic(message, context = {}, overrides = {}) {
  const normalizedMessage = normalizeIntentMessage(message);
  const lower = String(normalizedMessage || '').toLowerCase().trim();
  const historyText = String(context?.historyText || '').toLowerCase();
  const estimatedDomains = estimateRelevantDomains(normalizedMessage);
  const normalizedDomains = Array.isArray(estimatedDomains) ? [...estimatedDomains] : [];
  const mutationIntent = inferMutationIntent({ message: normalizedMessage, domains: normalizedDomains });
  const isFollowUp = isLikelyFollowUpMessage(normalizedMessage);
  const isCompound = isCompoundRequest(normalizedMessage);
  const isDataOrAction = isDataOrActionRequest(normalizedMessage, historyText);
  const zoomLevel = determineZoomLevel(normalizedMessage);
  const contextEntity = resolveContextEntity(context?.entityContext, context?.activeContext);
  const mentionedEntityType = inferMentionedEntityType(normalizedMessage);
  const bareAccountCreate = detectBareAccountCreateCommand(normalizedMessage);
  const extractionEntityType = mentionedEntityType || contextEntity?.entityType || 'deal';
  const extractedHint = extractEntityHint(normalizedMessage, extractionEntityType);
  const referencedEntityMatch = findReferencedEntityMatch(
    context?.entityContext,
    contextEntity?.entityType === 'deal' ? 'deal' : extractionEntityType,
    extractedHint.entityHint ? extractedHint.entityHint.toLowerCase() : '',
  );

  const contract = createBaseContract();
  contract.zoomLevel = zoomLevel;
  contract.domains = normalizedDomains;
  contract.isFollowUp = isFollowUp;
  contract.isCompound = isCompound;
  contract.isDataOrAction = isDataOrAction;
  contract.mutationIntent = mutationIntent;
  contract.timeRangeHint = inferHeuristicTimeRangeHint(normalizedMessage);
  contract.resolvedTimeRange = resolveTimeRangeHint(contract.timeRangeHint, {
    now: overrides?.now instanceof Date ? overrides.now : new Date(),
  });

  if (!lower) {
    return contract;
  }

  contract.entityType = contextEntity?.entityType || mentionedEntityType || null;
  contract.entityId = contextEntity?.entityId || null;
  contract.entityHintRaw = extractedHint.entityHintRaw || contextEntity?.entityHintRaw || null;
  contract.entityHint = extractedHint.entityHint || contextEntity?.entityHint || null;

  if (referencedEntityMatch?.entityId) {
    contract.entityType = referencedEntityMatch.entityType || contract.entityType;
    contract.entityId = referencedEntityMatch.entityId;
    contract.entityHintRaw = extractedHint.entityHintRaw || referencedEntityMatch.entityHintRaw || contract.entityHintRaw;
    contract.entityHint = extractedHint.entityHint || referencedEntityMatch.entityHint || contract.entityHint;
  }

  const contextUsed = !!contextEntity?.entityId || !!referencedEntityMatch?.entityId;
  const textHintUsed = !!extractedHint.entityHint;
  contract.classificationSource = resolveClassificationSource({ modelUsed: false, contextUsed, textHintUsed });

  const smallTalk = SMALL_TALK_PATTERNS.some((pattern) => pattern.test(lower));
  if (smallTalk && !isDataOrAction) {
    contract.intent = 'small_talk';
    contract.executionPath = 'none';
    contract.confidence = 0.95;
    return contract;
  }

  if (MESSAGE_HISTORY_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    contract.intent = 'message_history';
    contract.executionPath = 'standard';
    contract.forcePath = false;
    contract.confidence = 0.82;
    contract.entityType = contract.entityType || mentionedEntityType || contextEntity?.entityType || 'account';
    ensureDomain(contract.domains, 'context');
    return contract;
  }

  if (DRAFTING_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    contract.intent = 'drafting';
    contract.executionPath = 'standard';
    contract.forcePath = false;
    contract.confidence = 0.84;
    contract.entityType = contract.entityType || contextEntity?.entityType || mentionedEntityType || null;
    ensureDomain(contract.domains, 'intelligence');
    return contract;
  }

  const hasAnalysisKeyword = ANALYSIS_INTENT.test(lower);
  const hasAnalyticsExclusion = ANALYTICS_EXCLUSION.test(lower);
  const hasTargetCue = TARGET_ENTITY_CUE.test(lower);
  const hasDealContext = contextEntity?.entityType === 'deal';
  const hasAnalysisTarget = hasTargetCue || hasDealContext || !!extractedHint.entityHint;
  const nextStepGuidance = isNextStepGuidanceRequest(normalizedMessage);
  const pipelineWindowLike = PIPELINE_WINDOW_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const pipelineLike = hasAnalyticsExclusion || isDirectPipelineSummaryRequest(normalizedMessage);

  if (applyDealContextCompoundOverride(contract, normalizedMessage, contextEntity, mutationIntent)) {
    contract.classificationSource = resolveClassificationSource({
      modelUsed: false,
      contextUsed,
      textHintUsed: !!contract.entityHint,
    });
    return contract;
  }

  if (pipelineWindowLike || /\bwhat'?s on my plate\b/.test(lower)) {
    contract.intent = contract.resolvedTimeRange ? 'pipeline_window' : 'pipeline_summary';
    contract.executionPath = 'analytics';
    contract.forcePath = false;
    contract.confidence = 0.84;
    contract.filters = normalizeIntentFilters(
      /\b(team|our|everyone)\b/.test(lower) ? { owner: 'team' } : { owner: 'current_user' },
      contract.intent,
    );
    ensureDomain(contract.domains, 'analytics');
    return contract;
  }

  if (hasAnalysisKeyword && !pipelineLike && hasAnalysisTarget) {
    contract.intent = 'deal_analysis';
    contract.executionPath = 'scoutpad';
    contract.forcePath = true;
    contract.confidence = 0.92;
    contract.entityType = contract.entityType || 'deal';
    ensureDomain(contract.domains, 'coaching');
    return contract;
  }

  if (pipelineLike) {
    contract.intent = 'pipeline_summary';
    contract.executionPath = 'analytics';
    contract.forcePath = false;
    contract.confidence = 0.85;
    contract.filters = normalizeIntentFilters(null, contract.intent);
    ensureDomain(contract.domains, 'analytics');
    return contract;
  }

  if (nextStepGuidance && (contextEntity?.entityId || extractedHint.entityHint || mentionedEntityType)) {
    contract.intent = 'entity_lookup';
    contract.executionPath = 'standard';
    contract.forcePath = false;
    contract.confidence = 0.86;
    contract.entityType = mentionedEntityType || contextEntity?.entityType || 'deal';
    ensureDomain(contract.domains, 'context');
    ensureDomain(contract.domains, 'intelligence');
    return contract;
  }

  if (
    (NATURAL_ENTITY_QUERY_PATTERNS.some((pattern) => pattern.test(normalizedMessage)) && (mentionedEntityType || contextEntity?.entityType || extractedHint.entityHint))
    || (!!extractedHint.entityHint && !!(mentionedEntityType || contextEntity?.entityType) && !mutationIntent && !pipelineLike)
    || /^(this deal|that deal|this contact|that contact|this account|that account|this one|that one|it)$/.test(lower)
  ) {
    contract.intent = 'entity_lookup';
    contract.executionPath = 'standard';
    contract.forcePath = false;
    contract.confidence = 0.78;
    contract.entityType = contract.entityType
      || mentionedEntityType
      || contextEntity?.entityType
      || (/deal/.test(lower) ? 'deal' : (/contact/.test(lower) ? 'contact' : (/account/.test(lower) ? 'account' : null)));
    ensureDomain(contract.domains, 'context');
    return contract;
  }

  // Scheduling requests should route as crm_mutation with scheduling domain prioritized
  const isSchedulingRequest = /\b(send\s+(?:a\s+)?meeting|schedule\s+(?:a\s+)?(?:meeting|call)|book\s+(?:a\s+)?(?:meeting|call)|meeting\s+invite|set\s+up\s+(?:a\s+)?call|calendar\s+invite)\b/i.test(lower);
  if (isSchedulingRequest) {
    contract.intent = 'crm_mutation';
    contract.executionPath = 'standard';
    contract.confidence = 0.85;
    ensureDomain(contract.domains, 'scheduling');
    return contract;
  }

  if (bareAccountCreate) {
    contract.intent = 'crm_mutation';
    contract.executionPath = 'standard';
    contract.forcePath = false;
    contract.confidence = 0.86;
    contract.entityType = 'account';
    contract.entityId = null;
    contract.entityHintRaw = bareAccountCreate.entityHintRaw;
    contract.entityHint = bareAccountCreate.entityHint;
    ensureDomain(contract.domains, 'create');
    return contract;
  }

  if (mutationIntent) {
    contract.intent = 'crm_mutation';
    contract.executionPath = 'standard';
    contract.confidence = 0.78;
    return contract;
  }

  if (isDataOrAction) {
    contract.intent = 'crm_lookup';
    contract.executionPath = 'standard';
    contract.confidence = 0.7;
    ensureDomain(contract.domains, 'search');
    return contract;
  }

  return contract;
}

export async function interpretMessageIntent(message, context = {}, overrides = {}) {
  const normalizedMessage = normalizeIntentMessage(message);
  const lower = String(normalizedMessage || '').toLowerCase().trim();
  if (!lower) {
    return createBaseContract();
  }

  const historyText = String(context?.historyText || '').toLowerCase();
  const estimatedDomains = estimateRelevantDomains(normalizedMessage);
  const normalizedDomains = Array.isArray(estimatedDomains) ? [...estimatedDomains] : [];
  const mutationIntent = inferMutationIntent({ message: normalizedMessage, domains: normalizedDomains });
  const isFollowUp = isLikelyFollowUpMessage(normalizedMessage);
  const isCompound = isCompoundRequest(normalizedMessage);
  const isDataOrAction = isDataOrActionRequest(normalizedMessage, historyText);
  const zoomLevel = determineZoomLevel(normalizedMessage);
  const contextEntity = resolveContextEntity(context?.entityContext, context?.activeContext);
  const bareAccountCreate = detectBareAccountCreateCommand(normalizedMessage);
  const now = overrides?.now instanceof Date ? overrides.now : new Date();

  const extractor = typeof overrides?.extractor === 'function'
    ? overrides.extractor
    : (inputMessage, inputContext) => extractIntentWithModel(inputMessage, inputContext, { now });

  let rawPayload = null;
  try {
    rawPayload = await extractor(message, context);
  } catch {
    rawPayload = null;
  }

  if (!rawPayload || typeof rawPayload !== 'object') {
    return interpretMessageIntentHeuristic(normalizedMessage, context, overrides);
  }

  const contract = createBaseContract();
  contract.zoomLevel = zoomLevel;
  contract.domains = normalizedDomains;
  contract.isFollowUp = isFollowUp;
  contract.isCompound = isCompound;
  contract.isDataOrAction = isDataOrAction;
  contract.mutationIntent = mutationIntent;

  contract.intent = coerceIntent(rawPayload.intent);
  contract.confidence = coerceConfidence(rawPayload.confidence, 0.7);
  contract.timeRangeHint = coerceTimeRangeHint(rawPayload.timeRangeHint || rawPayload.timeRange);
  contract.resolvedTimeRange = resolveTimeRangeHint(contract.timeRangeHint, { now });
  contract.filters = normalizeIntentFilters(rawPayload.filters, contract.intent);

  // Guard: don't let model override to deal_analysis when heuristic detects list/pipeline query
  if (contract.intent === 'deal_analysis' && isDirectPipelineSummaryRequest(normalizedMessage)) {
    contract.intent = 'pipeline_summary';
    contract.executionPath = 'analytics';
    contract.forcePath = false;
    contract.confidence = 0.88;
  }
  if (contract.intent === 'deal_analysis' && isNextStepGuidanceRequest(normalizedMessage)) {
    contract.intent = 'entity_lookup';
    contract.executionPath = 'standard';
    contract.forcePath = false;
    contract.confidence = Math.max(contract.confidence, 0.86);
    ensureDomain(contract.domains, 'context');
    ensureDomain(contract.domains, 'intelligence');
  }

  const mentionedEntityType = inferMentionedEntityType(normalizedMessage);
  const modelEntityType = singularizeEntityType(rawPayload.entityType) || mentionedEntityType || null;
  const rawHint = String(rawPayload.entityHintRaw || rawPayload.entityHint || '').trim() || null;
  const normalizedHint = normalizeEntityHint(rawPayload.entityHint || rawHint || '', { entityType: modelEntityType });
  const referencedEntityMatch = normalizedHint
    ? findReferencedEntityMatch(context?.entityContext, modelEntityType || contextEntity?.entityType, normalizedHint.toLowerCase())
    : null;

  contract.entityType = modelEntityType;
  const contextUsed = applyResolvedEntity(contract, contextEntity, referencedEntityMatch, normalizedHint, rawHint, modelEntityType);
  contract.classificationSource = resolveClassificationSource({
    modelUsed: true,
    contextUsed,
    textHintUsed: !!normalizedHint,
  });

  if (!contract.entityType && contextEntity?.entityType && !normalizedHint) {
    contract.entityType = contextEntity.entityType;
  }

  if (applyDealContextCompoundOverride(contract, normalizedMessage, contextEntity, mutationIntent)) {
    contract.classificationSource = resolveClassificationSource({
      modelUsed: true,
      contextUsed: !!contextEntity?.entityId,
      textHintUsed: !!contract.entityHint,
    });
  }

  if (contract.intent === 'unknown') {
    const heuristic = interpretMessageIntentHeuristic(normalizedMessage, context, overrides);
    heuristic.timeRangeHint = contract.timeRangeHint || heuristic.timeRangeHint || null;
    heuristic.resolvedTimeRange = contract.resolvedTimeRange || heuristic.resolvedTimeRange || null;
    heuristic.filters = contract.filters || heuristic.filters || null;
    if (heuristic.classificationSource === 'heuristic' || heuristic.classificationSource === 'context') {
      heuristic.classificationSource = resolveClassificationSource({
        modelUsed: false,
        contextUsed: !!contextEntity?.entityId,
        textHintUsed: !!heuristic.entityHint,
      });
    }
    return heuristic;
  }

  if (bareAccountCreate && (contract.intent === 'crm_lookup' || contract.intent === 'entity_lookup' || contract.intent === 'small_talk')) {
    contract.intent = 'crm_mutation';
    contract.entityType = 'account';
    contract.entityId = null;
    contract.entityHintRaw = bareAccountCreate.entityHintRaw;
    contract.entityHint = bareAccountCreate.entityHint;
    contract.confidence = Math.max(contract.confidence, 0.84);
    ensureDomain(contract.domains, 'create');
    contract.classificationSource = resolveClassificationSource({
      modelUsed: false,
      contextUsed,
      textHintUsed: true,
    });
  } else if (bareAccountCreate && contract.intent === 'crm_mutation') {
    contract.entityType = contract.entityType || 'account';
    contract.entityHintRaw = contract.entityHintRaw || bareAccountCreate.entityHintRaw;
    contract.entityHint = contract.entityHint || bareAccountCreate.entityHint;
    ensureDomain(contract.domains, 'create');
  }

  if (contract.intent === 'small_talk' && !isDataOrAction) {
    contract.executionPath = 'none';
    contract.forcePath = false;
  }

  if (contract.intent === 'crm_mutation') {
    contract.entityType = contract.entityType || contextEntity?.entityType || null;
  }

  applyIntentExecution(contract);
  return contract;
}

export function shouldForceDeterministicPath(contract) {
  return contract?.executionPath === 'scoutpad'
    && contract?.forcePath === true
    && Number(contract?.confidence || 0) >= 0.8;
}
