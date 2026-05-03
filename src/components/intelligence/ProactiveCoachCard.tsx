import React, { useState } from 'react';
import { useNextBestAction, NextBestAction } from '@/hooks/useNextBestAction';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  User,
  Target,
  Lightbulb,
  CheckCircle2,
  Bell,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigateToAppView } from '@/lib/appNavigation';
import { queueDealDetailOpen } from '@/lib/dealDetailNavigation';

interface ProactiveCoachCardProps {
  className?: string;
  position?: 'floating' | 'inline';
  maxVisible?: number;
}

const priorityStyles = {
  critical: {
    border: 'border-destructive/50',
    bg: 'bg-destructive/5',
    icon: 'text-destructive',
    badge: 'bg-destructive text-destructive-foreground',
  },
  high: {
    border: 'border-chart-1/50',
    bg: 'bg-chart-1/5',
    icon: 'text-chart-1',
    badge: 'bg-chart-1 text-primary-foreground',
  },
  medium: {
    border: 'border-primary/50',
    bg: 'bg-primary/5',
    icon: 'text-primary',
    badge: 'bg-primary text-primary-foreground',
  },
  low: {
    border: 'border-muted-foreground/30',
    bg: 'bg-muted/50',
    icon: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
  },
};

const typeIcons = {
  deal_attention: Target,
  overdue_task: Clock,
  stale_contact: User,
  follow_up: Bell,
  milestone: CheckCircle2,
  behavior_tip: Lightbulb,
};

export const ProactiveCoachCard: React.FC<ProactiveCoachCardProps> = ({
  className,
  position = 'floating',
  maxVisible = 3,
}) => {
  const { actions, loading, dismissAction } = useNextBestAction();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (loading || actions.length === 0) {
    return null;
  }

  const visibleActions = isExpanded
    ? (showAll ? actions : actions.slice(0, maxVisible))
    : actions.slice(0, 1);
  const hasMore = actions.length > maxVisible;

  const handleDismiss = (actionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissAction(actionId, 'not_relevant');
  };

  const handleRemindLater = (actionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissAction(actionId, 'remind_later');
  };

  const handleActionClick = (action: NextBestAction) => {
    if (!action.entityType) return;

    if (action.entityType === 'deal') {
      queueDealDetailOpen({
        dealId: action.entityId,
        dealName: action.entityName,
      });
      return;
    }

    const viewByEntity: Partial<Record<NonNullable<NextBestAction['entityType']>, Parameters<typeof navigateToAppView>[0]>> = {
      account: 'accounts',
      contact: 'contacts',
      task: 'tasks',
      activity: 'activities',
    };
    const targetView = viewByEntity[action.entityType];
    if (targetView) navigateToAppView(targetView);
  };

  if (isMinimized) {
    return (
      <div
        className={cn(
          'fixed bottom-4 right-4 z-50',
          position === 'inline' && 'relative bottom-auto right-auto',
          className
        )}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsMinimized(false)}
          className="shadow-lg gap-2"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium">{actions.length} suggestions</span>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-80 max-w-[calc(100vw-2rem)]',
        position === 'floating' && 'fixed bottom-4 right-4 z-50',
        position === 'inline' && 'relative',
        className
      )}
    >
      <Card className="shadow-lg border-border/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Next Best Actions</span>
            <span className="text-xs text-muted-foreground">({actions.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setIsExpanded(!isExpanded);
                if (isExpanded) setShowAll(false);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsMinimized(true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Actions List */}
        <CardContent className="p-0 max-h-96 overflow-y-auto">
          {visibleActions.map((action, index) => {
            const IconComponent = typeIcons[action.type] || AlertTriangle;
            const styles = priorityStyles[action.priority];

            return (
              <div
                key={action.id}
                className={cn(
                  'p-3 border-b border-border/30 last:border-b-0 cursor-pointer transition-colors',
                  'hover:bg-accent/50',
                  index === 0 && styles.bg
                )}
                onClick={() => handleActionClick(action)}
              >
                {/* Priority + Icon + Title */}
                <div className="flex items-start gap-2 mb-1.5">
                  <IconComponent className={cn('h-4 w-4 mt-0.5 flex-shrink-0', styles.icon)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={cn(
                          'text-[10px] font-medium uppercase px-1.5 py-0.5 rounded',
                          styles.badge
                        )}
                      >
                        {action.priority}
                      </span>
                      {action.timeContext && (
                        <span className="text-[10px] text-muted-foreground">{action.timeContext}</span>
                      )}
                    </div>
                    <h4 className="text-sm font-medium text-foreground leading-tight truncate">
                      {action.title}
                    </h4>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground mb-2 pl-6 line-clamp-2">
                  {action.description}
                </p>

                {/* Reasoning (only for top action) */}
                {index === 0 && (
                  <p className="text-xs text-muted-foreground/80 italic mb-2 pl-6 line-clamp-2">
                    {action.reasoning}
                  </p>
                )}

                {/* Evidence signals */}
                {action.evidence?.signals && action.evidence.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2 pl-6">
                    {action.evidence.signals.map((signal, si) => (
                      <span
                        key={si}
                        className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40"
                        title={signal.description}
                      >
                        {signal.type.replace(/_/g, ' ')}
                        {signal.value != null && `: ${signal.value}`}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pl-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActionClick(action);
                    }}
                  >
                    Take Action
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2 text-muted-foreground"
                    onClick={(e) => handleRemindLater(action.id, e)}
                  >
                    Later
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 ml-auto"
                    onClick={(e) => handleDismiss(action.id, e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Show more */}
          {hasMore && isExpanded && (
            <div className="p-2 text-center border-t border-border/30">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? 'Show fewer suggestions' : `+${actions.length - maxVisible} more suggestions`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProactiveCoachCard;
