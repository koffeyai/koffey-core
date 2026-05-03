import React from 'react';
import { PriorityPlay, PlayAction } from '@/hooks/useBriefing';
import { Target, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { queueDealDetailOpen } from '@/lib/dealDetailNavigation';

interface Props {
  play: PriorityPlay;
  onAction: (action: PlayAction) => void;
}

export function PriorityPlayCard({ play, onAction }: Props) {
  const { openPanel } = useChatPanelStore();
  const canOpenDeal = Boolean(play.deal_id || play.deal_name || play.headline);

  const openDealDetail = () => {
    if (!canOpenDeal) return;
    queueDealDetailOpen({
      dealId: play.deal_id,
      dealName: play.deal_name || play.headline,
    });
  };

  const handleAction = () => {
    onAction(play.action);
    
    const dealName = play.deal_name || undefined;
    const dealContext = { dealId: play.deal_id, dealName };
    // Normalize action type - AI may generate variants like 'schedule_lunch'
    const actionType = play.action.type?.toLowerCase().startsWith('schedule')
      ? 'schedule'
      : play.action.type;
    switch (actionType) {
      case 'meeting_prep':
        openPanel(`Help me prepare for my meeting: ${play.headline}`, { ...dealContext, type: 'meeting_prep' });
        break;
      case 'send_content': {
        const contentLabel = play.action?.label || 'content';
        const contextBullets = play.context?.join('; ') || '';
        openPanel(
          `${contentLabel} for ${play.deal_name || play.headline}. Key context: ${contextBullets}. Use the deal data to create a compelling, data-backed deliverable.`,
          { ...dealContext, type: 'content_generation' }
        );
        break;
      }
      case 'email':
        openPanel(`Draft an email: ${play.headline}. Include context and next steps.`, { ...dealContext, type: 'email' });
        break;
      case 'call':
        openPanel(`Prep me for a call: ${play.headline}. After the call, help me log the outcome.`, { ...dealContext, type: 'call_prep' });
        break;
      case 'create_task':
        openPanel(
          `Create a follow-up task for ${dealName || 'this opportunity'}: ${play.headline}`,
          { ...dealContext, type: 'task' }
        );
        break;
      case 'schedule': {
        // Open chat panel with scheduling context — agent checks availability and sends email proactively
        const actionLabel = play.action.label || play.headline;
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
        openPanel(`Help me with: ${play.headline}`, { ...dealContext, type: play.action.type || 'general' });
    }
  };

  return (
    <div
      className={`bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-xl p-5 relative overflow-hidden ${canOpenDeal ? 'cursor-pointer hover:bg-primary/10 transition-colors' : ''}`}
      role={canOpenDeal ? 'button' : undefined}
      tabIndex={canOpenDeal ? 0 : undefined}
      onClick={canOpenDeal ? openDealDetail : undefined}
      onKeyDown={canOpenDeal ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDealDetail();
        }
      } : undefined}
    >
      {/* Accent glow */}
      <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/20 rounded-full blur-2xl" />
      
      <div className="flex items-center gap-2 mb-3 relative">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Your Highest-Leverage Move</h3>
      </div>

      <h4 className="text-xl font-bold text-foreground mb-2 relative">
        {play.headline}
      </h4>

      <p className="text-muted-foreground mb-4 relative">
        {play.why_this_matters}
      </p>

      {/* Context bullets */}
      {play.context?.length > 0 && (
        <div className="mb-4 relative">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            What I found that might help:
          </p>
          <ul className="space-y-1.5">
            {play.context.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-primary mt-1">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 relative">
      {canOpenDeal && (
        <Button
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            openDealDetail();
          }}
        >
          Open opportunity
        </Button>
      )}
      <Button
        onClick={(event) => {
          event.stopPropagation();
          handleAction();
        }}
        className="w-full sm:w-auto relative"
        size="lg"
      >
        {play.action.label}
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
      </div>
    </div>
  );
}
