import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { logError, logInfo } from '@/lib/logger';

interface Organization {
  id: string;
  name: string;
  domain?: string;
  settings?: any;
  created_at: string;
  updated_at: string;
}

interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'manager' | 'member';
  is_active: boolean;
  organization: Organization;
}

interface OrganizationPermissions {
  canManageMembers: boolean;
  canManageSettings: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}

interface OrganizationState {
  currentOrganization: Organization | null;
  organizations: Organization[];
  membership: OrganizationMembership | null;
  permissions: OrganizationPermissions;
  loading: boolean;
  switchingOrganization: boolean;
  error: string | null;

  // Actions
  actions: {
    loadOrganizations: () => Promise<void>;
    switchOrganization: (organizationId: string) => Promise<void>;
    updateOrganization: (organizationId: string, updates: Partial<Organization>) => Promise<void>;
    setError: (error: string | null) => void;
    clearError: () => void;
    refreshPermissions: () => void;
  };
}

export const useOrganizationStore = create<OrganizationState>()(
  devtools(
    subscribeWithSelector(
      (set, get) => ({
        // Initial state
        currentOrganization: null,
        organizations: [],
        membership: null,
        loading: false,
        switchingOrganization: false,
        error: null,
        
        permissions: {
          canManageMembers: false,
          canManageSettings: false,
          canDelete: false,
          isAdmin: false
        },

        actions: {
          loadOrganizations: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              set({ error: 'User not authenticated' });
              return;
            }

            set({ loading: true, error: null });

            try {
              // Get user's organization memberships
              const { data: memberships, error: membershipError } = await supabase
                .from('organization_members')
                .select(`
                  *,
                  organization:organizations(*)
                `)
                .eq('user_id', user.id)
                .eq('is_active', true);

              if (membershipError) throw membershipError;

              const organizations = memberships?.map(m => m.organization).filter(Boolean) || [];
              
              set({ 
                organizations,
                currentOrganization: organizations[0] || null,
                membership: memberships?.[0] as OrganizationMembership || null
              });

              // Refresh permissions for current organization
              get().actions.refreshPermissions();

              logInfo('Organizations loaded', { 
                organizationCount: organizations.length,
                currentOrgId: organizations[0]?.id 
              });

            } catch (error: any) {
              logError('Failed to load organizations', { error: error.message });
              set({ error: error.message });
            } finally {
              set({ loading: false });
            }
          },

          switchOrganization: async (organizationId: string) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              set({ error: 'User not authenticated' });
              return;
            }

            set({ switchingOrganization: true, error: null });

            try {
              // Find the organization and membership
              const organization = get().organizations.find(org => org.id === organizationId);
              if (!organization) {
                throw new Error('Organization not found');
              }

              // Get updated membership info
              const { data: membership, error } = await supabase
                .from('organization_members')
                .select('*')
                .eq('user_id', user.id)
                .eq('organization_id', organizationId)
                .eq('is_active', true)
                .single();

              if (error) throw error;

              if (!membership) {
                throw new Error('You are not a member of this organization');
              }

              set({
                currentOrganization: organization,
                membership: { ...membership, organization } as OrganizationMembership
              });

              // Refresh permissions
              get().actions.refreshPermissions();

              logInfo('Organization switched', { 
                organizationId,
                role: membership.role 
              });

            } catch (error: any) {
              logError('Failed to switch organization', { 
                organizationId, 
                error: error.message 
              });
              set({ error: error.message });
            } finally {
              set({ switchingOrganization: false });
            }
          },

          updateOrganization: async (organizationId: string, updates: Partial<Organization>) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { membership } = get();
            
            if (!user || !membership || membership.role !== 'admin') {
              set({ error: 'Insufficient permissions' });
              return;
            }

            set({ loading: true, error: null });

            try {
              const { data: updatedOrg, error } = await supabase
                .from('organizations')
                .update({
                  ...updates,
                  updated_at: new Date().toISOString()
                })
                .eq('id', organizationId)
                .select()
                .single();

              if (error) throw error;

              // Update local state
              set(state => ({
                organizations: state.organizations.map(org => 
                  org.id === organizationId ? updatedOrg : org
                ),
                currentOrganization: state.currentOrganization?.id === organizationId 
                  ? updatedOrg 
                  : state.currentOrganization
              }));

              logInfo('Organization updated', { 
                organizationId,
                updatedFields: Object.keys(updates) 
              });

            } catch (error: any) {
              logError('Failed to update organization', { 
                organizationId, 
                error: error.message 
              });
              set({ error: error.message });
            } finally {
              set({ loading: false });
            }
          },

          setError: (error) => {
            set({ error });
            if (error) {
              logError('Organization store error', { error });
            }
          },

          clearError: () => {
            set({ error: null });
          },

          refreshPermissions: () => {
            const { membership } = get();
            
            if (!membership) {
              set({
                permissions: {
                  canManageMembers: false,
                  canManageSettings: false,
                  canDelete: false,
                  isAdmin: false
                }
              });
              return;
            }

            const isAdmin = membership.role === 'owner' || membership.role === 'admin';
            const isManager = membership.role === 'manager' || isAdmin;

            set({
              permissions: {
                canManageMembers: isAdmin,
                canManageSettings: isManager,
                canDelete: isAdmin,
                isAdmin
              }
            });
          }
        }
      })
    ),
    { name: 'OrganizationStore' }
  )
);

// Note: Auth state management is handled by AuthProvider
// This store is now decoupled from auth state for better maintainability

// Convenience hooks
export const useCurrentOrganization = () => useOrganizationStore(state => state.currentOrganization);
export const useOrganizations = () => useOrganizationStore(state => state.organizations);
export const useOrganizationPermissions = () => useOrganizationStore(state => state.permissions);
export const useOrganizationActions = () => useOrganizationStore(state => state.actions);
