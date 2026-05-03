import React, { useEffect } from 'react';
import { useBriefing } from '@/hooks/useBriefing';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatPanelStore } from '@/stores/chatPanelStore';

import { BottomChatBar } from '@/components/chat/BottomChatBar';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { queueDealDetailOpen } from '@/lib/dealDetailNavigation';
import { 
  RefreshCw, 
  ArrowRight, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Target,
  Sparkles,
  AlertTriangle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function CommandCenter() {
  const { currentOrganization } = useOrganizationAccess();
  const {
    briefing,
    isLoading,
    error,
    isCached,
    generatedAt,
    regenerate,
    isRegenerating,
    markViewed,
    trackAction
  } = useBriefing();

  const { openPanel } = useChatPanelStore();
  const priorityPlay = briefing?.priority_play;
  const canOpenPriorityDeal = Boolean(priorityPlay?.deal_id || priorityPlay?.deal_name || priorityPlay?.headline);

  const openPriorityDealDetail = () => {
    if (!canOpenPriorityDeal || !priorityPlay) return;
    queueDealDetailOpen({
      dealId: priorityPlay.deal_id,
      dealName: priorityPlay.deal_name || priorityPlay.headline,
    });
  };

  useEffect(() => {
    if (briefing) markViewed();
  }, [briefing?.greeting]);

  if (isLoading) return <CommandCenterSkeleton />;
  
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <p className="text-lg text-muted-foreground">System syncing...</p>
          <Button onClick={() => regenerate()} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  // Mock data hygiene check - replace with real hook in future
  const dataHygieneIssues: { label: string; prompt: string }[] = [];
  // Example issues for testing:
  // const dataHygieneIssues = [
  //   { label: "3 Contacts missing emails", prompt: "Show me contacts missing email addresses" },
  //   { label: "1 Stalled Deal", prompt: "Identify stalled deals" }
  // ];
  const hasHygieneIssues = dataHygieneIssues.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        
        {/* 1. HEADER: Clean & Confident (No Quota) */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {briefing.greeting}
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              {currentOrganization?.organization?.name && (
                <span className="ml-1">• {currentOrganization.organization.name}</span>
              )}
            </p>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => regenerate()}
            disabled={isRegenerating}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", isRegenerating && "animate-spin")} />
          </Button>
        </header>

        {/* 2. PRIORITY ACTION */}
        {briefing.priority_play && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Target className="h-4 w-4" />
              Highest Leverage Action
            </div>
            
            <div
              className={cn(
                "p-5 bg-card rounded-lg border-l-4 border-l-primary border border-border",
                canOpenPriorityDeal && "cursor-pointer hover:bg-muted/30 transition-colors"
              )}
              role={canOpenPriorityDeal ? "button" : undefined}
              tabIndex={canOpenPriorityDeal ? 0 : undefined}
              onClick={canOpenPriorityDeal ? openPriorityDealDetail : undefined}
              onKeyDown={canOpenPriorityDeal ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openPriorityDealDetail();
                }
              } : undefined}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-foreground leading-snug">
                    {briefing.priority_play.headline}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {briefing.priority_play.why_this_matters}
                  </p>
                </div>

                {/* Context Bullets */}
                {briefing.priority_play.context && briefing.priority_play.context.length > 0 && (
                  <ul className="space-y-1.5 text-sm">
                    {briefing.priority_play.context.map((ctx, i) => (
                      <li key={i} className="flex items-start gap-2 text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                        {ctx}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pt-2 flex flex-wrap gap-2">
                  {canOpenPriorityDeal && (
                    <Button
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openPriorityDealDetail();
                      }}
                      className="font-medium"
                    >
                      Open opportunity
                    </Button>
                  )}
                  <Button
                    onClick={(event) => {
                      event.stopPropagation();
                      trackAction({ type: 'priority', deal_id: briefing.priority_play?.deal_id });
                      const play = briefing.priority_play!;
                      const dealName = play.deal_name || undefined;
                      const dealContext = { dealId: play.deal_id, dealName };
                      // Normalize action type - AI may generate variants like 'schedule_lunch'
                      const actionType = play.action.type?.toLowerCase().startsWith('schedule')
                        ? 'schedule'
                        : play.action.type;

                      switch (actionType) {
                        case 'meeting_prep':
                          openPanel(`Help me prepare for: ${play.headline}`, { ...dealContext, type: 'meeting_prep' });
                          break;
                        case 'send_content': {
                          // Use the action label to craft a specific prompt
                          const contentLabel = play.action?.label || 'content';
                          const contextBullets = play.context?.join('; ') || '';
                          openPanel(
                            `${contentLabel} for ${play.deal_name || play.headline}. Key context: ${contextBullets}. Use the deal data to create a compelling, data-backed deliverable.`,
                            { ...dealContext, type: 'content_generation' }
                          );
                          break;
                        }
                        case 'email':
                          openPanel(`Draft an email for this deal: ${play.headline}. Include context and next steps.`, { ...dealContext, type: 'email' });
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
                          // Open chat panel with scheduling context — agent checks availability and sends email
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
                          // Fallback: open chat with context instead of the deal dialog
                          openPanel(`Help me with: ${play.headline}`, { ...dealContext, type: play.action.type || 'general' });
                      }
                    }}
                    className="w-full sm:w-auto font-medium"
                  >
                    {briefing.priority_play.action.label}
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}


        {/* 4. DAILY OPERATIONS */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Daily Overview
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Meetings */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule</h3>
              {briefing.todays_meetings && briefing.todays_meetings.length > 0 ? (
                <div className="space-y-2">
                  {briefing.todays_meetings.map((meeting, i) => (
                    <div
                      key={i}
                      onClick={() => openPanel(`Prep me for: ${meeting.title}`, { type: 'meeting_prep', dealId: meeting.deal_id })}
                      className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xs font-medium text-muted-foreground min-w-[50px]">
                        {meeting.time}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                        {meeting.key_insight && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-amber-500" />
                            {meeting.key_insight}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-3">No meetings scheduled.</p>
              )}
            </div>

            {/* In Motion */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In Motion</h3>
              {briefing.in_motion && briefing.in_motion.length > 0 ? (
                <div className="space-y-2">
                  {briefing.in_motion.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 p-3 bg-muted/30 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.deal_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.what}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-3">Nothing pending.</p>
              )}
            </div>
          </div>
        </section>

        {/* 5. DATA HYGIENE (Conditional) */}
        {hasHygieneIssues && (
          <section>
            <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Data Hygiene</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {dataHygieneIssues.map((issue, i) => (
                      <button
                        key={i}
                        onClick={() => openPanel(issue.prompt, { type: 'cleanup' })}
                        className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline decoration-amber-700/30 underline-offset-2 transition-colors"
                      >
                        {issue.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 6. MOMENTUM */}
        {briefing.momentum && briefing.momentum.wins && briefing.momentum.wins.length > 0 && (
          <section className="pt-4 border-t border-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-medium text-foreground">Recent Wins</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {briefing.momentum.wins.map((win, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium"
                >
                  {win.deal_name}
                  <span className="text-emerald-600/70 dark:text-emerald-500/70">({win.achievement})</span>
                </span>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Bottom Chat Bar - unified chat experience */}
      <BottomChatBar
        onNavigateToChat={(message, context) => openPanel(message, context)}
        placeholder="Ask Koffey anything about your pipeline, deals, or tasks..."
        pageContext={{ currentPage: 'command-center' }}
      />
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
