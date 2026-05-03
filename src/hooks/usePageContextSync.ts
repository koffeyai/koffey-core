import { useEffect, useMemo, useCallback } from 'react';
import { useChatContext, PageContextData } from '@/components/layout/CRMLayoutWithChat';
import { useDebounce } from './useDebounce';

interface UsePageContextSyncOptions<T> {
  entityType: string;
  entities: T[];
  getEntityName: (entity: T) => string;
  searchTerm?: string;
  maxEntities?: number;
  debounceMs?: number;
}

/**
 * Hook to sync visible page entities to ChatContext for AI page-awareness.
 * Debounces updates to prevent rapid re-renders during search typing.
 * 
 * @param options Configuration for entity syncing
 * @param options.entityType The type of entity (e.g., 'deals', 'contacts', 'accounts')
 * @param options.entities Array of entities currently visible on the page
 * @param options.getEntityName Function to extract display name from entity
 * @param options.searchTerm Current search term (if any)
 * @param options.maxEntities Maximum entities to sync (default: 50)
 * @param options.debounceMs Debounce delay in ms (default: 300)
 */
export function usePageContextSync<T extends { id: string }>({
  entityType,
  entities,
  getEntityName,
  searchTerm,
  maxEntities = 50,
  debounceMs = 300,
}: UsePageContextSyncOptions<T>) {
  const { setTabData } = useChatContext();

  // Memoize getEntityName to ensure stable reference
  const stableGetEntityName = useCallback(getEntityName, [getEntityName]);

  // Memoize the context data to prevent unnecessary recalculations
  const contextData = useMemo((): PageContextData => ({
    entityType,
    entities: entities.slice(0, maxEntities).map(entity => ({
      id: entity.id,
      name: stableGetEntityName(entity),
    })),
    totalCount: entities.length,
    searchTerm: searchTerm || undefined,
  }), [entities, entityType, searchTerm, stableGetEntityName, maxEntities]);

  // Debounce the context data - prevents rapid updates during search typing
  const debouncedContext = useDebounce(contextData, debounceMs);

  // Sync debounced context to ChatContext
  useEffect(() => {
    if (setTabData) {
      setTabData(debouncedContext);
    }

    // Cleanup when component unmounts
    return () => {
      if (setTabData) {
        setTabData(null);
      }
    };
  }, [debouncedContext, setTabData]);
}
