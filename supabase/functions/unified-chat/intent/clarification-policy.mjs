function singularizeEntityType(rawType) {
  const lower = String(rawType || '').toLowerCase().trim();
  if (!lower) return null;
  if (['deal', 'deals', 'opportunity', 'opportunities'].includes(lower)) return 'deal';
  if (['contact', 'contacts'].includes(lower)) return 'contact';
  if (['account', 'accounts', 'company', 'companies'].includes(lower)) return 'account';
  return null;
}

function resolveSingleContextEntity(context = {}) {
  const primary = context?.resolvedEntityContext?.primaryEntity;
  const primaryType = singularizeEntityType(primary?.type);
  if (primaryType && primary?.id) {
    return { entityType: primaryType, entityId: String(primary.id) };
  }

  const activeType = singularizeEntityType(context?.resolvedActiveContext?.lastEntityType);
  const activeIds = Array.isArray(context?.resolvedActiveContext?.lastEntityIds)
    ? context.resolvedActiveContext.lastEntityIds
    : [];
  if (activeType && activeIds.length === 1) {
    return { entityType: activeType, entityId: String(activeIds[0]) };
  }

  return null;
}

function isExplicitTaskRequest(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  return /\b(?:create|add|new|make|set)\b[\s\S]*\b(?:task|next\s+step|todo|to-do|reminder|follow[\s-]?up)\b/.test(text)
    || /\bremind\s+me\s+to\b/.test(text)
    || /\bneed\s+to\b[\s\S]*\b(?:follow\s+up|send|call|email|schedule|prepare)\b/.test(text);
}

function isTaskPageAction(context = {}) {
  const pageContext = context?.pageContext && typeof context.pageContext === 'object'
    ? context.pageContext
    : {};
  const actionType = String(pageContext.type || pageContext.pageType || pageContext.currentPage || '').toLowerCase();
  return actionType === 'task' || actionType === 'create_task' || actionType === 'next_step';
}

export function evaluateClarificationPolicy(contract, retrievalPlan, context = {}) {
  const intent = String(contract?.intent || 'unknown');
  const resolvedEntity = resolveSingleContextEntity(context);
  const hasEntity = !!contract?.entityId || !!contract?.entityHint || !!resolvedEntity?.entityId;

  if (intent === 'deal_analysis' && !hasEntity) {
    return {
      needsClarification: true,
      reason: 'missing_deal',
      message: 'Which deal would you like me to analyze?',
    };
  }

  if (intent === 'entity_lookup' && retrievalPlan?.requiresClarification && !hasEntity) {
    const label = contract?.entityType || 'record';
    return {
      needsClarification: true,
      reason: 'missing_entity',
      message: `Which ${label} are you asking about?`,
    };
  }

  if (intent === 'message_history' && !hasEntity) {
    return {
      needsClarification: true,
      reason: 'missing_message_target',
      message: 'Which deal, contact, or account should I pull messages for?',
    };
  }

  if (intent === 'drafting') {
    // Don't clarify if this is a scheduling/meeting request — route to calendar skill instead
    const messageText = String(contract?.entityHintRaw || contract?.entityHint || '').toLowerCase();
    const fullMessage = String(context?.historyText || '').toLowerCase();
    const isSchedulingRequest = /\b(meeting|schedule|book|calendar|invite)\b/.test(messageText)
      || /\b(meeting|schedule|book|calendar|invite)\b/.test(fullMessage)
      || (Array.isArray(contract?.domains) && contract.domains.includes('scheduling'));
    if (isSchedulingRequest) {
      return { needsClarification: false };
    }

    const currentMessage = String(context?.messageText || contract?.entityHintRaw || contract?.entityHint || '');
    if (isTaskPageAction(context) || isExplicitTaskRequest(currentMessage)) {
      return { needsClarification: false };
    }

    const draftingTarget = contract?.entityType === 'deal' || contract?.entityType === 'contact' || resolvedEntity;
    if (!contract?.entityHint && !contract?.entityId && !draftingTarget) {
      return {
        needsClarification: true,
        reason: 'missing_drafting_target',
        message: 'What deal or contact should I use for the draft?',
      };
    }
  }

  if (intent === 'crm_mutation' && (Number(contract?.confidence || 0) < 0.7 || !hasEntity)) {
    // Don't clarify if session has pending state or conversation history
    // indicates an ongoing deal/contact creation flow
    const hasPendingState = context?.hasPendingDealCreation || context?.hasPendingExtraction;
    const isFollowUp = contract?.isFollowUp || contract?.isDataProvision;
    const highConfidence = Number(contract?.confidence || 0) >= 0.9;
    // Check if current message or history contains creation keywords — create intents
    // don't have existing entities by definition, so !hasEntity shouldn't block them
    const historyText = String(context?.historyText || '').toLowerCase();
    const historyHasCreationContext = /\b(create|creating|close.?date|contact.?name|before i create|i need)\b/.test(historyText);
    const isCreationIntent = contract?.mutationIntent && /\b(create|add|new)\b/i.test(String(contract?.entityHintRaw || contract?.entityHint || ''))
      || (Array.isArray(contract?.domains) && contract.domains.includes('create'));
    const isSchedulingMutation = Array.isArray(contract?.domains) && contract.domains.includes('scheduling');
    if (!hasPendingState && !historyHasCreationContext && !isCreationIntent && !isSchedulingMutation && !(isFollowUp && highConfidence)) {
      return {
        needsClarification: true,
        reason: 'unsafe_mutation',
        message: 'What exactly should I update, and on which record?',
      };
    }
  }

  return { needsClarification: false };
}
