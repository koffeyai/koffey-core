function buildEntityArgs(contract, idKey, nameKey) {
  const args = {};
  if (contract?.entityId) args[idKey] = contract.entityId;
  else if (contract?.entityHint) args[nameKey] = contract.entityHint;
  return args;
}

function buildContextResourceArgs(contract, resourceType, entityType) {
  const args = { resource_type: resourceType };
  if (entityType) args.entity_type = entityType;
  if (contract?.entityId) args.entity_id = contract.entityId;
  else if (contract?.entityHint) args.entity_name = contract.entityHint;
  return args;
}

export function resolveRetrievalPlan(contract) {
  const safe = contract && typeof contract === 'object' ? contract : {};
  const intent = String(safe.intent || 'unknown');
  const resolvedTimeRange = safe.resolvedTimeRange || null;

  switch (intent) {
    case 'deal_analysis':
      return {
        path: 'scoutpad',
        preferredTools: ['analyze_deal'],
        forcedTool: 'analyze_deal',
        requiresClarification: !safe.entityId && !safe.entityHint,
        clarificationReason: !safe.entityId && !safe.entityHint ? 'Which deal would you like me to analyze?' : null,
        args: buildEntityArgs(safe, 'deal_id', 'deal_name'),
      };
    case 'pipeline_summary': {
      const args = {};
      if (resolvedTimeRange?.start) args.period_start = resolvedTimeRange.start;
      if (resolvedTimeRange?.end) args.period_end = resolvedTimeRange.end;
      return {
        path: 'pipeline_context',
        preferredTools: ['get_context_resource'],
        forcedTool: 'get_context_resource',
        requiresClarification: false,
        clarificationReason: null,
        args: { resource_type: 'pipeline_context', ...args },
      };
    }
    case 'pipeline_window': {
      const args = {};
      if (resolvedTimeRange?.start) args.period_start = resolvedTimeRange.start;
      if (resolvedTimeRange?.end) args.period_end = resolvedTimeRange.end;
      return {
        path: 'pipeline_context',
        preferredTools: ['get_context_resource'],
        forcedTool: 'get_context_resource',
        requiresClarification: false,
        clarificationReason: null,
        args: { resource_type: 'pipeline_context', ...args },
      };
    }
    case 'entity_lookup':
      if (safe.entityType === 'deal') {
        return {
          path: 'deal_context',
          preferredTools: ['get_context_resource'],
          forcedTool: 'get_context_resource',
          requiresClarification: !safe.entityId && !safe.entityHint,
          clarificationReason: !safe.entityId && !safe.entityHint ? 'Which deal would you like context on?' : null,
          args: buildContextResourceArgs(safe, 'deal_context'),
        };
      }
      if (safe.entityType === 'contact') {
        return {
          path: 'contact_context',
          preferredTools: ['get_context_resource'],
          forcedTool: 'get_context_resource',
          requiresClarification: !safe.entityId && !safe.entityHint,
          clarificationReason: !safe.entityId && !safe.entityHint ? 'Which contact would you like context on?' : null,
          args: buildContextResourceArgs(safe, 'contact_context'),
        };
      }
      if (safe.entityType === 'account') {
        return {
          path: 'account_context',
          preferredTools: ['get_context_resource'],
          forcedTool: 'get_context_resource',
          requiresClarification: !safe.entityId && !safe.entityHint,
          clarificationReason: !safe.entityId && !safe.entityHint ? 'Which account are you asking about?' : null,
          args: buildContextResourceArgs(safe, 'account_context'),
        };
      }
      return {
        path: 'planner_fallback',
        preferredTools: ['search_crm'],
        forcedTool: null,
        requiresClarification: !safe.entityId && !safe.entityHint,
        clarificationReason: !safe.entityId && !safe.entityHint ? 'Which record are you asking about?' : null,
        args: {},
      };
    case 'message_history': {
      const args = {};
      if (safe.entityType) args.entity_type = safe.entityType;
      if (safe.entityId) args.entity_id = safe.entityId;
      else if (safe.entityHint) args.entity_name = safe.entityHint;
      return {
        path: 'entity_messages',
        preferredTools: ['get_context_resource'],
        forcedTool: 'get_context_resource',
        requiresClarification: !safe.entityId && !safe.entityHint,
        clarificationReason: !safe.entityId && !safe.entityHint ? 'Which deal, contact, or account should I pull messages for?' : null,
        args: { resource_type: 'entity_messages', ...args },
      };
    }
    case 'drafting':
      return {
        path: 'draft_with_context',
        preferredTools: ['get_deal_context', 'get_contact_context', 'draft_email'],
        forcedTool: null,
        requiresClarification: false,
        clarificationReason: null,
        args: {},
      };
    case 'crm_mutation':
      return {
        path: 'planner_fallback',
        preferredTools: [],
        forcedTool: null,
        requiresClarification: false,
        clarificationReason: null,
        args: {},
      };
    case 'crm_lookup':
      return {
        path: 'planner_fallback',
        preferredTools: ['search_crm'],
        forcedTool: null,
        requiresClarification: false,
        clarificationReason: null,
        args: {},
      };
    case 'small_talk':
    case 'unknown':
    default:
      return {
        path: 'none',
        preferredTools: [],
        forcedTool: null,
        requiresClarification: false,
        clarificationReason: null,
        args: {},
      };
  }
}
