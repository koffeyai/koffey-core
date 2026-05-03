import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  useDealsArray,
  useContactsArray,
  useTasksArray,
  useActivitiesArray,
  type Deal,
  type Contact,
  type Task,
  type Activity,
} from '@/stores/unifiedCRMStore';
import { behaviorTracker } from '@/lib/behaviorTracker';
import { useDebounce } from '@/hooks/useDebounce';
import { differenceInDays, isAfter, isBefore, startOfDay } from 'date-fns';
import type { EvidencePayload } from '@/hooks/useSuggestedActions';

export interface NextBestAction {
  id: string;
  type: 'deal_attention' | 'overdue_task' | 'stale_contact' | 'follow_up' | 'milestone' | 'behavior_tip';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  reasoning: string;
  entityType?: 'deal' | 'contact' | 'task' | 'account' | 'activity';
  entityId?: string;
  entityName?: string;
  suggestedAction: string;
  impact?: string;
  timeContext?: string;
  dismissible: boolean;
  createdAt: Date;
  evidence?: EvidencePayload;
}

interface UseNextBestActionReturn {
  actions: NextBestAction[];
  topAction: NextBestAction | null;
  loading: boolean;
  dismissAction: (actionId: string, reason?: 'not_relevant' | 'remind_later' | 'completed') => void;
  refreshActions: () => void;
  dismissedCount: number;
}

const STALE_DEAL_DAYS = 7;
const STALE_CONTACT_DAYS = 14;
const APPROACHING_CLOSE_DAYS = 7;

// Environment-aware debounce (longer in dev catches edge cases during testing)
const DEBOUNCE_MS = import.meta.env.DEV ? 500 : 300;

