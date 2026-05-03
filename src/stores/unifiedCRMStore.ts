import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { logDebug, logInfo } from '@/lib/logger';
import type {
  CRMEntityType,
  Contact,
  Account,
  Deal,
  Activity,
  Task,
  EntityTypeMap,
  PendingChange,
  ConflictInfo,
  ServerAggregates,
  UnifiedCRMState,
  UnifiedCRMActions,
  BaseEntity,
} from '@/types/crm';

// Re-export all types for backward compatibility
export type {
  CRMEntityType,
  BaseEntity,
  Contact,
  Account,
  Deal,
  Activity,
  Task,
  EntityTypeMap,
  PendingChange,
  ConflictInfo,
  ServerAggregates,
  UnifiedCRMState,
  UnifiedCRMActions,
} from '@/types/crm';

// =============================================================================
// INITIAL STATE
// =============================================================================

const createInitialState = (): UnifiedCRMState => ({
  entities: {
    contacts: new Map(),
    accounts: new Map(),
    deals: new Map(),
    activities: new Map(),
    tasks: new Map(),
  },
  arrayCache: {
    contacts: [],
    accounts: [],
    deals: [],
    activities: [],
    tasks: [],
  },
  loadedPages: {
    contacts: new Set(),
    accounts: new Set(),
    deals: new Set(),
    activities: new Set(),
    tasks: new Set(),
  },
  totalCounts: {
    contacts: null,
    accounts: null,
    deals: null,
    activities: null,
    tasks: null,
  },
  serverAggregates: {
    pipelineHealth: null,
    dataQuality: null,
    lastFetchedAt: {},
  },
  pendingChanges: new Map(),
  conflicts: [],
  lastSyncedAt: {
    contacts: 0,
    accounts: 0,
    deals: 0,
    activities: 0,
    tasks: 0,
  },
  syncStatus: 'idle',
  currentOrganizationId: null,
});

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useUnifiedCRMStore = create<UnifiedCRMState & UnifiedCRMActions>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    // =========================================================================
    // ENTITY OPERATIONS
    // =========================================================================

    upsertEntity: (type, entity) => {
      set((state) => {
        const currentMap = state.entities[type] as Map<string, any>;
        const newMap = new Map(currentMap);
        newMap.set(entity.id, entity as any);

        // Rebuild array cache immediately
        const newArray = Array.from(newMap.values());

        logDebug(`[UnifiedCRM] Upserted ${type}`, { id: entity.id });

        return {
          entities: {
            ...state.entities,
            [type]: newMap,
          },
          arrayCache: {
            ...state.arrayCache,
            [type]: newArray,
          },
        };
      });
    },

    upsertEntities: (type, entities) => {
      if (!entities.length) return;

      set((state) => {
        const currentMap = state.entities[type] as Map<string, any>;
        const newMap = new Map(currentMap);
        entities.forEach((entity) => {
          newMap.set(entity.id, entity as any);
        });

        // Rebuild array cache immediately
        const newArray = Array.from(newMap.values());

        logDebug(`[UnifiedCRM] Upserted ${entities.length} ${type}`);

        return {
          entities: {
            ...state.entities,
            [type]: newMap,
          },
          arrayCache: {
            ...state.arrayCache,
            [type]: newArray,
          },
        };
      });
    },

    removeEntity: (type, entityId) => {
      set((state) => {
        const currentMap = state.entities[type] as Map<string, any>;
        const newMap = new Map(currentMap);
        newMap.delete(entityId);

        // Also remove any pending changes
        const pendingKey = `${type}:${entityId}`;
        const newPending = new Map(state.pendingChanges);
        newPending.delete(pendingKey);

        // Rebuild array cache immediately
        const newArray = Array.from(newMap.values());

        logDebug(`[UnifiedCRM] Removed ${type}`, { id: entityId });

        return {
          entities: {
            ...state.entities,
            [type]: newMap,
          },
          arrayCache: {
            ...state.arrayCache,
            [type]: newArray,
          },
          pendingChanges: newPending,
        };
      });
    },

    getEntity: (type, entityId) => {
      const entityMap = get().entities[type] as Map<string, any>;
      return entityMap.get(entityId) as any;
    },

    getEntities: (type) => {
      // Return cached array for stable references
      return get().arrayCache[type] as any;
    },

    // Rebuild array cache for a specific entity type
    rebuildArrayCache: (type) => {
      set((state) => {
        const map = state.entities[type] as Map<string, any>;
        const newArray = Array.from(map.values());
        return {
          arrayCache: {
            ...state.arrayCache,
            [type]: newArray,
          },
        };
      });
    },

    // =========================================================================
    // PAGE TRACKING
    // =========================================================================

    markPageLoaded: (type, page) => {
      set((state) => {
        const newSet = new Set(state.loadedPages[type]);
        newSet.add(page);
        return {
          loadedPages: {
            ...state.loadedPages,
            [type]: newSet,
          },
        };
      });
    },

    isPageLoaded: (type, page) => {
      return get().loadedPages[type].has(page);
    },

    clearLoadedPages: (type) => {
      set((state) => ({
        loadedPages: {
          ...state.loadedPages,
          [type]: new Set(),
        },
      }));
    },

    // =========================================================================
    // TOTAL COUNTS (SERVER-PROVIDED)
    // =========================================================================

    setTotalCount: (type, count) => {
      // Idempotent guard - prevents unnecessary state updates and render cascades
      const current = get().totalCounts[type];
      if (current === count) return;

      set((state) => ({
        totalCounts: {
          ...state.totalCounts,
          [type]: count,
        },
      }));
      logDebug(`[UnifiedCRM] Set ${type} total count: ${count}`);
    },

    incrementTotalCount: (type) => {
      set((state) => {
        const current = state.totalCounts[type];
        if (current === null) return state;
        return {
          totalCounts: {
            ...state.totalCounts,
            [type]: current + 1,
          },
        };
      });
    },

    decrementTotalCount: (type) => {
      set((state) => {
        const current = state.totalCounts[type];
        if (current === null || current <= 0) return state;
        return {
          totalCounts: {
            ...state.totalCounts,
            [type]: current - 1,
          },
        };
      });
    },

    // =========================================================================
    // SERVER AGGREGATES
    // =========================================================================

    setServerAggregates: (key, data) => {
      set((state) => ({
        serverAggregates: {
          ...state.serverAggregates,
          [key]: data,
          lastFetchedAt: {
            ...state.serverAggregates.lastFetchedAt,
            [key]: Date.now(),
          },
        },
      }));
    },

    // =========================================================================
    // PENDING CHANGES (CONFLICT DETECTION)
    // =========================================================================

    addPendingChange: (change) => {
      const key = `${change.entityType}:${change.entityId}`;
      set((state) => {
        const newPending = new Map(state.pendingChanges);
        newPending.set(key, { ...change, timestamp: Date.now() });
        return { pendingChanges: newPending };
      });
    },

    removePendingChange: (entityType, entityId) => {
      const key = `${entityType}:${entityId}`;
      set((state) => {
        const newPending = new Map(state.pendingChanges);
        newPending.delete(key);
        return { pendingChanges: newPending };
      });
    },

    getPendingChange: (entityType, entityId) => {
      const key = `${entityType}:${entityId}`;
      return get().pendingChanges.get(key);
    },

    hasPendingChanges: (entityType, entityId) => {
      const key = `${entityType}:${entityId}`;
      return get().pendingChanges.has(key);
    },

    // =========================================================================
    // CONFLICT MANAGEMENT
    // =========================================================================

    addConflict: (conflict) => {
      set((state) => ({
        conflicts: [...state.conflicts.filter(
          c => !(c.entityType === conflict.entityType && c.entityId === conflict.entityId)
        ), conflict],
      }));

      logInfo('[UnifiedCRM] Conflict detected', {
        type: conflict.entityType,
        id: conflict.entityId,
        fields: conflict.conflictingFields,
      });
    },

    resolveConflict: (entityType, entityId) => {
      set((state) => ({
        conflicts: state.conflicts.filter(
          c => !(c.entityType === entityType && c.entityId === entityId)
        ),
      }));
    },

    // =========================================================================
    // SYNC OPERATIONS
    // =========================================================================

    setSyncStatus: (status) => {
      set({ syncStatus: status });
    },

    updateLastSynced: (type) => {
      set((state) => ({
        lastSyncedAt: {
          ...state.lastSyncedAt,
          [type]: Date.now(),
        },
      }));
    },

    // =========================================================================
    // ORGANIZATION CONTEXT
    // =========================================================================

    setOrganizationId: (orgId) => {
      const currentOrgId = get().currentOrganizationId;

      // Clear caches if organization changed
      if (currentOrgId !== orgId) {
        logInfo('[UnifiedCRM] Organization changed, clearing caches');
        set({
          ...createInitialState(),
          currentOrganizationId: orgId,
        });
      } else {
        set({ currentOrganizationId: orgId });
      }
    },

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    clearEntityCache: (type) => {
      set((state) => ({
        entities: {
          ...state.entities,
          [type]: new Map(),
        },
        arrayCache: {
          ...state.arrayCache,
          [type]: [],
        },
        loadedPages: {
          ...state.loadedPages,
          [type]: new Set(),
        },
        totalCounts: {
          ...state.totalCounts,
          [type]: null,
        },
      }));

      logDebug(`[UnifiedCRM] Cleared ${type} cache`);
    },

    clearAllCaches: () => {
      set(createInitialState());
      logInfo('[UnifiedCRM] Cleared all caches');
    },

    // =========================================================================
    // COUNTS (Prefer server total, fallback to loaded count)
    // =========================================================================

    getEntityCount: (type) => {
      const state = get();
      const serverTotal = state.totalCounts[type];
      // Prefer server total if available
      if (serverTotal !== null) {
        return serverTotal;
      }
      // Fall back to loaded count
      return state.entities[type].size;
    },
  }))
);

// =============================================================================
// RE-EXPORT CONVENIENCE HOOKS & SELECTORS (backward compatibility)
// =============================================================================

export {
  useDealsArray,
  useContactsArray,
  useTasksArray,
  useActivitiesArray,
  useAccountsArray,
  useEntities,
  useEntity,
  useEntityCount,
  useTotalCounts,
  useConflicts,
  useSyncStatus,
  getCRMStoreState,
} from './selectors/crmSelectors';
