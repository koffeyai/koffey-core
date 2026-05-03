function getTodayString(now) {
  return now.toISOString().slice(0, 10);
}

function buildContextSummary(context) {
  const primaryType = context?.entityContext?.primaryEntity?.type || null;
  const primaryName = context?.entityContext?.primaryEntity?.name || null;
  const activeType = context?.activeContext?.lastEntityType || null;
  const activeNames = Array.isArray(context?.activeContext?.lastEntityNames)
    ? context.activeContext.lastEntityNames.slice(0, 3)
    : [];

  return JSON.stringify({
    primaryEntity: primaryType && primaryName ? { type: primaryType, name: primaryName } : null,
    activeContext: activeType ? { type: activeType, names: activeNames } : null,
    channel: context?.channel || 'web',
  });
}

function isDenoRuntime() {
  return typeof Deno !== 'undefined' && !!Deno?.env?.get;
}

export async function extractIntentWithModel(message, context = {}, options = {}) {
  if (!String(message || '').trim()) return null;
  if (!isDenoRuntime()) return null;

  const now = options.now instanceof Date ? options.now : new Date();
  const { callWithFallback } = await import('../../_shared/ai-provider.ts');

  const systemPrompt = [
    'You are an intent extraction engine for a CRM assistant.',
    'Return JSON only. No markdown. No prose.',
    'Classify the message into one intent:',
    'deal_analysis, pipeline_summary, pipeline_window, entity_lookup, message_history, drafting, crm_mutation, crm_lookup, small_talk, unknown.',
    'Return this exact top-level shape:',
    '{',
    '  "intent": string,',
    '  "entityType": "deal" | "contact" | "account" | null,',
    '  "entityHintRaw": string | null,',
    '  "entityHint": string | null,',
    '  "timeRangeHint": {',
    '    "kind": "relative_months" | "relative_weeks" | "relative_days" | "quarter_end" | "season" | "absolute_month" | "absolute_range" | "soon" | "unspecified",',
    '    "raw": string,',
    '    "value": number?,',
    '    "quarter": 1 | 2 | 3 | 4?,',
    '    "month": 1-12?,',
    '    "season": "spring" | "summer" | "fall" | "winter"?',
    '  } | null,',
    '  "filters": { "owner": "current_user" | "team", "stages": string[] } | null,',
    '  "confidence": number',
    '}',
    `Today's date is ${getTodayString(now)}.`,
    'Do not compute resolved start/end dates.',
    'Do not produce entity IDs.',
    'Use null when a field is unknown.',
    'For deictic phrases like "this deal" or "that contact", you may leave entityHint null and rely on context.',
    'For sloppy spelling, infer the likely entity text if it is obvious.',
    'For pipeline-window asks such as upcoming deals, closing soon, next N months, by end of Q3, through summer, use pipeline_window.',
    'For broad status asks like pipeline overview / forecast summary with no explicit window, use pipeline_summary.',
    'For drafting asks, use drafting even if CRM context will be needed later.',
    'Interpret idiomatic sales language as CRM intent when appropriate.',
    'Examples:',
    '- "whats on my plate" -> pipeline_summary',
    '- "tell me about technova" -> entity_lookup',
    '- "hows it going with apex" -> entity_lookup',
    '- "whats closable this quarter" -> pipeline_window',
    '- "microsoft dael" -> entity_lookup with entityType="deal"',
    '- "show me recent convos with pepsi" -> message_history',
    '- "draft a follow-up to sarah at apex" -> drafting',
  ].join('\n');

  const response = await callWithFallback({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Context: ${buildContextSummary(context)}`,
          `Message: ${String(message || '')}`,
        ].join('\n'),
      },
    ],
    tier: 'lite',
    temperature: 0.1,
    maxTokens: 450,
    jsonMode: true,
  });

  if (!response?.content) return null;

  try {
    return JSON.parse(response.content);
  } catch {
    return null;
  }
}
