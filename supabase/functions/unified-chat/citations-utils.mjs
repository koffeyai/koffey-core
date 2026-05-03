const TOOL_TABLE_HINTS = {
  search_crm: null,
  semantic_search: null,
  create_deal: 'deals',
  update_deal: 'deals',
  delete_deal: 'deals',
  analyze_deal: 'deals',
  create_contact: 'contacts',
  update_contact: 'contacts',
  create_account: 'accounts',
  update_account: 'accounts',
  create_task: 'tasks',
  get_tasks: 'tasks',
  complete_task: 'tasks',
  create_activity: 'activities',
  get_pipeline_stats: 'deals',
  get_sales_cycle_analytics: 'deals',
  get_pipeline_velocity: 'deals',
  get_activity_stats: 'activities',
  enrich_contacts: 'contacts',
  get_lead_scores: 'contacts',
  get_lead_funnel: 'contacts',
  query_web_events: 'web_events',
  get_attribution: 'deals',
  get_audit_trail: 'audit_logs',
  manage_custom_fields: 'custom_fields',
  get_deal_context: null,
  get_contact_context: null,
  get_entity_messages: null,
  get_pipeline_context: null,
};

const NON_DB_TOOLS = new Set([
  'check_availability',
  'send_scheduling_email',
  'schedule_meeting',
  'draft_email',
  'generate_presentation',
]);

const STRICT_EVIDENCE_TOOLS = new Set([
  'search_crm',
  'semantic_search',
  'analyze_deal',
  'get_pipeline_stats',
  'get_sales_cycle_analytics',
  'get_pipeline_velocity',
  'get_activity_stats',
  'get_tasks',
  'get_lead_scores',
  'get_lead_funnel',
  'get_deal_context',
  'get_contact_context',
  'get_entity_messages',
  'get_pipeline_context',
]);

const ADVISORY_WORKFLOW_TOOLS = new Set([
  ...NON_DB_TOOLS,
  'create_deal',
  'create_contact',
  'create_account',
  'create_task',
  'create_activity',
  'update_deal',
  'delete_deal',
  'update_contact',
  'update_account',
  'complete_task',
  'update_stakeholder_role',
  'enrich_contacts',
]);

const STRICT_ROUTING_TASK_CLASSES = new Set([
  'crm_read',
  'analytics',
  'scoutpad',
]);

