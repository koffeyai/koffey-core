import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Lightbulb, X, Check, Calendar, UserCheck, AlertTriangle, MessageCircle, Sparkles, Target, RefreshCw, ClipboardList } from 'lucide-react';
import { useSuggestedActions, type SuggestedAction, type ActionType, type ActionPriority } from '@/hooks/useSuggestedActions';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { getSuggestedActionPlay } from '@/lib/suggestedActionPlaybook';

interface SuggestedActionsPanelProps {
  contactId?: string;
  dealId?: string;
  limit?: number;
  compact?: boolean;
}

const PRIORITY_COLORS: Record<ActionPriority, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
};

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  follow_up: MessageCircle,
  re_engage: UserCheck,
  date_reminder: Calendar,
  relationship_nurture: Sparkles,
  deal_risk: AlertTriangle,
  memory_insight: Lightbulb,
  compaction_summary: Sparkles,
  renewal_outreach: RefreshCw,
  schedule_qbr: Calendar,
  meeting_prep: Target,
  post_meeting_followup: ClipboardList,
  workflow_alert: AlertTriangle,
  email_engagement_drop: MessageCircle,
};

const ACTION_LABELS: Record<ActionType, string> = {
  follow_up: 'Follow Up',
  re_engage: 'Re-engage',
  date_reminder: 'Date',
  relationship_nurture: 'Nurture',
  deal_risk: 'Risk',
  memory_insight: 'Insight',
  compaction_summary: 'Summary',
  renewal_outreach: 'Renewal',
  schedule_qbr: 'QBR',
  meeting_prep: 'Meeting Prep',
  post_meeting_followup: 'Follow-up',
  workflow_alert: 'Workflow',
  email_engagement_drop: 'Email Gap',
};

export const SuggestedActionsPanel: React.FC<SuggestedActionsPanelProps> = ({
  contactId,
  dealId,
  limit = 10,
  compact = false,
}) => {
  const {
    actions,
    isLoading,
    dismiss,
    isDismissing,
    actOn,
    isActing,
    hasActions,
  } = useSuggestedActions({ contactId, dealId, limit });
  const { openPanel } = useChatPanelStore();

  const handleActOn = (action: SuggestedAction) => {
    const play = getSuggestedActionPlay(action);
    openPanel(play.prompt, play.context);
    actOn({
      actionId: action.id,
      entityType: action.deal_id ? 'deal' : action.contact_id ? 'contact' : undefined,
      entityId: action.deal_id || action.contact_id || undefined,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Suggested Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!hasActions) {
    if (compact) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <Lightbulb className="h-4 w-4" />
            Suggested Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No suggestions right now. The system reviews your contacts every 6 hours.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-600" />
          Suggested Actions
          <Badge variant="outline" className="text-xs font-normal">
            {actions.length}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {actions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            compact={compact}
            onDismiss={() => dismiss({ actionId: action.id })}
            onActOn={() => handleActOn(action)}
            isDismissing={isDismissing}
            isActing={isActing}
          />
        ))}
      </CardContent>
    </Card>
  );
};

// ============================================================================
// Action Card Sub-Component
// ============================================================================

interface ActionCardProps {
  action: SuggestedAction;
  compact: boolean;
  onDismiss: () => void;
  onActOn: () => void;
  isDismissing: boolean;
  isActing: boolean;
}

const ActionCard: React.FC<ActionCardProps> = ({
  action,
  compact,
  onDismiss,
  onActOn,
  isDismissing,
  isActing,
}) => {
  const Icon = ACTION_ICONS[action.action_type] || Lightbulb;
  const label = ACTION_LABELS[action.action_type] || action.action_type;
  const play = getSuggestedActionPlay(action);

  return (
    <div className="border rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`text-xs ${PRIORITY_COLORS[action.priority]}`}>
                {action.priority}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {label}
              </Badge>
            </div>
            <p className="text-sm font-medium mt-1 leading-snug">{action.title}</p>
            {!compact && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {action.description}
              </p>
            )}
            {!compact && action.reasoning && (
              <p className="text-xs text-muted-foreground/70 mt-1 italic">
                {action.reasoning}
              </p>
            )}
            {!compact && action.evidence?.signals && action.evidence.signals.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {action.evidence.signals.map((signal, si) => (
                  <span
                    key={si}
                    className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40"
                    title={signal.description}
                  >
                    {signal.type.replace(/_/g, ' ')}{signal.value != null && `: ${signal.value}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onActOn}
            disabled={isActing}
            title={play.label}
          >
            <Check className="h-3.5 w-3.5 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDismiss}
            disabled={isDismissing}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
};