export const useNextBestAction = (): UseNextBestActionReturn => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [actions, setActions] = useState<NextBestAction[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Phase 5: Render loop monitoring for early warning
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastRenderTimeRef.current < 100) {
      renderCountRef.current++;
      if (renderCountRef.current > 10) {
        console.warn('[useNextBestAction] Possible render loop detected - 10+ renders in <100ms');
      }
    } else {
      renderCountRef.current = 0;
    }
    lastRenderTimeRef.current = now;
  });

  // Phase 1: Use stable array selectors with shallow comparison
  const deals = useDealsArray();
  const contacts = useContactsArray();
  const tasks = useTasksArray();
  const activities = useActivitiesArray();

  // Phase 3: Generation guard to prevent concurrent/cascading execution
  const isGeneratingRef = useRef(false);

  const generateActions = useCallback(async () => {
    // Prevent concurrent generation - breaks the cascade
    if (isGeneratingRef.current) return;

    if (!user || !organizationId) {
      setActions([]);
      setLoading(false);
      return;
    }

    isGeneratingRef.current = true;

    try {
      const newActions: NextBestAction[] = [];
      const now = new Date();
      const today = startOfDay(now);

      // 1. Analyze deals for at-risk and stale situations
      deals.forEach((deal) => {
        const dealId = deal.id;
        const updatedAt = new Date(deal.updated_at);
        const daysSinceUpdate = differenceInDays(now, updatedAt);
        const closeDate = deal.close_date ? new Date(deal.close_date) : null;
        const expectedCloseDate = deal.expected_close_date ? new Date(deal.expected_close_date) : null;
        const targetDate = expectedCloseDate || closeDate;

        // Stale deal (no activity in X days)
        if (daysSinceUpdate >= STALE_DEAL_DAYS && deal.stage !== 'closed_won' && deal.stage !== 'closed_lost') {
          const priority = daysSinceUpdate > 14 ? 'critical' : daysSinceUpdate > 10 ? 'high' : 'medium';
          newActions.push({
            id: `stale-deal-${dealId}`,
            type: 'deal_attention',
            priority,
            title: `Re-engage "${deal.name}"`,
            description: `This deal hasn't been touched in ${daysSinceUpdate} days`,
            reasoning: `Deals without activity for ${STALE_DEAL_DAYS}+ days have 40% lower close rates. Quick action can revive momentum.`,
            entityType: 'deal',
            entityId: dealId,
            entityName: deal.name,
            suggestedAction: 'Schedule a check-in call with the prospect',
            impact: 'Prevent deal from going cold',
            timeContext: `Last updated ${daysSinceUpdate} days ago`,
            dismissible: true,
            createdAt: now,
          });
        }

        // Approaching close date
        if (targetDate && isBefore(today, targetDate) && deal.stage !== 'closed_won' && deal.stage !== 'closed_lost') {
          const daysUntilClose = differenceInDays(targetDate, today);
          if (daysUntilClose <= APPROACHING_CLOSE_DAYS && daysUntilClose > 0) {
            newActions.push({
              id: `closing-soon-${dealId}`,
              type: 'deal_attention',
              priority: daysUntilClose <= 3 ? 'critical' : 'high',
              title: `"${deal.name}" closes in ${daysUntilClose} days`,
              description: `${deal.amount ? `$${deal.amount.toLocaleString()} deal` : 'Deal'} needs attention before close date`,
              reasoning: `Deals in final week need 2-3x more touchpoints to close on time.`,
              entityType: 'deal',
              entityId: dealId,
              entityName: deal.name,
              suggestedAction: 'Confirm next steps and remove any blockers',
              impact: `Secure ${deal.amount ? `$${deal.amount.toLocaleString()}` : 'this deal'} this week`,
              timeContext: `Closing ${targetDate.toLocaleDateString()}`,
              dismissible: true,
              createdAt: now,
            });
          }
        }

        // Past due close date
        if (targetDate && isAfter(today, targetDate) && deal.stage !== 'closed_won' && deal.stage !== 'closed_lost') {
          const daysPastDue = differenceInDays(today, targetDate);
          newActions.push({
            id: `past-due-${dealId}`,
            type: 'deal_attention',
            priority: 'critical',
            title: `"${deal.name}" is ${daysPastDue} days past close date`,
            description: `Expected close was ${targetDate.toLocaleDateString()}. Update status or close date.`,
            reasoning: `Past-due deals need immediate review to maintain forecast accuracy.`,
            entityType: 'deal',
            entityId: dealId,
            entityName: deal.name,
            suggestedAction: 'Update deal stage or adjust close date',
            impact: 'Improve forecast accuracy',
            timeContext: `${daysPastDue} days overdue`,
            dismissible: true,
            createdAt: now,
          });
        }
      });

      // 2. Analyze overdue tasks
      tasks.forEach((task) => {
        if (task.completed) return;

        const dueDate = task.due_date ? new Date(task.due_date) : null;
        if (dueDate && isAfter(today, dueDate)) {
          const daysOverdue = differenceInDays(today, dueDate);
          newActions.push({
            id: `overdue-task-${task.id}`,
            type: 'overdue_task',
            priority: daysOverdue > 3 ? 'high' : 'medium',
            title: `Complete: "${task.title}"`,
            description: `This task is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
            reasoning: `Overdue tasks create bottlenecks and can delay deal progress.`,
            entityType: 'task',
            entityId: task.id,
            entityName: task.title,
            suggestedAction: 'Complete task or reschedule with updated timeline',
            impact: 'Clear backlog and maintain momentum',
            timeContext: `Due ${dueDate.toLocaleDateString()}`,
            dismissible: true,
            createdAt: now,
          });
        }
      });

      // 3. Analyze stale contacts
      contacts.forEach((contact) => {
        const updatedAt = new Date(contact.updated_at);
        const daysSinceUpdate = differenceInDays(now, updatedAt);

        if (daysSinceUpdate >= STALE_CONTACT_DAYS) {
          // Check if contact has any recent activities
          const contactActivities = activities.filter(
            (a) => a.contact_id === contact.id && 
            differenceInDays(now, new Date(a.created_at)) < STALE_CONTACT_DAYS
          );

          if (contactActivities.length === 0) {
            const displayName = contact.full_name || 
              `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 
              contact.email || 
              'Contact';
            
            newActions.push({
              id: `stale-contact-${contact.id}`,
              type: 'stale_contact',
              priority: 'low',
              title: `Touch base with ${displayName}`,
              description: `No interaction in ${daysSinceUpdate} days`,
              reasoning: `Regular touchpoints maintain relationship warmth and surface opportunities.`,
              entityType: 'contact',
              entityId: contact.id,
              entityName: displayName,
              suggestedAction: 'Send a quick check-in email or schedule a call',
              impact: 'Maintain relationship and uncover needs',
              timeContext: `Last contact ${daysSinceUpdate} days ago`,
              dismissible: true,
              createdAt: now,
            });
          }
        }
      });

      // 4. Renewal and QBR checks from deal_terms
      if (organizationId) {
        try {
          const todayStr = new Date().toISOString().split('T')[0];
          const { data: dealTerms } = await (supabase as any)
            .from('deal_terms')
            .select('*, deals!inner(id, name, amount, stage, account_id)')
            .eq('organization_id', organizationId)
            .in('renewal_status', ['not_due', 'upcoming'])
            .not('contract_end_date', 'is', null);

          if (dealTerms) {
            for (const dt of dealTerms) {
              const endDate = new Date(dt.contract_end_date);
              const daysUntilEnd = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const noticeDays = dt.renewal_notice_days || 90;

              if (daysUntilEnd > 0 && daysUntilEnd <= noticeDays) {
                const priority = daysUntilEnd <= 30 ? 'critical' : daysUntilEnd <= 60 ? 'high' : 'medium';
                newActions.push({
                  id: `renewal-${dt.deal_id}`,
                  type: 'deal_attention',
                  priority,
                  title: `Renewal: ${dt.deals?.name || 'Deal'} — ${daysUntilEnd}d left`,
                  description: `Contract ${dt.auto_renew ? 'auto-renews' : 'expires'} on ${dt.contract_end_date}`,
                  reasoning: dt.auto_renew
                    ? 'Confirm auto-renewal terms with client before rollover'
                    : 'Begin renewal conversations to prevent churn',
                  entityType: 'deal',
                  entityId: dt.deal_id,
                  entityName: dt.deals?.name,
                  suggestedAction: 'Schedule renewal discussion',
                  impact: `$${(dt.deals?.amount || 0).toLocaleString()} at risk`,
                  timeContext: `${daysUntilEnd} days until contract end`,
                  dismissible: true,
                  createdAt: now,
                });
              }

              // QBR check
              if (dt.next_qbr_date) {
                const qbrDate = new Date(dt.next_qbr_date);
                const daysUntilQbr = Math.ceil((qbrDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                if (daysUntilQbr >= 0 && daysUntilQbr <= 14) {
                  newActions.push({
                    id: `qbr-${dt.deal_id}`,
                    type: 'deal_attention',
                    priority: daysUntilQbr <= 3 ? 'high' : 'medium',
                    title: `QBR due: ${dt.deals?.name || 'Deal'}`,
                    description: `Quarterly Business Review ${daysUntilQbr === 0 ? 'is today' : `in ${daysUntilQbr} days`}`,
                    reasoning: 'Regular QBRs improve retention and expansion revenue',
                    entityType: 'deal',
                    entityId: dt.deal_id,
                    entityName: dt.deals?.name,
                    suggestedAction: 'Prepare QBR deck in Slide Studio',
                    dismissible: true,
                    createdAt: now,
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error('[NBA] deal_terms query error:', err);
        }
      }

      // 4. Add behavior-based suggestions
      if (user.id) {
        const suggestion = behaviorTracker.getSuggestion(user.id);
        const frustrationLevel = behaviorTracker.getFrustrationLevel(user.id);
        
        if (suggestion && frustrationLevel !== 'low') {
          newActions.push({
            id: `behavior-tip-${Date.now()}`,
            type: 'behavior_tip',
            priority: 'low',
            title: 'Productivity Tip',
            description: suggestion,
            reasoning: 'Based on your recent activity patterns, this could save you time.',
            suggestedAction: suggestion,
            dismissible: true,
            createdAt: now,
          });
        }
      }

      // Sort by priority and limit
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      let sortedActions = newActions
        .filter((action) => !dismissedIds.has(action.id))
        .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      // Block 4C: Apply proactive policy filtering
      try {
        const { data: policy } = await (supabase as any)
          .from('proactive_policies')
          .select('max_actions_per_day, min_confidence')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (policy) {
          const minConf = policy.min_confidence ?? 0;
          const maxActions = policy.max_actions_per_day ?? 10;
          sortedActions = sortedActions
            .filter((a) => (a as any).confidence === undefined || (a as any).confidence >= minConf)
            .slice(0, maxActions);
        } else {
          sortedActions = sortedActions.slice(0, 10);
        }
      } catch {
        sortedActions = sortedActions.slice(0, 10);
      }

      setActions(sortedActions);
    } finally {
      setLoading(false);
      isGeneratingRef.current = false;
    }
  }, [user, organizationId, deals, contacts, tasks, activities, dismissedIds]);

  // Phase 2: Signature-based guard to prevent regeneration when only references change
  const prevDataSignatureRef = useRef<string>('');
  
  const dataSignature = useMemo(() => {
    return `${deals.length}-${contacts.length}-${tasks.length}-${activities.length}-${dismissedIds.size}-${organizationId || ''}`;
  }, [deals.length, contacts.length, tasks.length, activities.length, dismissedIds.size, organizationId]);

  const debouncedSignature = useDebounce(dataSignature, DEBOUNCE_MS);

  // Generate actions when signature changes (structural data change only)
  useEffect(() => {
    if (debouncedSignature === prevDataSignatureRef.current) {
      return; // No structural change, skip regeneration
    }
    prevDataSignatureRef.current = debouncedSignature;
    generateActions();
  }, [debouncedSignature]);

  // Phase 4: Stable interval using ref (no dependency on generateActions reference)
  const generateActionsRef = useRef(generateActions);
  generateActionsRef.current = generateActions;

  useEffect(() => {
    const interval = setInterval(() => {
      generateActionsRef.current();
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(interval);
  }, []); // Empty deps - uses ref for latest function

  const dismissAction = useCallback((actionId: string, reason?: 'not_relevant' | 'remind_later' | 'completed' | 'wrong_timing' | 'duplicate') => {
    setDismissedIds((prev) => new Set([...prev, actionId]));

    // Track dismissal for future learning
    if (user?.id) {
      behaviorTracker.trackAction(user.id, `dismiss_action_${reason || 'unknown'}`, {
        module: 'next_best_action',
        action: 'dismiss',
      });
    }

    // Persist dismissal to suggested_actions table so run-periodic-analysis
    // won't re-create the same suggestion
    if (organizationId) {
      const action = actions.find(a => a.id === actionId);
      const dedupKey = `client:${action?.type || 'unknown'}-${action?.entityId || actionId}`;

      supabase
        .from('suggested_actions')
        .upsert({
          organization_id: organizationId,
          dedup_key: dedupKey,
          status: 'dismissed' as const,
          dismissed_at: new Date().toISOString(),
          dismissed_reason: reason || 'not_relevant',
          action_type: action?.type === 'deal_attention' ? 'deal_risk'
            : action?.type === 'overdue_task' ? 'follow_up'
            : action?.type === 'stale_contact' ? 're_engage'
            : action?.type === 'behavior_tip' ? 'memory_insight'
            : 'follow_up',
          title: action?.title || 'Dismissed action',
          description: action?.description || '',
          priority: action?.priority || 'medium',
          confidence: 0,
        }, {
          onConflict: 'dedup_key,organization_id',
        })
        .then(({ error }) => {
          if (error) console.warn('[useNextBestAction] Failed to persist dismissal:', error.message);
        });
    }

    // If remind_later, remove from dismissed after 1 hour
    if (reason === 'remind_later') {
      setTimeout(() => {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(actionId);
          return next;
        });
      }, 60 * 60 * 1000);
    }
  }, [user?.id, organizationId, actions]);

  const topAction = useMemo(() => actions[0] || null, [actions]);

  return {
    actions,
    topAction,
    loading,
    dismissAction,
    refreshActions: generateActions,
    dismissedCount: dismissedIds.size,
  };
};
