import type { SuggestedAction } from '@/hooks/useSuggestedActions';

export interface SuggestedActionPlay {
  label: string;
  prompt: string;
  context: Record<string, unknown>;
}

const ACTION_LABELS: Record<string, string> = {
  follow_up: 'Draft follow-up',
  re_engage: 'Re-engage',
  date_reminder: 'Prepare',
  relationship_nurture: 'Nurture',
  deal_risk: 'Advance deal',
  memory_insight: 'Use insight',
  compaction_summary: 'Review summary',
  renewal_outreach: 'Draft renewal',
  schedule_qbr: 'Schedule QBR',
  meeting_prep: 'Prepare meeting',
  post_meeting_followup: 'Log follow-up',
  workflow_alert: 'Handle alert',
  email_engagement_drop: 'Draft check-in',
};

function entityContext(action: SuggestedAction): Record<string, unknown> {
  const sourceEntities = action.evidence?.source_entities || [];
  const primarySource = sourceEntities[0];

  return {
    suggestedActionId: action.id,
    actionType: action.action_type,
    dealId: action.deal_id || sourceEntities.find((entity) => entity.entity_type === 'deal')?.entity_id,
    contactId: action.contact_id || sourceEntities.find((entity) => entity.entity_type === 'contact')?.entity_id,
    sourceEntity: primarySource || null,
    evidence: action.evidence || null,
    type: 'suggested_action',
  };
}

function baseContextText(action: SuggestedAction): string {
  return [
    `Suggestion: ${action.title}`,
    action.description ? `Context: ${action.description}` : '',
    action.reasoning ? `Reasoning: ${action.reasoning}` : '',
    action.evidence?.signals?.length
      ? `Evidence: ${action.evidence.signals.map((signal) => signal.description).join('; ')}`
      : '',
  ].filter(Boolean).join('\n');
}

export function getSuggestedActionPlay(action: SuggestedAction): SuggestedActionPlay {
  const context = entityContext(action);
  const base = baseContextText(action);

  switch (action.action_type) {
    case 'follow_up':
    case 're_engage':
    case 'relationship_nurture':
    case 'email_engagement_drop':
      return {
        label: ACTION_LABELS[action.action_type],
        context: { ...context, type: 'email' },
        prompt: `${base}\n\nDraft the best next-touch email. If a recipient email or contact is missing, ask me for the missing detail before proceeding.`,
      };

    case 'date_reminder':
      return {
        label: 'Prepare',
        context: { ...context, type: 'preparation' },
        prompt: `${base}\n\nHelp me prepare for this date. Identify the next CRM action and draft any message or task needed to stay ahead of it.`,
      };

    case 'deal_risk':
      return {
        label: 'Advance deal',
        context: { ...context, type: 'deal_advancement' },
        prompt: `${base}\n\nHelp me move this deal forward. Identify the blocker, recommend the highest-leverage next step, and draft the action I should take.`,
      };

    case 'renewal_outreach':
      return {
        label: 'Draft renewal',
        context: { ...context, type: 'renewal' },
        prompt: `${base}\n\nDraft a renewal outreach plan and the first customer-facing message. Include what to verify before sending.`,
      };

    case 'schedule_qbr':
      return {
        label: 'Schedule QBR',
        context: { ...context, type: 'scheduling', slotType: 'qbr' },
        prompt: `${base}\n\nHelp me schedule and prepare this QBR. Draft the scheduling email and list the data I should include in the review.`,
      };

    case 'meeting_prep':
      return {
        label: 'Prepare meeting',
        context: { ...context, type: 'meeting_prep' },
        prompt: `${base}\n\nPrepare me for this meeting. Give me objectives, likely objections, discovery questions, and next-step options.`,
      };

    case 'post_meeting_followup':
      return {
        label: 'Log follow-up',
        context: { ...context, type: 'meeting_followup' },
        prompt: `${base}\n\nHelp me capture meeting notes, extract next steps, and create any follow-up tasks. Ask for my raw notes if you need them.`,
      };

    case 'workflow_alert':
      return {
        label: 'Handle alert',
        context: { ...context, type: 'workflow_alert' },
        prompt: `${base}\n\nHelp me handle this workflow alert. Explain what triggered it and recommend the next CRM action.`,
      };

    case 'compaction_summary':
    case 'memory_insight':
    default:
      return {
        label: ACTION_LABELS[action.action_type] || 'Take action',
        context,
        prompt: `${base}\n\nTurn this CRM insight into a concrete next step. If there is enough information, draft the action; if not, ask only for the missing detail.`,
      };
  }
}
