// =============================================================================
// CRM TYPE DEFINITIONS
// Extracted from src/stores/unifiedCRMStore.ts
// =============================================================================

export type CRMEntityType = 'contacts' | 'accounts' | 'deals' | 'activities' | 'tasks';

export interface BaseEntity {
  id: string;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export interface Contact extends BaseEntity {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  status?: string;
  account_id?: string;
  assigned_to?: string;
}

export interface Account extends BaseEntity {
  name: string;
  industry?: string;
  website?: string;
  description?: string;
  phone?: string;
  address?: string;
  assigned_to?: string;
}

export interface Deal extends BaseEntity {
  name: string;
  amount?: number;
  stage: string;
  probability?: number;
  expected_close_date?: string;
  close_date?: string;
  account_id?: string;
  contact_id?: string;
  assigned_to?: string;
  currency?: string;
  description?: string;
}

export interface Activity extends BaseEntity {
  title: string;
  type: string;
  activity_date?: string;
  description?: string;
  completed?: boolean;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
  assigned_to?: string;
}

export interface Task extends BaseEntity {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  due_date?: string;
  completed?: boolean;
  contact_id?: string;
  account_id?: string;
  assigned_to?: string;
}

// Entity type mapping
export type EntityTypeMap = {
  contacts: Contact;
  accounts: Account;
  deals: Deal;
  activities: Activity;
  tasks: Task;
};

// Pending local changes for conflict detection
export interface PendingChange {
  entityType: CRMEntityType;
  entityId: string;
  changes: Record<string, any>;
  timestamp: number;
  originalVersion?: number;
}

// Conflict info when detected
export interface ConflictInfo {
  entityType: CRMEntityType;
  entityId: string;
  localChanges: Record<string, any>;
  serverChanges: Record<string, any>;
  conflictingFields: string[];
  serverVersion: number;
  localVersion: number;
}

// Server-computed aggregates (from RPCs)
export interface ServerAggregates {
  pipelineHealth: {
    totalValue: number;
    dealsByStage: Record<string, { count: number; value: number }>;
    avgDealSize: number;
    winRate: number;
    velocityDays: number;
  } | null;
  dataQuality: {
    overallScore: number;
    grade: string;
    fieldCompleteness: Record<string, number>;
  } | null;
  lastFetchedAt: Record<string, number>;
}

// =============================================================================
// STORE STATE & ACTIONS INTERFACES
// =============================================================================

export interface UnifiedCRMState {
  // Normalized entity caches (Map for O(1) lookups)
  entities: {
    contacts: Map<string, Contact>;
    accounts: Map<string, Account>;
    deals: Map<string, Deal>;
    activities: Map<string, Activity>;
    tasks: Map<string, Task>;
  };

  // Memoized array caches - only rebuilt when source Maps change
  arrayCache: {
    contacts: Contact[];
    accounts: Account[];
    deals: Deal[];
    activities: Activity[];
    tasks: Task[];
  };

  // Track loaded pages per entity type (for pagination awareness)
  loadedPages: Record<CRMEntityType, Set<number>>;

  // Track total counts from server (if known)
  totalCounts: Record<CRMEntityType, number | null>;

  // Server-computed aggregates
  serverAggregates: ServerAggregates;

  // Pending local changes (for conflict detection)
  pendingChanges: Map<string, PendingChange>;

  // Active conflicts
  conflicts: ConflictInfo[];

  // Sync metadata
  lastSyncedAt: Record<CRMEntityType, number>;
  syncStatus: 'idle' | 'syncing' | 'error';

  // Current organization context
  currentOrganizationId: string | null;
}

export interface UnifiedCRMActions {
  // Entity operations
  upsertEntity: <T extends CRMEntityType>(type: T, entity: EntityTypeMap[T]) => void;
  upsertEntities: <T extends CRMEntityType>(type: T, entities: EntityTypeMap[T][]) => void;
  removeEntity: (type: CRMEntityType, entityId: string) => void;
  getEntity: <T extends CRMEntityType>(type: T, entityId: string) => EntityTypeMap[T] | undefined;
  getEntities: <T extends CRMEntityType>(type: T) => EntityTypeMap[T][];

  // Array cache management
  rebuildArrayCache: (type: CRMEntityType) => void;

  // Page tracking
  markPageLoaded: (type: CRMEntityType, page: number) => void;
  isPageLoaded: (type: CRMEntityType, page: number) => boolean;
  clearLoadedPages: (type: CRMEntityType) => void;

  // Total counts (server-provided for accurate dashboard metrics)
  setTotalCount: (type: CRMEntityType, count: number) => void;
  incrementTotalCount: (type: CRMEntityType) => void;
  decrementTotalCount: (type: CRMEntityType) => void;

  // Server aggregates
  setServerAggregates: (key: keyof Omit<ServerAggregates, 'lastFetchedAt'>, data: any) => void;

  // Pending changes (for conflict detection)
  addPendingChange: (change: Omit<PendingChange, 'timestamp'>) => void;
  removePendingChange: (entityType: CRMEntityType, entityId: string) => void;
  getPendingChange: (entityType: CRMEntityType, entityId: string) => PendingChange | undefined;
  hasPendingChanges: (entityType: CRMEntityType, entityId: string) => boolean;

  // Conflict management
  addConflict: (conflict: ConflictInfo) => void;
  resolveConflict: (entityType: CRMEntityType, entityId: string) => void;

  // Sync operations
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  updateLastSynced: (type: CRMEntityType) => void;

  // Organization context
  setOrganizationId: (orgId: string | null) => void;

  // Bulk operations
  clearEntityCache: (type: CRMEntityType) => void;
  clearAllCaches: () => void;

  // Get counts (prefers server total, falls back to loaded count)
  getEntityCount: (type: CRMEntityType) => number;
}
