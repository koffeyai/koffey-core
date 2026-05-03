import React from 'react';
import { AvailablePlay, PlayAction } from '@/hooks/useBriefing';
import { Lightbulb, Clock, TrendingUp, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatPanelStore } from '@/stores/chatPanelStore';

interface Props {
  plays: AvailablePlay[];
  onAction: (index: number, action: PlayAction) => void;
}

const statusConfig = {
  play_available: {
    icon: Lightbulb,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20'
  },
  patience_window: {
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20'
  },
  momentum: {
    icon: TrendingUp,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20'
  }
};

export function AvailablePlaysSection({ plays, onAction }: Props) {
  const { openPanel } = useChatPanelStore();

  const handleAction = (index: number, play: AvailablePlay) => {
    onAction(index, play.suggested_action);
    
    const dealName = play.deal_name || undefined;
    const dealContext = { dealId: play.deal_id, dealName };
    // Normalize action type - AI may generate variants like 'schedule_lunch'
    const actionType = play.suggested_action.type?.toLowerCase().startsWith('schedule')
      ? 'schedule'
      : play.suggested_action.type;
    switch (actionType) {
      case 'meeting_prep':
        openPanel(`Help me prepare for my meeting with ${play.deal_name}: ${play.headline}`, { ...dealContext, type: 'meeting_prep' });
        break;
      case 'send_content': {
        window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: 'slides' } }));
        window.dispatchEvent(new CustomEvent('open-slide-studio', {
          detail: { dealId: play.deal_id, dealName: play.deal_name || play.headline }
        }));
        break;
      }
      case 'email':
        openPanel(`Draft an email for ${play.deal_name}: ${play.headline}`, { ...dealContext, type: 'email' });
        break;
      case 'call':
        openPanel(`Prep me for a call with ${play.deal_name}: ${play.headline}. After the call, help me log the outcome.`, { ...dealContext, type: 'call_prep' });
        break;
      case 'create_task':
        openPanel(
          `Create a follow-up task for ${dealName || 'this opportunity'}: ${play.headline}`,
          { ...dealContext, type: 'task' }
        );
        break;
      case 'schedule': {
        // Open chat panel with scheduling context — agent checks availability and sends email proactively
        const actionLabel = play.suggested_action.label || play.headline;
        const slotType = actionLabel.toLowerCase().includes('lunch') ? 'lunch'
          : actionLabel.toLowerCase().includes('coffee') ? 'coffee'
          : actionLabel.toLowerCase().includes('call') ? 'call'
          : 'meeting';

        openPanel(
          `Schedule ${slotType} for ${play.deal_name || play.headline}. Check my calendar availability and help me send a scheduling email to the contact.`,
          { ...dealContext, type: 'scheduling', slotType, dealName: play.deal_name }
        );
        break;
      }
      default:
        // Fallback: open chat with context instead of the deal edit dialog
        openPanel(`Help me with ${play.deal_name}: ${play.headline}`, { ...dealContext, type: play.suggested_action.type || 'general' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Other Plays When You're Ready</h3>
      </div>

      <div className="space-y-2">
        {plays.map((play, index) => {
          const config = statusConfig[play.status] || statusConfig.play_available;
          const Icon = config.icon;

          return (
            <div 
              key={play.deal_id || index}
              className={cn(
                "border rounded-lg p-4 transition-colors",
                config.border,
                config.bg
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4 flex-shrink-0", config.color)} />
                    <span className="font-medium text-foreground truncate">
                      {play.deal_name}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {play.headline}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {play.context}
                  </p>
                </div>

                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction(index, play)}
                  className="flex-shrink-0"
                >
                  {play.suggested_action.label}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
