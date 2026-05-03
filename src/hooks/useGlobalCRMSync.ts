import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useUnifiedCRMStore } from '@/stores/unifiedCRMStore';
import { useRealtimeCacheBridge } from '@/hooks/useRealtimeCacheBridge';
import { logDebug, logInfo } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

/**
 * Global CRM sync hook - mount at app root level
 * Handles:
 * - Realtime bridge initialization
 * - Cache clearing on org switch
 * - Cache clearing on logout
 */
export const useGlobalCRMSync = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const clearAllCaches = useUnifiedCRMStore((s) => s.clearAllCaches);
  const setOrganizationId = useUnifiedCRMStore((s) => s.setOrganizationId);
  const currentOrgId = useUnifiedCRMStore((s) => s.currentOrganizationId);
  const prevOrgIdRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);

  // Mount realtime bridge for automatic store updates
  useRealtimeCacheBridge();

  // Handle organization changes
  useEffect(() => {
    const newOrgId = currentOrganization?.organization_id ?? null;

    // Only clear caches if org actually changed (not on initial mount)
    if (prevOrgIdRef.current !== null && newOrgId !== prevOrgIdRef.current) {
      logInfo('[GlobalCRMSync] Organization changed, clearing caches', {
        from: prevOrgIdRef.current,
        to: newOrgId,
      });
      clearAllCaches();
    }

    // Update store context
    if (newOrgId && newOrgId !== currentOrgId) {
      setOrganizationId(newOrgId);
    }

    prevOrgIdRef.current = newOrgId;
  }, [currentOrganization?.organization_id, clearAllCaches, setOrganizationId, currentOrgId]);

  // Handle logout
  useEffect(() => {
    const userId = user?.id ?? null;

    // Clear caches on logout
    if (prevUserIdRef.current !== null && userId === null) {
      logInfo('[GlobalCRMSync] User logged out, clearing caches');
      clearAllCaches();
    }

    prevUserIdRef.current = userId;
  }, [user?.id, clearAllCaches]);

  // Debug logging
  useEffect(() => {
    if (currentOrganization?.organization_id && user) {
      logDebug('[GlobalCRMSync] Active', {
        orgId: currentOrganization.organization_id,
        userId: user.id,
      });
    }
  }, [currentOrganization?.organization_id, user]);

  // Prefetch entity counts on organization load (deferred to avoid blocking initial render)
  useEffect(() => {
    if (!currentOrganization?.organization_id) return;

    const orgId = currentOrganization.organization_id;

    const prefetchCounts = async () => {
      const setTotalCount = useUnifiedCRMStore.getState().setTotalCount;

      try {
        const [contactsResult, dealsResult, accountsResult, tasksResult, activitiesResult] = await Promise.all([
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
          supabase.from('deals').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
          supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
          supabase.from('activities').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
        ]);

        if (contactsResult.count !== null) setTotalCount('contacts', contactsResult.count);
        if (dealsResult.count !== null) setTotalCount('deals', dealsResult.count);
        if (accountsResult.count !== null) setTotalCount('accounts', accountsResult.count);
        if (tasksResult.count !== null) setTotalCount('tasks', tasksResult.count);
        if (activitiesResult.count !== null) setTotalCount('activities', activitiesResult.count);

        logInfo('[GlobalCRMSync] Prefetched entity counts', {
          contacts: contactsResult.count,
          deals: dealsResult.count,
          accounts: accountsResult.count,
          tasks: tasksResult.count,
          activities: activitiesResult.count,
        });
      } catch (error) {
        logDebug('[GlobalCRMSync] Failed to prefetch counts', { error });
      }
    };

    // Defer to idle time so it doesn't compete with initial render
    const id = 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback(() => prefetchCounts())
      : setTimeout(prefetchCounts, 500);

    return () => {
      if ('requestIdleCallback' in window) {
        (window as any).cancelIdleCallback(id);
      } else {
        clearTimeout(id);
      }
    };
  }, [currentOrganization?.organization_id]);
};
