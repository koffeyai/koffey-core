import { useEffect, useState } from 'react';
import { useGlobalRealtimeManager } from './useGlobalRealtimeManager';
import { queryClient } from '@/lib/cache';
import { useOrganizationAccess } from './useOrganizationAccess';
import { logDebug, logInfo } from '@/lib/logger';
import { useUnifiedCRMStore, CRMEntityType } from '@/stores/unifiedCRMStore';
import { crmEventBus } from '@/lib/crmEventBus';

// Configuration: Map tables to cache invalidation strategies
const SYNC_CONFIG: Array<{
  table: CRMEntityType;
  cacheKeys: string[];
  cascadeInvalidate: string[];
}> = [
  {
    table: 'contacts',
    cacheKeys: ['contacts'],
    cascadeInvalidate: ['activities', 'deals']
  },
  {
    table: 'accounts',
    cacheKeys: ['accounts'],
    cascadeInvalidate: ['contacts', 'deals']
  },
  {
    table: 'deals',
    cacheKeys: ['deals', 'opportunities'],
    cascadeInvalidate: ['activities']
  },
  {
    table: 'activities',
    cacheKeys: ['activities'],
    cascadeInvalidate: []
  },
  {
    table: 'tasks',
    cacheKeys: ['tasks'],
    cascadeInvalidate: []
  }
];

// Check for conflicts between pending local changes and incoming server changes
const detectConflict = (
  entityType: CRMEntityType,
  entityId: string,
  serverEntity: Record<string, any>
): boolean => {
  const store = useUnifiedCRMStore.getState();
  const pendingChange = store.getPendingChange(entityType, entityId);
  
  if (!pendingChange) return false;
  
  // Check if server version is newer than what we started with
  const localVersion = pendingChange.originalVersion || 0;
  const serverVersion = serverEntity.version || 0;
  
  if (serverVersion > localVersion) {
    // Determine conflicting fields
    const conflictingFields = Object.keys(pendingChange.changes).filter(
      (field) => serverEntity[field] !== pendingChange.changes[field]
    );
    
    if (conflictingFields.length > 0) {
      store.addConflict({
        entityType,
        entityId,
        localChanges: pendingChange.changes,
        serverChanges: serverEntity,
        conflictingFields,
        serverVersion,
        localVersion,
      });
      
      crmEventBus.emitConflict({
        entityType,
        entityId,
        localChanges: pendingChange.changes,
        serverChanges: serverEntity,
        conflictingFields,
        serverVersion,
        localVersion,
      });
      
      return true;
    }
  }
  
  return false;
};

