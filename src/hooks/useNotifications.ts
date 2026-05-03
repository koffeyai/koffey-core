import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSuggestedActions, type SuggestedAction } from './useSuggestedActions';
import { useGlobalRealtimeManager } from './useGlobalRealtimeManager';
import { useOrganizationAccess } from './useOrganizationAccess';

export function useNotifications() {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();
  const { subscribe, isReady } = useGlobalRealtimeManager();

  const {
    actions: notifications,
    isLoading,
    dismiss,
    isDismissing,
    actOn,
    isActing,
    refetch,
  } = useSuggestedActions({ limit: 50 });

  // Subscribe to Realtime INSERT/UPDATE events on suggested_actions
  useEffect(() => {
    if (!isReady || !organizationId) return;

    const unsubscribe = subscribe({
      table: 'suggested_actions',
      organizationId,
      onInsert: () => {
        queryClient.invalidateQueries({ queryKey: ['suggested-actions'] });
      },
      onUpdate: () => {
        queryClient.invalidateQueries({ queryKey: ['suggested-actions'] });
      },
    });

    return unsubscribe;
  }, [isReady, organizationId, subscribe, queryClient]);

  const unreadCount = notifications?.length || 0;
  const criticalCount = notifications?.filter(
    (n: SuggestedAction) => n.priority === 'critical'
  ).length || 0;

  const markActedOn = useCallback((id: string) => {
    actOn({ actionId: id });
  }, [actOn]);

  return {
    notifications: notifications || [],
    unreadCount,
    criticalCount,
    isLoading,
    dismiss,
    isDismissing,
    markActedOn,
    isActing,
    refetch,
  };
}
