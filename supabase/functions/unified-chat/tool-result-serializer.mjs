/**
 * Pure serializer that compacts tool results for synthesis prompts.
 * Guarantees valid JSON output under maxChars without mid-string truncation.
 */

function stableSortObject(input) {
  if (Array.isArray(input)) return input.map((v) => stableSortObject(v));
  if (!input || typeof input !== 'object') return input;
  const out = {};
  for (const key of Object.keys(input).sort()) {
    const val = input[key];
    if (val === undefined || val === null) continue;
    out[key] = stableSortObject(val);
  }
  return out;
}

function compactRowForPrompt(row) {
  if (!row || typeof row !== 'object') return {};
  const keep = [
    'id',
    'name',
    'full_name',
    'email',
    'company',
    'title',
    'stage',
    'amount',
    'probability',
    'expected_close_date',
    'scheduled_at',
    'due_date',
    'priority',
    'updated_at',
    'created_at',
    'overall_lead_score',
  ];
  const compact = {};
  for (const key of keep) {
    const value = row[key];
    if (value !== undefined && value !== null) compact[key] = value;
  }
  if (Object.keys(compact).length > 0) return compact;

  const fallback = {};
  for (const [key, value] of Object.entries(row).slice(0, 8)) {
    fallback[key] = typeof value === 'string' ? value.slice(0, 200) : value;
  }
  return fallback;
}

function compactToolResultForPrompt(result, maxResults) {
  if (!result || typeof result !== 'object') return result;

  if (Array.isArray(result)) {
    return result.slice(0, maxResults).map((row) => compactRowForPrompt(row));
  }

  const base = {};
  const topLevelKeys = [
    'error',
    'message',
    'count',
    'total_count',
    'entity_type',
    'sorted_by',
    'sort_direction',
    'search_type',
    'totalDeals',
    'totalValue',
    'weightedValue',
    'staleDeals',
    'id',
    'name',
    'stage',
    'amount',
    'probability',
    'expected_close_date',
    'fuzzy_match',
    'original_query',
    'email_type',
    'tone',
    'user_context',
    'recipient_email',
    'summary',
    'success',
    'changes',
    '_needsInput',
    '_needsConfirmation',
    '_needsLossReason',
  ];
  for (const key of topLevelKeys) {
    const value = result[key];
    if (value !== undefined && value !== null) {
      base[key] = typeof value === 'string' ? value.slice(0, 300) : value;
    }
  }

  if (Array.isArray(result.results)) {
    base.results = result.results.slice(0, maxResults).map((row) => compactRowForPrompt(row));
  }

  if (Array.isArray(result.deals)) {
    base.deals = result.deals.slice(0, maxResults).map((row) => compactRowForPrompt(row));
  }

  if (result.deal && typeof result.deal === 'object') {
    base.deal = compactRowForPrompt(result.deal);
  }

  if (result.contact && typeof result.contact === 'object') {
    base.contact = compactRowForPrompt(result.contact);
  }

  if (Array.isArray(result.recent_activities)) {
    base.recent_activities = result.recent_activities.slice(0, maxResults).map((row) => compactRowForPrompt(row));
  }

  if (result.action && typeof result.action === 'object') {
    base.action = stableSortObject(result.action);
  }

  if (Object.keys(base).length > 0) return base;

  const fallback = {};
  for (const [key, value] of Object.entries(result).slice(0, 10)) {
    if (Array.isArray(value)) {
      fallback[key] = value.slice(0, 4);
    } else if (value && typeof value === 'object') {
      fallback[key] = compactRowForPrompt(value);
    } else {
      fallback[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    }
  }
  return fallback;
}

/**
 * Trusted context path: context RPCs (get_deal_context_for_llm, etc.) return
 * pre-shaped JSON that's already curated for LLM consumption. Skip field-stripping
 * and array truncation but still enforce a char cap to prevent prompt blowout.
 */
function serializeTrustedContext(result, maxChars) {
  // Remove the __trusted_context flag before serializing
  const { __trusted_context, ...data } = result;
  const clone = JSON.parse(JSON.stringify(data));

  let serialized = JSON.stringify(clone);
  if (serialized.length <= maxChars) return serialized;

  // If over budget, progressively trim arrays (longest first) without field-stripping
  const arrayKeys = Object.keys(clone).filter((k) => Array.isArray(clone[k]));
  arrayKeys.sort((a, b) => JSON.stringify(clone[b]).length - JSON.stringify(clone[a]).length);

  for (const key of arrayKeys) {
    if (serialized.length <= maxChars) break;
    while (Array.isArray(clone[key]) && clone[key].length > 1) {
      clone[key].pop();
      serialized = JSON.stringify(clone);
      if (serialized.length <= maxChars) return serialized;
    }
  }

  // Last resort: truncate long string fields in nested objects
  if (serialized.length > maxChars) {
    const truncateStrings = (obj, maxLen) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string' && val.length > maxLen) {
          obj[key] = val.slice(0, maxLen) + '...';
        } else if (val && typeof val === 'object') {
          truncateStrings(val, maxLen);
        }
      }
    };
    truncateStrings(clone, 200);
    serialized = JSON.stringify(clone);
  }

  return serialized.length <= maxChars
    ? serialized
    : serialized.slice(0, maxChars - 1) + '}';
}

export function serializeToolResultForPrompt(result, options = {}) {
  const maxChars = Math.max(1000, Number(options.maxChars || 60000));
  const maxResults = Math.max(3, Number(options.maxResults || 300));

  // Trusted context path: pre-shaped RPC results get higher cap, no field-stripping
  if (result && typeof result === 'object' && result.__trusted_context === true) {
    const trustedMaxChars = Math.max(maxChars, 80000);
    return serializeTrustedContext(result, trustedMaxChars);
  }

  const compact = compactToolResultForPrompt(result, maxResults);
  const clone = compact && typeof compact === 'object'
    ? JSON.parse(JSON.stringify(compact))
    : compact;

  let serialized = JSON.stringify(clone);
  if (serialized.length <= maxChars) return serialized;

  const shrinkArrayField = (key) => {
    if (!clone || typeof clone !== 'object' || !Array.isArray(clone[key])) return;
    while (Array.isArray(clone[key]) && clone[key].length > 1) {
      clone[key].pop();
      serialized = JSON.stringify(clone);
      if (serialized.length <= maxChars) return;
    }
    if (Array.isArray(clone[key]) && clone[key].length <= 1) {
      delete clone[key];
      serialized = JSON.stringify(clone);
    }
  };

  for (const key of ['results', 'deals', 'items', 'records']) {
    if (serialized.length <= maxChars) break;
    shrinkArrayField(key);
  }

  if (serialized.length > maxChars && clone && typeof clone === 'object' && typeof clone.message === 'string') {
    let msg = clone.message;
    while (serialized.length > maxChars && msg.length > 80) {
      msg = msg.slice(0, Math.floor(msg.length * 0.75));
      clone.message = `${msg}...`;
      serialized = JSON.stringify(clone);
    }
  }

  if (serialized.length <= maxChars) return serialized;

  const minimal = {
    error: !!clone?.error,
    message: typeof clone?.message === 'string'
      ? clone.message.slice(0, 180)
      : 'Tool result trimmed for token budget.',
    count: typeof clone?.count === 'number' ? clone.count : undefined,
    entity_type: typeof clone?.entity_type === 'string' ? clone.entity_type : undefined,
  };
  return JSON.stringify(stableSortObject(minimal));
}