export const useRealtimeCacheBridge = () => {
  const { subscribe, isReady } = useGlobalRealtimeManager();
  const { currentOrganization } = useOrganizationAccess();
  const [deferred, setDeferred] = useState(false);

  // Defer realtime subscriptions until after initial render to avoid blocking first paint
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setTimeout(() => setDeferred(true), 100);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // NOTE: Store actions are now accessed via getState() inside callbacks
  // to prevent unnecessary re-renders when store changes.
  // This breaks the feedback loop where store updates → component re-render → effect re-runs

  useEffect(() => {
    if (!deferred || !isReady || !currentOrganization) {
      logDebug('RealtimeCacheBridge: Not ready', { isReady, hasOrg: !!currentOrganization });
      return;
    }

    const organizationId = currentOrganization.organization_id;
    const unsubscribes: Array<() => void> = [];

    // Update store's organization context (one-time setup)
    useUnifiedCRMStore.getState().setOrganizationId(organizationId);

    logDebug('RealtimeCacheBridge: Mounting bridge for org:', organizationId);

    SYNC_CONFIG.forEach(({ table, cacheKeys, cascadeInvalidate }) => {
      const unsubscribe = subscribe({
        table,
        organizationId,
        
        // INSERT: Update unified store + increment count + invalidate list views
        onInsert: (payload) => {
          console.log(`🔄 [Sync][Realtime] INSERT on ${table}`, {
            id: payload.new?.id,
            org: payload.new?.organization_id,
            timestamp: new Date().toISOString()
          });
          logDebug(`[${table}] INSERT detected`, payload.new);
          
          // Pull store actions inside callback to avoid component-level subscriptions
          const { upsertEntity, incrementTotalCount } = useUnifiedCRMStore.getState();
          
          // 1. Update unified CRM store
          upsertEntity(table, payload.new as any);
          
          // 2. Increment total count for accurate dashboard metrics
          incrementTotalCount(table);
          
          // 3. Emit event for interested components
          crmEventBus.emitEntityCreated(table, payload.new, 'realtime');
          
          // 4. Invalidate React Query cache - use correct key structure matching useCRM
          console.log(`🔄 [Sync][Realtime] Invalidating cache key: ['crm', '${table}', '${organizationId}']`);
          queryClient.invalidateQueries({
            queryKey: ['crm', table, organizationId],
            refetchType: 'active'
          });
          
          // 5. Cascade to dependent data
          cascadeInvalidate.forEach(dependentKey => {
            console.log(`🔄 [Sync][Realtime] Cascade invalidate: ${dependentKey}`);
            queryClient.invalidateQueries({
              queryKey: ['crm', dependentKey, organizationId],
              refetchType: 'none'
            });
          });
        },
        
        // UPDATE: Check for conflicts, update store, invalidate caches
        onUpdate: (payload) => {
          console.log(`🔄 [Sync][Realtime] UPDATE on ${table}`, {
            id: payload.new?.id,
            org: payload.new?.organization_id,
            timestamp: new Date().toISOString()
          });
          logDebug(`[${table}] UPDATE detected`, payload.new);
          
          const entityId = payload.new.id;
          const previousEntity = payload.old;
          
          // Pull store actions inside callback
          const { upsertEntity, removePendingChange } = useUnifiedCRMStore.getState();
          
          // 1. Check for conflicts with pending local changes
          const hasConflict = detectConflict(table, entityId, payload.new);
          
          if (!hasConflict) {
            // 2. No conflict - update unified CRM store
            upsertEntity(table, payload.new as any);
            
            // 3. Clear any pending change since server state is now authoritative
            removePendingChange(table, entityId);
            
            // 4. Emit event
            crmEventBus.emitEntityUpdated(table, payload.new, previousEntity, 'realtime');
          } else {
            console.warn(`🔄 [Sync][Realtime] CONFLICT detected for ${table}:${entityId}`);
          }
          
          // 5. Invalidate React Query caches - use correct key structure matching useCRM
          console.log(`🔄 [Sync][Realtime] Invalidating cache key: ['crm', '${table}', '${organizationId}']`);
          queryClient.invalidateQueries({
            queryKey: ['crm', table, organizationId],
            refetchType: 'active'
          });
          
          // 6. Cascade invalidation
          cascadeInvalidate.forEach(dependentKey => {
            console.log(`🔄 [Sync][Realtime] Cascade invalidate: ${dependentKey}`);
            queryClient.invalidateQueries({
              queryKey: ['crm', dependentKey, organizationId],
              refetchType: 'none'
            });
          });
        },
        
        // DELETE: Remove from store, decrement count, and invalidate caches
        onDelete: (payload) => {
          console.log(`🔄 [Sync][Realtime] DELETE on ${table}`, {
            id: payload.old?.id,
            org: payload.old?.organization_id,
            timestamp: new Date().toISOString()
          });
          logDebug(`[${table}] DELETE detected`, payload.old);
          
          // Pull store actions inside callback
          const { removeEntity, decrementTotalCount } = useUnifiedCRMStore.getState();
          
          const entityId = payload.old.id;
          
          // 1. Remove from unified CRM store
          removeEntity(table, entityId);
          
          // 2. Decrement total count for accurate dashboard metrics
          decrementTotalCount(table);
          
          // 3. Emit event
          crmEventBus.emitEntityDeleted(table, entityId, 'realtime');
          
          // 4. Invalidate React Query cache - use correct key structure matching useCRM
          console.log(`🔄 [Sync][Realtime] Invalidating cache key: ['crm', '${table}', '${organizationId}']`);
          queryClient.invalidateQueries({
            queryKey: ['crm', table, organizationId],
            refetchType: 'active'
          });
        }
      });

      unsubscribes.push(unsubscribe);
    });

    logInfo(`RealtimeCacheBridge: ${SYNC_CONFIG.length} table bridges active`);

    return () => {
      logDebug('RealtimeCacheBridge: Unmounting, cleaning up subscriptions');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [deferred, isReady, currentOrganization?.organization_id, subscribe]);
  
  return {
    isActive: isReady && !!currentOrganization,
    bridgedTables: SYNC_CONFIG.map(c => c.table)
  };
};
