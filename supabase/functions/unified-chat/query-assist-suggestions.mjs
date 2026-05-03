import { normalizeEntityHint } from './intent/interpret-message.mjs';

function singularizeEntityType(rawType) {
  const lower = String(rawType || '').toLowerCase().trim();
  if (!lower) return null;
  if (['deal', 'deals', 'opportunity', 'opportunities'].includes(lower)) return 'deal';
  if (['contact', 'contacts'].includes(lower)) return 'contact';
  if (['account', 'accounts', 'company', 'companies'].includes(lower)) return 'account';
  return null;
}

function collectNamesFromContext(context = {}, preferredTypes = []) {
  const names = [];
  const add = (name) => {
    const normalized = String(name || '').trim();
    if (!normalized) return;
    if (!names.includes(normalized)) names.push(normalized);
  };

  const primary = context?.resolvedEntityContext?.primaryEntity;
  const primaryType = singularizeEntityType(primary?.type);
  if ((!preferredTypes.length || preferredTypes.includes(primaryType)) && primary?.name) {
    add(primary.name);
  }

  const activeType = singularizeEntityType(context?.resolvedActiveContext?.lastEntityType);
  if (!preferredTypes.length || preferredTypes.includes(activeType)) {
    for (const name of Array.isArray(context?.resolvedActiveContext?.lastEntityNames)
      ? context.resolvedActiveContext.lastEntityNames
      : []) {
      add(name);
      if (names.length >= 3) break;
    }
  }

  const referenced = context?.resolvedEntityContext?.referencedEntities || {};
  for (const type of preferredTypes) {
    const plural = `${type}s`;
    const entries = Array.isArray(referenced?.[plural]) ? referenced[plural] : [];
    for (const entry of entries) {
      add(entry?.name);
      if (names.length >= 3) break;
    }
    if (names.length >= 3) break;
  }

  return names.slice(0, 3);
}

function withFallbackNames(context, preferredTypes, fallbackNames) {
  const contextual = collectNamesFromContext(context, preferredTypes);
  return contextual.length > 0 ? contextual : fallbackNames;
}

function normalizeTargetName(intent) {
  const normalized = normalizeEntityHint(
    intent?.entityHint || intent?.entityHintRaw || '',
    { entityType: intent?.entityType || null },
  );
  return normalized || null;
}

function buildMissingEntitySuggestions(intent, context) {
  const safeIntent = intent || {};

  if (safeIntent.intent === 'deal_analysis') {
    const names = withFallbackNames(context, ['deal'], ['Apex', 'TechNova', 'Pepsi']);
    return [
      `Tell me about the ${names[0]} deal`,
      `Analyze the ${names[1] || names[0]} deal`,
      `Draft a follow-up for the ${names[2] || names[0]} deal`,
    ];
  }

  if (safeIntent.intent === 'message_history') {
    const names = withFallbackNames(context, ['account', 'contact', 'deal'], ['Pepsi', 'Apex', 'Sarah']);
    return [
      `Show recent messages with ${names[0]}`,
      `What did ${names[1] || names[0]} say about pricing?`,
      `Show conversation history with ${names[2] || names[0]}`,
    ];
  }

  if (safeIntent.intent === 'drafting') {
    const dealNames = withFallbackNames(context, ['deal'], ['TechNova']);
    const accountNames = withFallbackNames(context, ['account'], ['Apex']);
    return [
      `Draft a follow-up to Sarah at ${accountNames[0]}`,
      `Draft a next-step email for the ${dealNames[0]} deal`,
      'Draft a follow-up for this deal',
    ];
  }

  if (safeIntent.intent === 'crm_mutation') {
    const names = withFallbackNames(context, ['deal'], ['Apex', 'TechNova']);
    return [
      `Update the ${names[0]} deal amount to $500k`,
      `Move the ${names[1] || names[0]} deal to negotiation`,
      `Change the close date on the ${names[0]} deal to April 15`,
    ];
  }

  const names = withFallbackNames(context, ['deal', 'contact', 'account'], ['Apex', 'Sarah', 'Pepsi']);
  return [
    `Tell me about the ${names[0]} deal`,
    `Who is ${names[1] || names[0]}?`,
    `Show me the ${names[2] || names[0]} account`,
  ];
}

function buildNoResultsSuggestions(intent) {
  const target = normalizeTargetName(intent) || 'that name';
  return [
    `Who is ${target}?`,
    `Tell me about the ${target} account`,
    `Show recent messages with ${target}`,
  ];
}

function buildMissingTimeRangeSuggestions() {
  return [
    "What's closing this quarter",
    "What's closing in the next 30 days",
    "What's closing before end of Q2",
  ];
}

function buildUnsupportedScopeSuggestions(intent) {
  const target = normalizeTargetName(intent) || 'that account';
  return [
    `Tell me about the ${target} account`,
    `Show recent messages with ${target}`,
    `What open deals are linked to ${target}?`,
  ];
}

function buildRepeatedFailureSuggestions(intent, context) {
  const safeIntent = intent || {};
  if (safeIntent.intent === 'pipeline_summary' || safeIntent.intent === 'pipeline_window') {
    return [
      'Show my open deals',
      "What's closing this quarter",
      'Who should I follow up with this week?',
    ];
  }

  if (safeIntent.intent === 'message_history') {
    return buildMissingEntitySuggestions({ intent: 'message_history' }, context);
  }

  return buildMissingEntitySuggestions(safeIntent, context);
}

export function buildQueryAssistSuggestions({ reason, intent = null, context = {}, message = '' }) {
  switch (String(reason || '')) {
    case 'missing_entity':
    case 'ambiguous_entity':
      return buildMissingEntitySuggestions(intent, context).slice(0, 3);
    case 'no_results':
      return buildNoResultsSuggestions(intent).slice(0, 3);
    case 'missing_time_range':
      return buildMissingTimeRangeSuggestions();
    case 'unsupported_scope':
      return buildUnsupportedScopeSuggestions(intent).slice(0, 3);
    case 'repeated_failure':
      return buildRepeatedFailureSuggestions(intent, context).slice(0, 3);
    default:
      return [];
  }
}
