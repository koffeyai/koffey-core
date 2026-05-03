import { useMemo } from 'react';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useAuth } from '@/components/auth/AuthProvider';

export interface UserRole {
  type: 'sales_rep' | 'manager' | 'admin' | 'member';
  isManager: boolean;
  isSalesRep: boolean;
  isAdmin: boolean;
  canViewTeamData: boolean;
  canManageTeam: boolean;
}

export const useRoleBasedAccess = () => {
  const { user } = useAuth();
  const { currentOrganization, isAdmin, isManager } = useOrganizationAccess();

  const userRole = useMemo((): UserRole => {
    if (!currentOrganization || !user) {
      return {
        type: 'member',
        isManager: false,
        isSalesRep: false,
        isAdmin: false,
        canViewTeamData: false,
        canManageTeam: false,
      };
    }

    const role = currentOrganization.role;
    const isSalesRep = role === 'member'; // Assume members are sales reps by default

    return {
      type: isAdmin ? 'admin' : isManager ? 'manager' : 'sales_rep',
      isManager,
      isSalesRep,
      isAdmin,
      canViewTeamData: isManager || isAdmin,
      canManageTeam: isAdmin,
    };
  }, [currentOrganization, user, isAdmin, isManager]);

  return {
    userRole,
    userId: user?.id,
    organizationId: currentOrganization?.organization_id,
  };
};