const GENERATIVE_ACTION_INTENT_PATTERN = /\b(draft|compose|write|email|follow[\s-]?up|reply|subject line|next steps?|cta|message)\b/i;
const FACTUAL_SIGNAL_PATTERN = /(?:\$\s?\d|\b\d{1,3}(?:,\d{3})+\b|\b\d+\s?%|\b\d+(?:\.\d+)?\s?(?:k|m|b)\b|\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*20\d{2})?\b)/i;
const FACTUAL_CONTEXT_PATTERN = /\b(total|weighted|pipeline|forecast|close(?: date| dates)?|stale deals?|conversion|velocity|ranking|top deals?|records?|count)\b/i;
const FACTUAL_REQUEST_VERB_PATTERN = /\b(what(?:'s| is)?|how many|how much|show|list|find|lookup|is there|are there|does|which|summari[sz]e|analy[sz]e)\b/i;
const FACTUAL_REQUEST_NOUN_PATTERN = /\b(deals?|contacts?|accounts?|pipeline|forecast|revenue|opportunit(?:y|ies)|close(?: date| dates)?|stage|value|amount|probability|stats?|analytics?|crm)\b/i;

const ENTITY_GROUNDING_TOOLS = new Set([
  'search_crm',
  'get_pipeline_stats',
  'get_sales_cycle_analytics',
  'get_pipeline_velocity',
  'analyze_deal',
  'get_deal_context',
  'get_contact_context',
  'get_pipeline_context',
  'get_entity_messages',
]);

const ENTITY_SNAPSHOT_FIELDS = ['name', 'full_name', 'account_name', 'contact_name', 'company', 'title'];

const ROW_LEVEL_REQUIRED_TOOLS = new Set([
  'search_crm',
  'create_deal',
  'update_deal',
  'delete_deal',
  // analyze_deal is advisory (opens coaching dialog) — no row-level citations expected
  'create_contact',
  'update_contact',
  'create_account',
  'update_account',
  'create_task',
  'get_tasks',
  'complete_task',
  'get_deal_context',
  'get_contact_context',
  'get_pipeline_context',
  'get_entity_messages',
  'create_activity',
]);

const TABLE_TO_VIEW = {
  deals: 'deals',
  contacts: 'contacts',
  accounts: 'accounts',
  activities: 'activities',
  tasks: 'tasks',
};

const TABLE_TO_ENTITY = {
  deals: 'deal',
  contacts: 'contact',
  accounts: 'account',
  activities: 'activity',
  tasks: 'task',
};

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isPendingWorkflowResult(result) {
  if (!isObject(result) || result.error) return false;
  if (result._needsInput === true || result._needsConfirmation === true || result._needsLossReason === true) {
    return true;
  }
  if (result.success === false && !result.id && !Array.isArray(result.results) && !result.rowId) {
    return true;
  }
  return false;
}

function normalizeString(value, maxLen = 120) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function normalizeTableName(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;

  const singularMap = {
    deal: 'deals',
    contact: 'contacts',
    account: 'accounts',
    activity: 'activities',
    task: 'tasks',
  };
  if (singularMap[text]) return singularMap[text];
  if (text.endsWith('s')) return text;
  return `${text}s`;
}

function sanitizeQueryArgs(args) {
  if (!isObject(args)) return null;
  const safe = {};
  const allowed = [
    'entity_type',
    'query',
    'list_all',
    'filters',
    'sort_by',
    'sort_direction',
    'date_from',
    'date_to',
    'team_view',
    'rep_name',
    'group_by',
    'analysis_type',
    'amount_min',
    'amount_max',
    'deal_id',
    'deal_name',
    'account_name',
    'contact_name',
    'time_period',
  ];

  for (const key of allowed) {
    if (args[key] === undefined || args[key] === null) continue;
    const value = args[key];
    if (typeof value === 'string') {
      safe[key] = normalizeString(value, 120);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = value.slice(0, 8).map((item) => normalizeString(item, 80) ?? item).filter(Boolean);
    } else if (isObject(value)) {
      const nested = {};
      for (const nestedKey of Object.keys(value).slice(0, 12)) {
        const nestedValue = value[nestedKey];
        if (typeof nestedValue === 'string') nested[nestedKey] = normalizeString(nestedValue, 120);
        else if (typeof nestedValue === 'number' || typeof nestedValue === 'boolean') nested[nestedKey] = nestedValue;
        else if (Array.isArray(nestedValue)) nested[nestedKey] = nestedValue.slice(0, 8).map((item) => normalizeString(item, 80) ?? item).filter(Boolean);
      }
      safe[key] = nested;
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

function pickSnapshot(table, row) {
  if (!isObject(row)) return null;
  const fieldsByTable = {
    deals: ['id', 'name', 'stage', 'amount', 'probability', 'expected_close_date', 'account_id', 'contact_id', 'updated_at'],
    contacts: ['id', 'name', 'full_name', 'first_name', 'last_name', 'email', 'company', 'title', 'phone', 'position', 'account_id', 'updated_at'],
    accounts: ['id', 'name', 'domain', 'website', 'industry', 'phone', 'updated_at'],
    activities: ['id', 'title', 'type', 'status', 'scheduled_at', 'activity_date', 'deal_id', 'contact_id', 'updated_at'],
    tasks: ['id', 'title', 'status', 'priority', 'due_date', 'deal_id', 'contact_id', 'updated_at'],
    deal_notes: ['id', 'content', 'note_type', 'created_at'],
    campaigns: ['id', 'name', 'status', 'enrolled_at'],
  };

  const preferred = fieldsByTable[table] || ['id', 'name', 'title', 'full_name', 'updated_at'];
  const snapshot = {};
  for (const key of preferred) {
    if (row[key] === undefined || row[key] === null) continue;
    const value = row[key];
    if (typeof value === 'string') snapshot[key] = normalizeString(value, 200);
    else if (typeof value === 'number' || typeof value === 'boolean') snapshot[key] = value;
  }

  if (isObject(row.accounts) && row.accounts.name && !snapshot.account_name) {
    snapshot.account_name = normalizeString(row.accounts.name, 120);
  }
  if (isObject(row.contacts) && row.contacts.full_name && !snapshot.contact_name) {
    snapshot.contact_name = normalizeString(row.contacts.full_name, 120);
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

function inferTableFromToolResult(toolName, args, result, row) {
  const hinted = normalizeTableName(TOOL_TABLE_HINTS[toolName]);
  if (hinted) return hinted;

  // Context RPCs tag rows with their source table during extraction
  if (row && row.__contextTable) {
    return normalizeTableName(row.__contextTable);
  }

  if (toolName === 'search_crm') {
    const fromResult = normalizeTableName(result?.entity_type);
    if (fromResult) return fromResult;
    const fromArgs = normalizeTableName(args?.entity_type);
    if (fromArgs) return fromArgs;
  }

  if (row) {
    if (row.expected_close_date !== undefined || row.probability !== undefined || row.stage !== undefined) return 'deals';
    if (row.full_name !== undefined || row.first_name !== undefined || row.last_name !== undefined) return 'contacts';
    if (row.domain !== undefined || row.website !== undefined || row.industry !== undefined) return 'accounts';
    if (row.activity_date !== undefined || row.scheduled_at !== undefined || row.type !== undefined) return 'activities';
    if (row.due_date !== undefined || row.priority !== undefined || row.completed !== undefined) return 'tasks';
  }

  return null;
}

function getRowId(row) {
  if (!isObject(row)) return null;
  if (row.id !== undefined && row.id !== null) return String(row.id);
  if (row.deal_id !== undefined && row.deal_id !== null) return String(row.deal_id);
  if (row.contact_id !== undefined && row.contact_id !== null) return String(row.contact_id);
  if (row.account_id !== undefined && row.account_id !== null) return String(row.account_id);
  return null;
}

function buildUiLink(table, rowId) {
  const view = TABLE_TO_VIEW[table];
  const entityType = TABLE_TO_ENTITY[table];
  if (!view || !entityType || !rowId) return null;
  return {
    view,
    entityType,
    entityId: String(rowId),
  };
}

function extractCandidateRows(result) {
  const rows = [];
  if (!isObject(result)) return rows;

  if (result.__forceNoCitations === true) {
    return rows;
  }

  if (Array.isArray(result.__citationRows)) {
    return result.__citationRows.filter(isObject);
  }

  if (Array.isArray(result.results)) {
    rows.push(...result.results.filter(isObject));
  }

  const primaryKeys = ['deal', 'contact', 'account', 'task', 'activity', 'existing'];
  for (const key of primaryKeys) {
    if (isObject(result[key])) rows.push(result[key]);
  }

  const listKeys = ['deals', 'contacts', 'accounts', 'tasks', 'activities'];
  for (const key of listKeys) {
    if (Array.isArray(result[key])) {
      rows.push(...result[key].filter(isObject));
    }
  }

  // Context RPC singular keys (not in standard primaryKeys)
  const contextSingularKeys = { primary_contact: 'contacts', lead_score: 'lead_scores' };
  for (const [key, table] of Object.entries(contextSingularKeys)) {
    if (isObject(result[key])) {
      const row = result[key];
      row.__contextTable = table;
      rows.push(row);
    }
  }

  // Context RPC array keys (not in standard listKeys)
  const contextArrayKeys = {
    stakeholders: 'contacts',
    recent_activities: 'activities',
    open_tasks: 'tasks',
    deal_notes: 'deal_notes',
    active_deals: 'deals',
    campaigns: 'campaigns',
    at_risk: 'deals',
    closing_soon: 'deals',
    recent_wins: 'deals',
    recent_losses: 'deals',
    messages: 'messages',
  };
  for (const [key, table] of Object.entries(contextArrayKeys)) {
    if (Array.isArray(result[key])) {
      for (const item of result[key].filter(isObject)) {
        item.__contextTable = table;
        rows.push(item);
      }
    }
  }

  if (isObject(result) && result.id != null) {
    rows.push(result);
  }

  return rows;
}

function normalizeCitation(citation) {
  if (!isObject(citation)) return null;
  return {
    id: normalizeString(citation.id, 80),
    kind: citation.kind === 'derived' ? 'derived' : 'retrieved',
    table: normalizeTableName(citation.table) || 'unknown',
    rowId: citation.rowId ? String(citation.rowId) : null,
    columns: Array.isArray(citation.columns)
      ? citation.columns.map((c) => normalizeString(c, 60)).filter(Boolean).slice(0, 12)
      : [],
    sourceTool: normalizeString(citation.sourceTool, 80) || 'unknown_tool',
    valueSnapshot: isObject(citation.valueSnapshot) ? citation.valueSnapshot : null,
    query: isObject(citation.query) ? citation.query : null,
    derivedFrom: Array.isArray(citation.derivedFrom)
      ? citation.derivedFrom.map((c) => normalizeString(c, 80)).filter(Boolean).slice(0, 12)
      : [],
    uiLink: isObject(citation.uiLink) ? citation.uiLink : null,
    evidenceText: normalizeString(citation.evidenceText, 240),
  };
}

function dedupeCitations(citations) {
  const seen = new Set();
  const out = [];
  for (const raw of citations || []) {
    const citation = normalizeCitation(raw);
    if (!citation) continue;
    const key = [
      citation.kind,
      citation.table,
      citation.rowId || '',
      citation.sourceTool,
      (citation.columns || []).join(','),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out;
}

function normalizeEntityLabel(value) {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMutationWorkflowTool(toolName) {
  return String(toolName || '').startsWith('create_')
    || String(toolName || '').startsWith('update_')
    || String(toolName || '').startsWith('delete_')
    || toolName === 'complete_task'
    || toolName === 'enrich_contacts';
}

function hasFactualSignalLine(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^[>#]/.test(text)) return false;

  const hasQuantSignal = FACTUAL_SIGNAL_PATTERN.test(text);
  const hasNumericToken = /\b\d+(?:,\d{3})*(?:\.\d+)?\b/.test(text);
  const hasContextualMetric = FACTUAL_CONTEXT_PATTERN.test(text) && hasNumericToken;
  const listLike = /^\s*(?:\d+\.\s+|[-*]\s+)/.test(text);

  if (hasQuantSignal) return true;
  if (hasContextualMetric) return true;
  if (listLike && (hasQuantSignal || hasContextualMetric)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text)) return true;
  return false;
}

function detectFactualRequestIntent(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  const hasVerb = FACTUAL_REQUEST_VERB_PATTERN.test(text);
  const hasDomainNoun = FACTUAL_REQUEST_NOUN_PATTERN.test(text);
  const hasMetricCue = FACTUAL_CONTEXT_PATTERN.test(text);
  const existenceQuery = /\b(is|are)\s+.*\b(in (?:the )?system|existing|exists?)\b/i.test(text);

  if (existenceQuery) return true;
  if (hasMetricCue) return true;
  return hasVerb && hasDomainNoun;
}

function detectFactualSignalsInText(value) {
  const source = String(value || '').trim();
  if (!source) return false;
  if (hasFactualSignalLine(source)) return true;
  return source.split('\n').some((line) => hasFactualSignalLine(line));
}

export function detectFactualClaims({ message, response }) {
  const responseSignals = detectFactualSignalsInText(response);
  if (responseSignals) return true;

  // Message text alone should not trigger strict mode unless it is clearly factual.
  return detectFactualRequestIntent(message) && detectFactualSignalsInText(message);
}

function hasSuccessfulStrictEvidenceOperation(operations) {
  return (operations || []).some((op) => {
    const tool = String(op?.tool || '');
    return STRICT_EVIDENCE_TOOLS.has(tool) && !op?.result?.error;
  });
}

function hasAdvisoryWorkflowOperation(operations) {
  return (operations || []).some((op) => {
    const tool = String(op?.tool || '');
    return ADVISORY_WORKFLOW_TOOLS.has(tool) || isMutationWorkflowTool(tool);
  });
}

export function hasCitationRelevantOperation(crmOperations) {
  const operations = Array.isArray(crmOperations) ? crmOperations : [];
  return operations.some((op) => {
    const tool = String(op?.tool || '').trim();
    if (!tool) return false;
    if (NON_DB_TOOLS.has(tool)) return false;
    if (isMutationWorkflowTool(tool)) return false;
    if (op?.result?.error) return false;
    if (isPendingWorkflowResult(op?.result)) return false;
    return true;
  });
}

export function hasOnlyPendingWorkflowOperations(crmOperations) {
  const operations = Array.isArray(crmOperations) ? crmOperations : [];
  if (operations.length === 0) return false;

  const successfulOps = operations.filter((op) => !op?.result?.error);
  if (successfulOps.length === 0) return false;

  return successfulOps.every((op) => isPendingWorkflowResult(op?.result));
}

export function determineVerificationPolicy({
  message,
  response,
  crmOperations,
  routingTaskClass,
  dataOrActionRequest,
}) {
  const operations = Array.isArray(crmOperations) ? crmOperations : [];
  const safeTaskClass = String(routingTaskClass || '').trim().toLowerCase();
  const hasStrictEvidenceOps = hasSuccessfulStrictEvidenceOperation(operations);
  const hasAdvisoryOps = hasAdvisoryWorkflowOperation(operations);
  const factualClaimsDetected = detectFactualClaims({ message, response });
  const factualRequestIntentDetected = detectFactualRequestIntent(message);
  const generativeIntentDetected = GENERATIVE_ACTION_INTENT_PATTERN.test(String(message || ''));
  const strictTaskClass = STRICT_ROUTING_TASK_CLASSES.has(safeTaskClass);
  const strictTaskClassTriggered = strictTaskClass && (!generativeIntentDetected || factualRequestIntentDetected);
  const factualEscalationAllowed = !generativeIntentDetected || factualRequestIntentDetected || hasStrictEvidenceOps;
  const pendingWorkflowOnly = hasOnlyPendingWorkflowOperations(operations);

  if (pendingWorkflowOnly && !hasStrictEvidenceOps) {
    return {
      policy: 'none',
      mixed_intent: false,
      factual_claims_detected: false,
      strict_triggered: false,
      advisory_triggered: true,
    };
  }

  const strictTriggered = hasStrictEvidenceOps
    || factualRequestIntentDetected
    || strictTaskClassTriggered
    || (factualClaimsDetected && factualEscalationAllowed);
  const advisoryTriggered = hasAdvisoryOps || generativeIntentDetected || operations.some((op) => isMutationWorkflowTool(String(op?.tool || '')));
  const mixedIntent = strictTriggered && advisoryTriggered;

  let policy = 'none';
  if (strictTriggered) {
    policy = 'strict';
  } else if (advisoryTriggered || dataOrActionRequest || operations.length > 0) {
    policy = 'advisory';
  }

  return {
    policy,
    mixed_intent: mixedIntent,
    factual_claims_detected: factualClaimsDetected,
    strict_triggered: strictTriggered,
    advisory_triggered: advisoryTriggered,
  };
}

export function redactFactualClaimsForMixedIntent(response) {
  const lines = String(response || '').split('\n');
  const kept = [];
  let redactedLineCount = 0;

  for (const line of lines) {
    if (hasFactualSignalLine(line)) {
      redactedLineCount += 1;
      continue;
    }
    kept.push(line);
  }

  const compact = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const fallback = 'I completed the action-oriented part of your request, but withheld factual claims that could not be verified.';

  return {
    response: compact || fallback,
    redacted: redactedLineCount > 0,
    redactedLineCount,
  };
}

export function buildVerificationUserSummary(failedChecks, context = {}) {
  const checks = Array.isArray(failedChecks) ? failedChecks.map((c) => String(c || '')) : [];
  const policy = String(context.policy || 'none');
  const sourceStatus = String(context.sourceStatus || 'not_applicable');

  if (checks.length === 0) {
    if (sourceStatus === 'source_backed') return 'Source-backed response. Use citations below to verify the referenced records.';
    if (sourceStatus === 'source_gap') return 'Response generated without complete source evidence for all claims.';
    return null;
  }

  const messages = [];
  if (checks.some((check) => check.startsWith('TOOL_ERRORS:'))) {
    messages.push('One or more tools failed while gathering evidence.');
  }
  if (checks.includes('NO_SUCCESSFUL_DATA_OPERATION')) {
    messages.push('No successful data retrieval operation completed.');
  }
  if (checks.includes('NO_CITATIONS')) {
    messages.push('No supporting database citations were produced.');
  }
  if (checks.some((check) => check.startsWith('MISSING_TOOL_CITATIONS:'))) {
    messages.push('At least one tool result is missing citation evidence.');
  }
  if (checks.some((check) => check.startsWith('MISSING_ROW_LEVEL_CITATIONS:'))) {
    messages.push('Row-level evidence is missing for at least one operation.');
  }
  if (checks.some((check) => check.startsWith('UNSUPPORTED_RESPONSE_ENTITIES:'))) {
    messages.push('Some entities in the response are not supported by retrieved evidence.');
  }
  if (checks.includes('UNCERTAIN_LANGUAGE_WITHOUT_EVIDENCE')) {
    messages.push('The response used uncertain language without evidence.');
  }
  if (checks.includes('UNIFIED_CHAT_EXCEPTION')) {
    messages.push('The assistant encountered an internal processing error.');
  }

  if (messages.length === 0) {
    return policy === 'strict'
      ? 'Verification failed under strict evidence checks.'
      : 'Source verification is incomplete for parts of this response.';
  }

  return messages.slice(0, 2).join(' ');
}

function hasListLikeStructure(responseText) {
  return /(?:^|\n)\s*(?:\d+\.\s+|[-*]\s+)/m.test(responseText);
}

function shouldSkipEntityCandidate(candidate) {
  if (!candidate) return true;
  if (candidate.length < 3) return true;
  if (/\d/.test(candidate)) return true;
  if (candidate.includes(':')) return true;
  return /\b(total|weighted|stale|deals?|deal|value|close|stage|pipeline|summary|quarter|month|week|forecast|probability)\b/i.test(candidate);
}

function extractListedResponseEntities(responseText) {
  const lines = String(responseText || '').split('\n');
  const out = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:\d+\.\s+|[-*]\s+)(.+)$/);
    if (!match) continue;
    let candidate = String(match[1] || '').trim();
    if (!candidate) continue;

    candidate = candidate
      .split(/\s[—–]\s|\s\|\s|\s-\s/)[0]
      .replace(/\(.*?\)\s*$/, '')
      .trim();
    if (shouldSkipEntityCandidate(candidate)) continue;

    const normalized = normalizeEntityLabel(candidate);
    if (normalized && !shouldSkipEntityCandidate(normalized)) out.push(normalized);
  }
  return Array.from(new Set(out));
}

function collectEvidenceEntityLabels(citations) {
  const labels = new Set();
  for (const citation of citations || []) {
    if (citation?.kind !== 'retrieved') continue;
    const snapshot = citation?.valueSnapshot;
    if (!isObject(snapshot)) continue;
    for (const key of ENTITY_SNAPSHOT_FIELDS) {
      const normalized = normalizeEntityLabel(snapshot[key]);
      if (normalized) labels.add(normalized);
    }
  }
  return labels;
}

function isEntitySupportedByEvidence(entityLabel, evidenceLabels) {
  if (!entityLabel) return true;
  if (evidenceLabels.has(entityLabel)) return true;
  const entityTokens = entityLabel.split(/\s+/).filter(Boolean);

  for (const evidence of evidenceLabels) {
    const evidenceTokens = evidence.split(/\s+/).filter(Boolean);
    // Allow acronym/entity-token grounding (e.g. "ups" in "ups infrastructure expansion").
    if (entityLabel.length <= 4 && evidenceTokens.includes(entityLabel)) return true;
    if (entityTokens.length > 1 && entityTokens.every((token) => evidenceTokens.includes(token))) return true;

    const overlap = Math.min(entityLabel.length, evidence.length);
    if (overlap < 4) continue;
    if (evidence.includes(entityLabel) || entityLabel.includes(evidence)) return true;
  }
  return false;
}

function findUnsupportedResponseEntities(responseText, citations) {
  const mentioned = extractListedResponseEntities(responseText);
  if (mentioned.length === 0) return [];
  const evidenceLabels = collectEvidenceEntityLabels(citations);
  if (evidenceLabels.size === 0) return [];
  return mentioned.filter((label) => !isEntitySupportedByEvidence(label, evidenceLabels)).slice(0, 8);
}

function shouldEnforceEntityGrounding(operations, responseText) {
  if (!hasListLikeStructure(responseText)) return false;
  return (operations || []).some((op) => {
    const tool = String(op?.tool || '');
    return ENTITY_GROUNDING_TOOLS.has(tool) && !op?.result?.error;
  });
}

function detectNegativeResultClaim(responseText) {
  const text = String(responseText || '').trim().toLowerCase();
  if (!text) return false;
  return /\b(no matching records|no open deals found|no deals (?:are )?(?:scheduled|slated)|no deal\b|no contact\b|no account\b|couldn't find|could not find|i couldn't find|i searched .* but found no|not found)\b/.test(text);
}

function detectRetrievalFailureClaim(responseText) {
  const text = String(responseText || '').trim().toLowerCase();
  if (!text) return false;
  return /\b(query didn't execute properly|could not retrieve|couldn't retrieve|trouble generating a clear response|tool returned an error|data lookup failed|i hit a temporary model provider issue)\b/.test(text);
}

function buildDerivedCitation(toolName, args, result, baseId = null) {
  const table = inferTableFromToolResult(toolName, args, result, null) || 'unknown';
  const snapshot = {};
  const candidates = [
    'count',
    'total_count',
    'totalDeals',
    'totalValue',
    'weightedValue',
    'staleDeals',
    'message',
  ];
  for (const key of candidates) {
    if (result?.[key] === undefined || result?.[key] === null) continue;
    const value = result[key];
    if (typeof value === 'string') snapshot[key] = normalizeString(value, 220);
    else if (typeof value === 'number' || typeof value === 'boolean') snapshot[key] = value;
  }

  if (Object.keys(snapshot).length === 0) return null;

  return {
    id: `${toolName}:derived:${baseId || '0'}`,
    kind: 'derived',
    table,
    rowId: null,
    columns: Object.keys(snapshot).slice(0, 12),
    sourceTool: toolName,
    valueSnapshot: snapshot,
    query: sanitizeQueryArgs(args),
    derivedFrom: [],
    uiLink: null,
    evidenceText: 'Derived from database query results returned by the tool.',
  };
}

export function collectCitationsFromToolExecution(toolName, args, result) {
  if (!toolName || result?.error) return [];
  if (result?.__forceNoCitations === true) return [];
  if (isPendingWorkflowResult(result)) return [];

  const citations = [];
  const rows = extractCandidateRows(result).slice(0, 20);
  let index = 0;

  for (const row of rows) {
    const rowId = getRowId(row);
    const table = inferTableFromToolResult(toolName, args, result, row);
    if (!rowId || !table) continue;

    const snapshot = pickSnapshot(table, row);
    citations.push({
      id: `${toolName}:${table}:${rowId}:${index++}`,
      kind: 'retrieved',
      table,
      rowId,
      columns: snapshot ? Object.keys(snapshot).slice(0, 12) : [],
      sourceTool: toolName,
      valueSnapshot: snapshot,
      query: sanitizeQueryArgs(args),
      derivedFrom: [],
      uiLink: buildUiLink(table, rowId),
      evidenceText: `Retrieved directly from ${table} row ${rowId}.`,
    });
  }

  const hasRows = citations.some((c) => c.kind === 'retrieved');
  if (!hasRows) {
    const derived = buildDerivedCitation(toolName, args, result, String(index));
    if (derived) citations.push(derived);
  }

  return dedupeCitations(citations).slice(0, 25);
}

export function collectCitationsFromOperations(crmOperations) {
  const all = [];
  for (const op of crmOperations || []) {
    const toolName = String(op?.tool || '').trim();
    if (!toolName) continue;
    if (isMutationWorkflowTool(toolName)) continue;
    const opCitations = collectCitationsFromToolExecution(toolName, op?.args || {}, op?.result || {});
    all.push(...opCitations);
  }
  return dedupeCitations(all).slice(0, 60);
}

function shouldRequireCitationForTool(toolName, result) {
  if (!toolName || NON_DB_TOOLS.has(toolName)) return false;
  if (isMutationWorkflowTool(toolName)) return false;
  if (result?.error) return false;
  return true;
}

function shouldRequireRowEvidenceForOperation(op) {
  const toolName = String(op?.tool || '');
  if (isMutationWorkflowTool(toolName)) return false;
  if (!ROW_LEVEL_REQUIRED_TOOLS.has(toolName)) return false;
  const result = op?.result || {};
  if (isPendingWorkflowResult(result)) return false;

  const explicitId = result?.id != null;
  const resultRows = Array.isArray(result?.results) ? result.results.length : 0;
  const resultCount = Number(result?.count || result?.total_count || result?.totalDeals || resultRows || (explicitId ? 1 : 0));

  if (toolName.startsWith('create_') || toolName.startsWith('update_') || toolName === 'complete_task') {
    return true;
  }

  if (toolName === 'analyze_deal') {
    return result?.success === true;
  }

  return resultCount > 0;
}

export function buildStrictVerification({
  requiresVerification,
  crmOperations,
  citations,
  response,
}) {
  const operations = Array.isArray(crmOperations) ? crmOperations : [];
  const safeCitations = Array.isArray(citations) ? citations : [];
  const failedChecks = [];

  if (requiresVerification) {
    const toolErrors = operations.filter((op) => op?.result?.error).map((op) => String(op?.tool || 'unknown'));
    if (toolErrors.length > 0) {
      failedChecks.push(`TOOL_ERRORS:${toolErrors.join(',')}`);
    }

    const successfulOps = operations.filter((op) => !op?.result?.error);
    if (successfulOps.length === 0) {
      failedChecks.push('NO_SUCCESSFUL_DATA_OPERATION');
    }

    if (safeCitations.length === 0) {
      failedChecks.push('NO_CITATIONS');
    }

    const evidenceTools = new Set(safeCitations.map((c) => String(c?.sourceTool || '')).filter(Boolean));
    const missingEvidenceTools = successfulOps
      .map((op) => String(op?.tool || ''))
      .filter((tool) => shouldRequireCitationForTool(tool, operations.find((op) => op?.tool === tool)?.result))
      .filter((tool) => !evidenceTools.has(tool));

    if (missingEvidenceTools.length > 0) {
      failedChecks.push(`MISSING_TOOL_CITATIONS:${missingEvidenceTools.join(',')}`);
    }

    const rowEvidenceTools = new Set(
      safeCitations
        .filter((citation) => citation.kind === 'retrieved')
        .map((citation) => String(citation?.sourceTool || ''))
        .filter(Boolean)
    );
    const missingRowEvidenceTools = successfulOps
      .filter((op) => shouldRequireRowEvidenceForOperation(op))
      .map((op) => String(op?.tool || ''))
      .filter((tool) => !rowEvidenceTools.has(tool));

    if (missingRowEvidenceTools.length > 0) {
      failedChecks.push(`MISSING_ROW_LEVEL_CITATIONS:${missingRowEvidenceTools.join(',')}`);
    }

    const responseText = String(response || '');
    const successfulRowCount = successfulOps.reduce((sum, op) => sum + countOperationRows(op?.result || {}), 0);
    if (shouldEnforceEntityGrounding(successfulOps, responseText)) {
      const unsupportedEntities = findUnsupportedResponseEntities(responseText, safeCitations);
      if (unsupportedEntities.length > 0) {
        failedChecks.push(`UNSUPPORTED_RESPONSE_ENTITIES:${unsupportedEntities.join('|')}`);
      }
    }

    if (detectNegativeResultClaim(responseText) && successfulRowCount > 0) {
      failedChecks.push('NEGATIVE_RESULT_CONTRADICTION');
    }

    if (detectRetrievalFailureClaim(responseText) && (successfulRowCount > 0 || safeCitations.length > 0)) {
      failedChecks.push('FAILURE_RESULT_CONTRADICTION');
    }

    const hasUncertainLanguage = /\b(i think|likely|probably|might|maybe)\b/i.test(responseText);
    if (hasUncertainLanguage && safeCitations.length === 0) {
      failedChecks.push('UNCERTAIN_LANGUAGE_WITHOUT_EVIDENCE');
    }
  }

  return {
    mode: 'strict_db_citations',
    requires_verification: !!requiresVerification,
    is_true: requiresVerification ? failedChecks.length === 0 : true,
    failed_checks: failedChecks,
    citation_count: safeCitations.length,
    operation_count: operations.length,
    verified_at: new Date().toISOString(),
  };
}

export function buildUnverifiedResponseMessage(failedChecks) {
  const checks = Array.isArray(failedChecks) ? failedChecks : [];
  const summary = checks.length > 0 ? checks.join(', ') : 'Unknown verification failure';
  return [
    'UNVERIFIED ❌',
    'I cannot guarantee this answer against strict database citation checks, so I am not returning factual claims.',
    `Verification failure: ${summary}`,
    'Please retry your request, or ask for a narrower query so I can produce fully cited evidence.',
  ].join('\n');
}

export function formatCitationForChannel(citation, index = 1) {
  const safe = normalizeCitation(citation);
  if (!safe) return '';
  const tableLabel = safe.table || 'unknown';
  const singularTable = tableLabel.endsWith('s') ? tableLabel.slice(0, -1) : tableLabel;
  const snapshot = safe.valueSnapshot && typeof safe.valueSnapshot === 'object' ? safe.valueSnapshot : null;
  const preferredName = snapshot?.name
    || snapshot?.full_name
    || snapshot?.title
    || snapshot?.account_name
    || snapshot?.contact_name
    || null;
  const rowLabel = safe.rowId ? `${tableLabel}:#${safe.rowId}` : `${tableLabel}:derived`;
  const label = preferredName ? `${singularTable} "${String(preferredName)}"` : rowLabel;
  const toolLabel = safe.sourceTool || 'tool';
  return `${index}. ${label} (${toolLabel})`;
}

export function sanitizeCitationsForStorage(citations) {
  const list = dedupeCitations(Array.isArray(citations) ? citations : []).slice(0, 30);
  return list.map((citation) => ({
    ...citation,
    valueSnapshot: citation.valueSnapshot ? Object.fromEntries(Object.entries(citation.valueSnapshot).slice(0, 12)) : null,
  }));
}

export function classifyResponseState({ crmOperations, citations, response, isAmbiguous }) {
  const ops = Array.isArray(crmOperations) ? crmOperations : [];
  const cites = Array.isArray(citations) ? citations : [];
  const hasToolError = ops.some((op) => op?.result?.error);
  const hasSuccessfulOp = ops.some((op) => !op?.result?.error);
  const hasCitations = cites.length > 0;
  const hasRetrievedCitations = cites.some((c) => c?.kind === 'retrieved');

  if (hasToolError && !hasSuccessfulOp) return 'failure';
  if (ops.length === 0 && isAmbiguous) return 'clarification_needed';
  if (hasSuccessfulOp && hasRetrievedCitations) return 'verified';
  if (hasSuccessfulOp && !hasCitations) return 'unverified';
  if (ops.length === 0 && !response) return 'failure';
  return 'unverified';
}

function countOperationRows(result) {
  if (!result || result.error) return 0;
  if (Array.isArray(result.results)) return result.results.length;
  if (Array.isArray(result.messages)) return result.messages.length;
  if (typeof result.count === 'number') return result.count;
  if (typeof result.total_count === 'number') return result.total_count;
  if (typeof result.totalDeals === 'number') return result.totalDeals;
  if (result.id != null) return 1;
  return 0;
}

export function classifyGroundingState({
  verification,
  crmOperations,
  citations,
  response,
  clarificationNeeded,
}) {
  if (clarificationNeeded) return 'clarification_needed';

  const ops = Array.isArray(crmOperations) ? crmOperations : [];
  const safeCitations = Array.isArray(citations) ? citations : [];
  const safeVerification = verification && typeof verification === 'object' ? verification : {};
  const failedChecks = Array.isArray(safeVerification.failed_checks) ? safeVerification.failed_checks : [];
  const successfulOps = ops.filter((op) => !op?.result?.error);
  const totalRows = successfulOps.reduce((sum, op) => sum + countOperationRows(op?.result || {}), 0);
  const hasAdvisoryWorkflow = ops.some((op) => {
    const tool = String(op?.tool || '');
    return ADVISORY_WORKFLOW_TOOLS.has(tool) || isMutationWorkflowTool(tool);
  });
  const pendingWorkflowOnly = hasOnlyPendingWorkflowOperations(ops);

  if (pendingWorkflowOnly) {
    return 'clarification_needed';
  }

  if (safeVerification.policy === 'strict' && safeVerification.is_true === true && safeCitations.length > 0) {
    return 'verified';
  }

  if (failedChecks.includes('NEGATIVE_RESULT_CONTRADICTION')) {
    // Data WAS found but LLM claimed "no results" — this is a synthesis error,
    // not an actual empty result. Recover to advisory_only so we pass through
    // the real data instead of overriding with a generic "no matching records" message.
    return 'advisory_only';
  }

  if (failedChecks.includes('FAILURE_RESULT_CONTRADICTION')) {
    // Same as NEGATIVE_RESULT_CONTRADICTION: data was retrieved successfully but
    // the LLM claimed a retrieval failure. Recover instead of blocking.
    return 'advisory_only';
  }

  // UNSUPPORTED_RESPONSE_ENTITIES: LLM abbreviated or rephrased entity names that
  // don't exactly match citations (e.g. "NY" vs "New York"). If data was retrieved
  // successfully, this is a fuzzy-match issue, not an actual grounding failure.
  const hasUnsupportedEntities = failedChecks.some((c) => c.startsWith('UNSUPPORTED_RESPONSE_ENTITIES'));
  if (hasUnsupportedEntities && successfulOps.length > 0 && totalRows > 0) {
    return 'advisory_only';
  }

  if (safeVerification.blocking_failure === true) {
    return 'failure';
  }

  if (ops.length > 0 && successfulOps.length === 0 && ops.some((op) => op?.result?.error)) {
    return 'failure';
  }

  if (successfulOps.length > 0 && totalRows === 0 && !hasAdvisoryWorkflow) {
    return 'no_results';
  }

  if (!detectFactualClaims({ message: '', response }) || hasAdvisoryWorkflow || safeVerification.policy === 'advisory') {
    return 'advisory_only';
  }

  return successfulOps.length > 0 ? 'advisory_only' : 'failure';
}

export function buildGroundedFailureMessage(groundingState, context = {}) {
  if (groundingState === 'clarification_needed') {
    return String(context.message || 'Could you clarify what you mean so I can pull the right data?');
  }

  if (groundingState === 'no_results') {
    return 'I searched the CRM but found no matching records for that request.';
  }

  if (groundingState === 'failure') {
    return "I couldn't verify that against your CRM because the lookup failed. No data was changed.";
  }

  return 'I was not able to produce a verified answer for that request.';
}
