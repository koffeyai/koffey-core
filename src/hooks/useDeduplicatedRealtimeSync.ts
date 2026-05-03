
import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from './useOrganizationAccess';
import { useGlobalRealtimeManager } from './useGlobalRealtimeManager';
import { useStrictModeCompatible } from './useStrictModeCompatible';
import { logDebug } from '@/lib/logger';

interface RealtimeSyncOptions {
  table: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  filter?: string;
}

export const useDeduplicatedRealtimeSync = (options: RealtimeSyncOptions) => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const { subscribe, isReady } = useGlobalRealtimeManager();
  const { isMounted, safeAsync } = useStrictModeCompatible();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const { table, onInsert, onUpdate, onDelete, filter } = options;

  const organizationId = currentOrganization?.organization_id;

  const handleInsert = useCallback((payload: any) => {
    if (!isMounted()) return;
    // Only process if the record belongs to the current organization
    if (payload.new.organization_id === organizationId) {
      onInsert?.(payload);
    }
  }, [onInsert, organizationId, isMounted]);

  const handleUpdate = useCallback((payload: any) => {
    if (!isMounted()) return;
    // Only process if the record belongs to the current organization
    if (payload.new.organization_id === organizationId) {
      onUpdate?.(payload);
    }
  }, [onUpdate, organizationId, isMounted]);

  const handleDelete = useCallback((payload: any) => {
    if (!isMounted()) return;
    // Only process if the record belonged to the current organization
    if (payload.old.organization_id === organizationId) {
      onDelete?.(payload);
    }
  }, [onDelete, organizationId, isMounted]);

  useEffect(() => {
    if (!isReady || !organizationId) {
      return;
    }

    logDebug('useDeduplicatedRealtimeSync: Setting up subscription', {
      table,
      organizationId,
      hasCallbacks: {
        insert: !!onInsert,
        update: !!onUpdate,
        delete: !!onDelete
      }
    });

    // Use safeAsync to handle potential component unmounting during setup
    const setupSubscription = safeAsync(async () => {
      // Clean up existing subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Create new subscription
      unsubscribeRef.current = subscribe({
        table,
        organizationId,
        filter: filter || `organization_id=eq.${organizationId}`,
        onInsert: handleInsert,
        onUpdate: handleUpdate,
        onDelete: handleDelete
      });
    }, `Failed to setup subscription for ${table}`);

    setupSubscription();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isReady, organizationId, table, filter, handleInsert, handleUpdate, handleDelete, subscribe, safeAsync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return {
    isConnected: isReady,
    reconnect: () => {
      // Reconnection is handled automatically by the global manager
      logDebug('useDeduplicatedRealtimeSync: Reconnect requested for', { table, organizationId });
    }
  };
};
