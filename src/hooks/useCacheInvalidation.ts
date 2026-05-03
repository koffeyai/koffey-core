import { useCallback } from 'react';
import { unifiedCacheManager } from '@/lib/cache';
import { useQueryClient } from '@tanstack/react-query';
import { logInfo } from '@/lib/logger';

export const useCacheInvalidation = () => {
  const queryClient = useQueryClient();

  // INVALIDATE AFTER CRM OPERATIONS
  const invalidateAfterCreate = useCallback((
    entityType: string,
    entityData: any
  ) => {
    // Invalidate entity list
    unifiedCacheManager.invalidateQueries([entityType]);
    
    // Invalidate related analytics
    unifiedCacheManager.invalidateQueries(['analytics'], { cascade: false });
    
    // If entity has relationships, invalidate those too
    if (entityData.contact_id) {
      unifiedCacheManager.invalidateQueries(['contacts']);
    }
    if (entityData.account_id) {
      unifiedCacheManager.invalidateQueries(['accounts']);
    }
    
    logInfo('Cache invalidated after create', {
      entityType,
      entityId: entityData.id
    });
  }, []);

  const invalidateAfterUpdate = useCallback((
    entityType: string,
    entityId: string,
    updates: any
  ) => {
    // Invalidate specific entity
    unifiedCacheManager.invalidateQueries([entityType, entityId]);
    
    // Invalidate entity list if searchable fields changed
    const searchableFields = ['name', 'full_name', 'email', 'company', 'title'];
    const hasSearchableUpdate = Object.keys(updates).some(key => 
      searchableFields.includes(key)
    );
    
    if (hasSearchableUpdate) {
      unifiedCacheManager.invalidateQueries([entityType]);
    }
    
    logInfo('Cache invalidated after update', {
      entityType,
      entityId,
      updatedFields: Object.keys(updates)
    });
  }, []);

  const invalidateAfterDelete = useCallback((
    entityType: string,
    entityId: string
  ) => {
    // Remove specific entity from cache
    queryClient.removeQueries({ queryKey: [entityType, entityId] });
    
    // Invalidate entity list
    unifiedCacheManager.invalidateQueries([entityType]);
    
    // Invalidate analytics
    unifiedCacheManager.invalidateQueries(['analytics'], { cascade: false });
    
    logInfo('Cache invalidated after delete', {
      entityType,
      entityId
    });
  }, [queryClient]);

  const invalidateAfterBulkOperation = useCallback((
    entityType: string,
    operation: 'create' | 'update' | 'delete',
    entityIds: string[]
  ) => {
    // Invalidate entire entity type
    unifiedCacheManager.invalidateQueries([entityType]);
    
    // Invalidate analytics
    unifiedCacheManager.invalidateQueries(['analytics'], { cascade: false });
    
    // Remove specific entities for delete operations
    if (operation === 'delete') {
      entityIds.forEach(id => {
        queryClient.removeQueries({ queryKey: [entityType, id] });
      });
    }
    
    logInfo('Cache invalidated after bulk operation', {
      entityType,
      operation,
      entityCount: entityIds.length
    });
  }, [queryClient]);

  // OPTIMISTIC UPDATE HELPERS
  const applyOptimisticUpdate = useCallback(<T>(
    queryKey: any[],
    updater: (oldData: T | undefined) => T
  ) => {
    return unifiedCacheManager.setOptimisticData(queryKey, updater);
  }, []);

  return {
    invalidateAfterCreate,
    invalidateAfterUpdate,
    invalidateAfterDelete,
    invalidateAfterBulkOperation,
    applyOptimisticUpdate
  };
};