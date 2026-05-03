import { useEffect, useRef, useCallback } from 'react';
import { crmEventBus, CRMEventType } from '@/lib/crmEventBus';
import { CRMEntityType } from '@/stores/unifiedCRMStore';
import { logDebug } from '@/lib/logger';

/**
 * Debounced analytics sync hook
 * Listens for analytics:invalidate events and batches them to prevent excessive RPC calls
 */
export const useAnalyticsSync = (
  onInvalidate: (entityTypes: Set<CRMEntityType>) => void,
  debounceMs = 1000
) => {
  const pendingInvalidations = useRef(new Set<CRMEntityType>());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  const flush = useCallback(() => {
    if (pendingInvalidations.current.size > 0) {
      logDebug('[AnalyticsSync] Flushing invalidations', {
        types: Array.from(pendingInvalidations.current),
      });
      onInvalidateRef.current(new Set(pendingInvalidations.current));
      pendingInvalidations.current.clear();
    }
  }, []);

  useEffect(() => {
    const unsubscribe = crmEventBus.subscribe<{ entityType: CRMEntityType }>(
      'analytics:invalidate',
      (event) => {
        if (event.payload?.entityType) {
          pendingInvalidations.current.add(event.payload.entityType);

          // Debounce: wait for activity to settle
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(flush, debounceMs);
        }
      }
    );

    return () => {
      unsubscribe();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Flush any pending on unmount
      flush();
    };
  }, [debounceMs, flush]);

  return { flush };
};
