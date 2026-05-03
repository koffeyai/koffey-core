import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logError, logInfo } from '@/lib/logger';
import { useAuth } from '@/components/auth/AuthProvider';
import { useActiveViewRoleStore, type SalesRole } from '@/stores/activeViewRoleStore';

export interface Organization {
  id: string;
  name: string;
  domain: string | null;
  created_at?: string;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'member';
  is_active: boolean;
  joined_at: string;
  organization: Organization;
  sales_role: SalesRole;
  sales_role_status: 'pending' | 'approved';
}

export interface UseOrganizationAccessReturn {
  // Primary data
  currentOrganization: OrganizationMembership | null;

  // For multi-org support
  memberships: OrganizationMembership[];
  hasMultipleOrganizations: boolean;

  // Convenience accessors
  organizationId: string | null;
  organizationName: string | null;
  userRole: 'admin' | 'manager' | 'member' | null;
  salesRole: SalesRole;
  salesRoleStatus: 'pending' | 'approved';
  isAdmin: boolean;
  isManager: boolean;

  // State
  loading: boolean;
  hasOrganization: boolean;
  error: string | null;

  // Multi-org UI state
  showSelector: boolean;

  // Actions
  selectOrganization: (organizationId: string) => void;
  openSelector: () => void;
  closeSelector: () => void;
  refreshMembership: () => void;
}

const LOCALSTORAGE_ORG_KEY = 'selectedOrganizationId';

// ─── Module-level fetch deduplication ────────────────────────────────────────
// 80+ components call useOrganizationAccess(). Instead of each firing its own
// Supabase query, we deduplicate at the network level: one in-flight request,
// one cached result, shared across all hook instances. Each instance keeps its
// own React state so re-renders work through normal React lifecycle.
let _fetchPromise: Promise<OrganizationMembership[]> | null = null;
let _cachedResult: {
  userId: string;
  memberships: OrganizationMembership[];
  fetchedAt: number;
} | null = null;
const CACHE_DURATION = 30000; // 30 seconds

async function fetchMembershipsShared(
  userId: string,
  force = false
): Promise<OrganizationMembership[]> {
  // Return cached data if fresh
  if (
    !force &&
    _cachedResult &&
    _cachedResult.userId === userId &&
    Date.now() - _cachedResult.fetchedAt < CACHE_DURATION
  ) {
    return _cachedResult.memberships;
  }

  // Deduplicate in-flight fetches
  if (_fetchPromise && !force) {
    return _fetchPromise;
  }

  _fetchPromise = (async () => {
    try {
      const { data: membershipData, error: membershipError } = await supabase
        .from('organization_members')
        .select(`
          id,
          organization_id,
          user_id,
          role,
          is_active,
          joined_at,
          sales_role,
          sales_role_status,
          organization:organizations!organization_members_organization_id_fkey (
            id,
            name,
            domain,
            created_at
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('joined_at', { ascending: false });

      if (membershipError) throw membershipError;

      const validMemberships: OrganizationMembership[] = (membershipData || [])
        .filter(m => m.organization)
        .map(m => ({
          id: m.id,
          organization_id: m.organization_id,
          user_id: m.user_id,
          role: m.role as 'admin' | 'manager' | 'member',
          is_active: m.is_active,
          joined_at: m.joined_at || new Date().toISOString(),
          organization: {
            id: (m.organization as any).id,
            name: (m.organization as any).name,
            domain: (m.organization as any).domain,
            created_at: (m.organization as any).created_at
          },
          sales_role: (m.sales_role as SalesRole) || 'ae',
          sales_role_status: (m.sales_role_status as 'pending' | 'approved') || 'approved',
        }));

      _cachedResult = { userId, memberships: validMemberships, fetchedAt: Date.now() };

      logInfo('Organization memberships loaded', {
        count: validMemberships.length,
        userId,
      });

      return validMemberships;
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}
// ─── End deduplication ───────────────────────────────────────────────────────

export const useOrganizationAccess = (): UseOrganizationAccessReturn => {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);

  const fetchMemberships = useCallback(async (force = false) => {
    if (!user?.id) {
      setLoading(false);
      setMemberships([]);
      setCurrentOrganization(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const validMemberships = await fetchMembershipsShared(user.id, force);

      setMemberships(validMemberships);
      restoreOrSelectOrganization(validMemberships);

      // Initialize the active view role store from the database
      if (validMemberships.length > 0) {
        const stored = localStorage.getItem(LOCALSTORAGE_ORG_KEY);
        const active = validMemberships.find(m => m.organization_id === stored) || validMemberships[0];
        if (active.sales_role) {
          useActiveViewRoleStore.getState().setAssignedRole(active.sales_role);
        }
      }
    } catch (err: any) {
      logError('Failed to load organization memberships', err);
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Restore organization from localStorage or auto-select
  const restoreOrSelectOrganization = (orgs: OrganizationMembership[]) => {
    if (orgs.length === 0) {
      setCurrentOrganization(null);
      setShowSelector(false);
      return;
    }

    if (orgs.length === 1) {
      setCurrentOrganization(orgs[0]);
      setShowSelector(false);
      localStorage.setItem(LOCALSTORAGE_ORG_KEY, orgs[0].organization_id);
      return;
    }

    const storedOrgId = localStorage.getItem(LOCALSTORAGE_ORG_KEY);
    const storedOrg = orgs.find(m => m.organization_id === storedOrgId);

    if (storedOrg) {
      setCurrentOrganization(storedOrg);
      setShowSelector(false);
    } else {
      setShowSelector(true);
    }
  };

  const selectOrganization = useCallback((organizationId: string) => {
    const membership = memberships.find(m => m.organization_id === organizationId);
    if (membership) {
      setCurrentOrganization(membership);
      setShowSelector(false);
      localStorage.setItem(LOCALSTORAGE_ORG_KEY, organizationId);
      logInfo('Organization selected', { organizationId });
    }
  }, [memberships]);

  const openSelector = useCallback(() => {
    if (memberships.length > 1) {
      setShowSelector(true);
    }
  }, [memberships.length]);

  const closeSelector = useCallback(() => {
    setShowSelector(false);
  }, []);

  const refreshMembership = useCallback(() => {
    if (user) {
      // Invalidate the module-level cache so the next fetch hits the network
      _cachedResult = null;
      fetchMemberships(true);
    }
  }, [user, fetchMemberships]);

  // Initial fetch on user change
  useEffect(() => {
    if (user) {
      fetchMemberships();
    } else {
      setMemberships([]);
      setCurrentOrganization(null);
      setShowSelector(false);
      setLoading(false);
    }
  }, [user, fetchMemberships]);

  // Derived values
  const organizationId = currentOrganization?.organization_id ?? null;
  const organizationName = currentOrganization?.organization?.name ?? null;
  const userRole = currentOrganization?.role ?? null;
  const salesRole: SalesRole = currentOrganization?.sales_role ?? 'ae';
  const salesRoleStatus = currentOrganization?.sales_role_status ?? 'approved';
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager' || isAdmin;
  const hasOrganization = !!currentOrganization;
  const hasMultipleOrganizations = memberships.length > 1;

  return {
    currentOrganization,
    memberships,
    hasMultipleOrganizations,
    organizationId,
    organizationName,
    userRole,
    salesRole,
    salesRoleStatus,
    isAdmin,
    isManager,
    loading,
    hasOrganization,
    error,
    showSelector,
    selectOrganization,
    openSelector,
    closeSelector,
    refreshMembership,
  };
};

// Convenience hook for components that only need organization ID
export const useOrganizationId = (): string | null => {
  const { organizationId } = useOrganizationAccess();
  return organizationId;
};
