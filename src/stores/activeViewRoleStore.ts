import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SalesRole = 'sdr' | 'ae' | 'manager' | 'revops' | 'marketing' | 'admin' | 'product';

interface ActiveViewRoleState {
  activeViewRole: SalesRole;
  assignedRole: SalesRole;
  isOverride: boolean;

  setActiveViewRole: (role: SalesRole) => void;
  setAssignedRole: (role: SalesRole) => void;
  resetToAssigned: () => void;
}

export const useActiveViewRoleStore = create<ActiveViewRoleState>()(
  persist(
    (set, get) => ({
      activeViewRole: 'ae',
      assignedRole: 'ae',
      isOverride: false,

      setActiveViewRole: (role) => set({
        activeViewRole: role,
        isOverride: role !== get().assignedRole,
      }),

      setAssignedRole: (role) => {
        const state = get();
        set({
          assignedRole: role,
          ...(state.isOverride ? {} : { activeViewRole: role }),
        });
      },

      resetToAssigned: () => set((state) => ({
        activeViewRole: state.assignedRole,
        isOverride: false,
      })),
    }),
    {
      name: 'koffey-active-view-role',
    }
  )
);
