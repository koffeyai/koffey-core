import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from './useOrganizationAccess';

// ============================================================================
// Types
// ============================================================================

export type ActionType =
  | 'follow_up'
  | 're_engage'
  | 'date_reminder'
  | 'relationship_nurture'
  | 'deal_risk'
  | 'memory_insight'
  | 'compaction_summary'
  | 'renewal_outreach'
  | 'schedule_qbr'
  | 'meeting_prep'
  | 'post_meeting_followup'
  | 'workflow_alert'
  | 'email_engagement_drop';

export type ActionPriority = 'low' | 'medium' | 'high' | 'critical';
export type ActionStatus = 'active' | 'dismissed' | 'acted_on' | 'expired';

export interface EvidenceSignal {
  type: string;
  description: string;
  value?: number | string;
  threshold?: number | string;
}

export interface EvidencePayload {
  signals?: EvidenceSignal[];
  source_entities?: { entity_type: string; entity_id: string; entity_name: string }[];
  trigger_event?: string;
  data_points?: Record<string, unknown>;
}

export interface SuggestedAction {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  organization_id: string;
  action_type: ActionType;
  title: string;
  description: string;
  priority: ActionPriority;
  dedup_key: string;
  reasoning: string | null;
  confidence: number;
  status: ActionStatus;
  assigned_to: string | null;
  expires_at: string | null;
  dismissed_reason: string | null;
  evidence: EvidencePayload | null;
  created_at: string;
  updated_at: string;
}

export interface UseSuggestedActionsOptions {
  contactId?: string;
  dealId?: string;
  limit?: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useSuggestedActions(options: UseSuggestedActionsOptions = {}) {
  const { contactId, dealId, limit = 20 } = options;
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  const queryKey = ['suggested-actions', organizationId, contactId, dealId];

  const {
    data: actions,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<SuggestedAction[]> => {
      if (!organizationId) return [];

      let query = supabase
        .from('suggested_actions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('priority', { ascending: true }) // critical first
        .order('created_at', { ascending: false })
        .limit(limit);

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      if (dealId) {
        query = query.eq('deal_id', dealId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SuggestedAction[];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const dismissAction = useMutation({
    mutationFn: async ({ actionId, reason }: { actionId: string; reason?: string }) => {
      const { error } = await supabase
        .from('suggested_actions')
        .update({
          status: 'dismissed' as const,
          dismissed_at: new Date().toISOString(),
          dismissed_reason: reason || null,
        })
        .eq('id', actionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggested-actions'] });
    }
  });

  const actOnAction = useMutation({
    mutationFn: async ({ actionId, entityType, entityId }: { actionId: string; entityType?: string; entityId?: string }) => {
      const now = new Date().toISOString();

      // Snapshot entity state before marking acted_on
      let snapshotBefore: Record<string, unknown> = {};
      if (entityType && entityId) {
        const tableMap: Record<string, string> = {
          deal: 'deals', contact: 'contacts', account: 'accounts', task: 'tasks', activity: 'activities'
        };
        const table = tableMap[entityType];
        if (table) {
          const { data: entityData } = await supabase
            .from(table)
            .select('*')
            .eq('id', entityId)
            .maybeSingle();
          if (entityData) snapshotBefore = entityData;
        }
      }

      // Mark the action as acted on
      const { error } = await supabase
        .from('suggested_actions')
        .update({
          status: 'acted_on' as const,
          acted_on_at: now,
        })
        .eq('id', actionId);

      if (error) throw error;

      // Insert intervention_outcomes row for outcome measurement
      if (entityType && entityId && organizationId) {
        await supabase
          .from('intervention_outcomes')
          .insert({
            suggested_action_id: actionId,
            organization_id: organizationId,
            user_id: (await supabase.auth.getUser()).data.user?.id,
            entity_type: entityType,
            entity_id: entityId,
            snapshot_before: snapshotBefore,
            action_taken_at: now,
          });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggested-actions'] });
    }
  });

  // Sort actions: critical > high > medium > low
  const priorityOrder: Record<ActionPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedActions = [...(actions || [])].sort(
    (a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3)
  );

  return {
    actions: sortedActions,
    isLoading,
    error,
    refetch,
    dismiss: (params: { actionId: string; reason?: string }) => dismissAction.mutate(params),
    isDismissing: dismissAction.isPending,
    actOn: (params: { actionId: string; entityType?: string; entityId?: string }) => actOnAction.mutate(params),
    isActing: actOnAction.isPending,
    hasActions: (sortedActions?.length || 0) > 0,
  };
}
