import { useMemo } from 'react';
import { useUnifiedCRMStore } from '../unifiedCRMStore';
import type { Deal, Contact, Account, Activity, Task, CRMEntityType, EntityTypeMap } from '@/types/crm';

// =============================================================================
// DEAL SELECTORS
// =============================================================================

export interface PipelineMetrics {
  totalValue: number;
  totalDeals: number;
  avgDealSize: number;
  dealsByStage: Record<string, { count: number; value: number }>;
  winRate: number;
  lossRate: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  weightedPipelineValue: number;
}

const STAGE_ORDER = [
  'prospecting',
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost'
];

const CLOSED_WON_STAGES = ['closed_won', 'won', 'closed-won'];
const CLOSED_LOST_STAGES = ['closed_lost', 'lost', 'closed-lost'];

export const usePipelineMetrics = (): PipelineMetrics => {
  const deals = useUnifiedCRMStore((state) => Array.from(state.entities.deals.values()));
  
  return useMemo(() => {
    if (!deals.length) {
      return {
        totalValue: 0,
        totalDeals: 0,
        avgDealSize: 0,
        dealsByStage: {},
        winRate: 0,
        lossRate: 0,
        openDeals: 0,
        wonDeals: 0,
        lostDeals: 0,
        weightedPipelineValue: 0,
      };
    }
    
    const dealsByStage: Record<string, { count: number; value: number }> = {};
    let totalValue = 0;
    let wonDeals = 0;
    let lostDeals = 0;
    let weightedValue = 0;
    
    deals.forEach((deal) => {
      const stage = deal.stage?.toLowerCase() || 'unknown';
      const amount = deal.amount || 0;
      const probability = (deal.probability || 0) / 100;
      
      totalValue += amount;
      weightedValue += amount * probability;
      
      if (!dealsByStage[stage]) {
        dealsByStage[stage] = { count: 0, value: 0 };
      }
      dealsByStage[stage].count++;
      dealsByStage[stage].value += amount;
      
      if (CLOSED_WON_STAGES.includes(stage)) {
        wonDeals++;
      } else if (CLOSED_LOST_STAGES.includes(stage)) {
        lostDeals++;
      }
    });
    
    const closedDeals = wonDeals + lostDeals;
    const openDeals = deals.length - closedDeals;
    const winRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;
    const lossRate = closedDeals > 0 ? (lostDeals / closedDeals) * 100 : 0;
    
    return {
      totalValue,
      totalDeals: deals.length,
      avgDealSize: deals.length > 0 ? totalValue / deals.length : 0,
      dealsByStage,
      winRate,
      lossRate,
      openDeals,
      wonDeals,
      lostDeals,
      weightedPipelineValue: weightedValue,
    };
  }, [deals]);
};

// Get deals by stage for funnel visualization
export const useDealsByStage = (): { stage: string; deals: Deal[]; value: number }[] => {
  const deals = useUnifiedCRMStore((state) => Array.from(state.entities.deals.values()));
  
  return useMemo(() => {
    const byStage: Record<string, Deal[]> = {};
    
    deals.forEach((deal) => {
      const stage = deal.stage || 'unknown';
      if (!byStage[stage]) {
        byStage[stage] = [];
      }
      byStage[stage].push(deal);
    });
    
    // Sort by stage order
    return STAGE_ORDER.map((stage) => ({
      stage,
      deals: byStage[stage] || [],
      value: (byStage[stage] || []).reduce((sum, d) => sum + (d.amount || 0), 0),
    })).filter((s) => s.deals.length > 0);
  }, [deals]);
};

// =============================================================================
// CONTACT SELECTORS
// =============================================================================

export interface ContactMetrics {
  totalContacts: number;
  byStatus: Record<string, number>;
  withEmail: number;
  withPhone: number;
  completenessScore: number;
}

export const useContactMetrics = (): ContactMetrics => {
  const contacts = useUnifiedCRMStore((state) => Array.from(state.entities.contacts.values()));
  
  return useMemo(() => {
    if (!contacts.length) {
      return {
        totalContacts: 0,
        byStatus: {},
        withEmail: 0,
        withPhone: 0,
        completenessScore: 0,
      };
    }
    
    const byStatus: Record<string, number> = {};
    let withEmail = 0;
    let withPhone = 0;
    let totalFields = 0;
    let filledFields = 0;
    
    const keyFields = ['email', 'phone', 'company', 'title', 'first_name', 'last_name'];
    
    contacts.forEach((contact) => {
      const status = contact.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      
      if (contact.email) withEmail++;
      if (contact.phone) withPhone++;
      
      // Calculate completeness
      keyFields.forEach((field) => {
        totalFields++;
        if ((contact as any)[field]) filledFields++;
      });
    });
    
    return {
      totalContacts: contacts.length,
      byStatus,
      withEmail,
      withPhone,
      completenessScore: totalFields > 0 ? (filledFields / totalFields) * 100 : 0,
    };
  }, [contacts]);
};

// =============================================================================
// ACCOUNT SELECTORS
// =============================================================================

export interface AccountMetrics {
  totalAccounts: number;
  byIndustry: Record<string, number>;
  withWebsite: number;
  withDeals: number;
}

export const useAccountMetrics = (): AccountMetrics => {
  const accounts = useUnifiedCRMStore((state) => Array.from(state.entities.accounts.values()));
  const deals = useUnifiedCRMStore((state) => Array.from(state.entities.deals.values()));
  
  return useMemo(() => {
    if (!accounts.length) {
      return {
        totalAccounts: 0,
        byIndustry: {},
        withWebsite: 0,
        withDeals: 0,
      };
    }
    
    const byIndustry: Record<string, number> = {};
    let withWebsite = 0;
    
    // Track which accounts have deals
    const accountsWithDeals = new Set(
      deals.filter((d) => d.account_id).map((d) => d.account_id)
    );
    
    accounts.forEach((account) => {
      const industry = account.industry || 'Unknown';
      byIndustry[industry] = (byIndustry[industry] || 0) + 1;
      
      if (account.website) withWebsite++;
    });
    
    return {
      totalAccounts: accounts.length,
      byIndustry,
      withWebsite,
      withDeals: accountsWithDeals.size,
    };
  }, [accounts, deals]);
};

// =============================================================================
// ACTIVITY SELECTORS
// =============================================================================

export interface ActivityMetrics {
  totalActivities: number;
  byType: Record<string, number>;
  completed: number;
  pending: number;
  recentActivities: Activity[];
}

export const useActivityMetrics = (): ActivityMetrics => {
  const activities = useUnifiedCRMStore((state) => Array.from(state.entities.activities.values()));
  
  return useMemo(() => {
    if (!activities.length) {
      return {
        totalActivities: 0,
        byType: {},
        completed: 0,
        pending: 0,
        recentActivities: [],
      };
    }
    
    const byType: Record<string, number> = {};
    let completed = 0;
    let pending = 0;
    
    activities.forEach((activity) => {
      const type = activity.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      
      if (activity.completed) {
        completed++;
      } else {
        pending++;
      }
    });
    
    // Sort by date descending and take recent
    const recentActivities = [...activities]
      .sort((a, b) => {
        const dateA = new Date(a.activity_date || a.created_at || 0).getTime();
        const dateB = new Date(b.activity_date || b.created_at || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 10);
    
    return {
      totalActivities: activities.length,
      byType,
      completed,
      pending,
      recentActivities,
    };
  }, [activities]);
};

// =============================================================================
// TASK SELECTORS
// =============================================================================

export interface TaskMetrics {
  totalTasks: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
  dueToday: number;
  dueSoon: number;
}

export const useTaskMetrics = (): TaskMetrics => {
  const tasks = useUnifiedCRMStore((state) => Array.from(state.entities.tasks.values()));
  
  return useMemo(() => {
    if (!tasks.length) {
      return {
        totalTasks: 0,
        byStatus: {},
        byPriority: {},
        overdue: 0,
        dueToday: 0,
        dueSoon: 0,
      };
    }
    
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let overdue = 0;
    let dueToday = 0;
    let dueSoon = 0;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 7);
    
    tasks.forEach((task) => {
      const status = task.status || 'unknown';
      const priority = task.priority || 'normal';
      
      byStatus[status] = (byStatus[status] || 0) + 1;
      byPriority[priority] = (byPriority[priority] || 0) + 1;
      
      if (task.due_date && !task.completed) {
        const dueDate = new Date(task.due_date);
        if (dueDate < today) {
          overdue++;
        } else if (dueDate.toDateString() === today.toDateString()) {
          dueToday++;
        } else if (dueDate <= soonDate) {
          dueSoon++;
        }
      }
    });
    
    return {
      totalTasks: tasks.length,
      byStatus,
      byPriority,
      overdue,
      dueToday,
      dueSoon,
    };
  }, [tasks]);
};

// =============================================================================
// COMBINED DASHBOARD METRICS
// =============================================================================

export interface DashboardMetrics {
  totalContacts: number;
  totalAccounts: number;
  totalDeals: number;
  totalActivities: number;
  totalTasks: number;
  pipelineValue: number;
  avgDealSize: number;
  winRate: number;
  overdueTasks: number;
  pendingActivities: number;
}

export const useDashboardMetrics = (): DashboardMetrics => {
  // Use server totals for accurate counts (falls back to loaded count if not available)
  const totalCounts = useUnifiedCRMStore((state) => state.totalCounts);
  const loadedCounts = useUnifiedCRMStore((state) => ({
    contacts: state.entities.contacts.size,
    accounts: state.entities.accounts.size,
    deals: state.entities.deals.size,
    activities: state.entities.activities.size,
    tasks: state.entities.tasks.size,
  }));
  
  const deals = useUnifiedCRMStore((state) => Array.from(state.entities.deals.values()));
  const activities = useUnifiedCRMStore((state) => Array.from(state.entities.activities.values()));
  const tasks = useUnifiedCRMStore((state) => Array.from(state.entities.tasks.values()));
  
  return useMemo(() => {
    // Pipeline calculations from loaded deals
    let pipelineValue = 0;
    let wonDeals = 0;
    let closedDeals = 0;
    
    deals.forEach((deal) => {
      const amount = deal.amount || 0;
      const stage = deal.stage?.toLowerCase() || '';
      
      pipelineValue += amount;
      
      if (CLOSED_WON_STAGES.includes(stage)) {
        wonDeals++;
        closedDeals++;
      } else if (CLOSED_LOST_STAGES.includes(stage)) {
        closedDeals++;
      }
    });
    
    // Activity calculations
    const pendingActivities = activities.filter((a) => !a.completed).length;
    
    // Task calculations
    const now = new Date();
    const overdueTasks = tasks.filter((t) => {
      if (t.completed || !t.due_date) return false;
      return new Date(t.due_date) < now;
    }).length;
    
    // Use server totals when available, otherwise fall back to loaded counts
    return {
      totalContacts: totalCounts.contacts ?? loadedCounts.contacts,
      totalAccounts: totalCounts.accounts ?? loadedCounts.accounts,
      totalDeals: totalCounts.deals ?? loadedCounts.deals,
      totalActivities: totalCounts.activities ?? loadedCounts.activities,
      totalTasks: totalCounts.tasks ?? loadedCounts.tasks,
      pipelineValue,
      avgDealSize: deals.length > 0 ? pipelineValue / deals.length : 0,
      winRate: closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0,
      overdueTasks,
      pendingActivities,
    };
  }, [totalCounts, loadedCounts, deals, activities, tasks]);
};

// Get all server total counts (for dashboard accuracy)
export const useTotalCounts = () => {
  return useUnifiedCRMStore((state) => state.totalCounts);
};

// =============================================================================
// FILTER SELECTORS
// =============================================================================

// Get deals filtered by assigned user
export const useUserDeals = (userId?: string): Deal[] => {
  const deals = useUnifiedCRMStore((state) => Array.from(state.entities.deals.values()));
  
  return useMemo(() => {
    if (!userId) return deals;
    return deals.filter((d) => d.assigned_to === userId);
  }, [deals, userId]);
};

// Get contacts for a specific account
export const useAccountContacts = (accountId?: string): Contact[] => {
  const contacts = useUnifiedCRMStore((state) => Array.from(state.entities.contacts.values()));
  
  return useMemo(() => {
    if (!accountId) return [];
    return contacts.filter((c) => c.account_id === accountId);
  }, [contacts, accountId]);
};

// Get deals for a specific account
export const useAccountDeals = (accountId?: string): Deal[] => {
  const deals = useUnifiedCRMStore((state) => Array.from(state.entities.deals.values()));
  
  return useMemo(() => {
    if (!accountId) return [];
    return deals.filter((d) => d.account_id === accountId);
  }, [deals, accountId]);
};

// Get activities for a specific entity
export const useEntityActivities = (
  entityType: 'contact' | 'account' | 'deal',
  entityId?: string
): Activity[] => {
  const activities = useUnifiedCRMStore((state) => Array.from(state.entities.activities.values()));
  
  return useMemo(() => {
    if (!entityId) return [];
    
    return activities.filter((a) => {
      switch (entityType) {
        case 'contact':
          return a.contact_id === entityId;
        case 'account':
          return a.account_id === entityId;
        case 'deal':
          return a.deal_id === entityId;
        default:
          return false;
      }
    });
  }, [activities, entityType, entityId]);
};

// =============================================================================
// CONVENIENCE HOOKS (extracted from unifiedCRMStore.ts)
// =============================================================================

// Stable array selectors - return cached arrays that only change when entities change
// These are the preferred way to consume entity arrays (no render loops)

export const useDealsArray = (): Deal[] => {
  return useUnifiedCRMStore((s) => s.arrayCache.deals);
};

export const useContactsArray = (): Contact[] => {
  return useUnifiedCRMStore((s) => s.arrayCache.contacts);
};

export const useTasksArray = (): Task[] => {
  return useUnifiedCRMStore((s) => s.arrayCache.tasks);
};

export const useActivitiesArray = (): Activity[] => {
  return useUnifiedCRMStore((s) => s.arrayCache.activities);
};

export const useAccountsArray = (): Account[] => {
  return useUnifiedCRMStore((s) => s.arrayCache.accounts);
};

// Get all entities of a type as array (generic version using cached arrays)
export const useEntities = <T extends CRMEntityType>(type: T): EntityTypeMap[T][] => {
  return useUnifiedCRMStore((state) => state.arrayCache[type] as EntityTypeMap[T][]);
};

// Get a single entity by ID
export const useEntity = <T extends CRMEntityType>(type: T, id: string): EntityTypeMap[T] | undefined => {
  return useUnifiedCRMStore((state) => {
    const entityMap = state.entities[type] as Map<string, EntityTypeMap[T]>;
    return entityMap.get(id);
  });
};

// Get entity count (prefers server total for accuracy)
export const useEntityCount = (type: CRMEntityType): number => {
  return useUnifiedCRMStore((state) => {
    const serverTotal = state.totalCounts[type];
    if (serverTotal !== null) {
      return serverTotal;
    }
    return state.entities[type].size;
  });
};

// Get active conflicts
export const useConflicts = () => {
  return useUnifiedCRMStore((state) => state.conflicts);
};

// Get sync status
export const useSyncStatus = () => {
  return useUnifiedCRMStore((state) => state.syncStatus);
};

// =============================================================================
// NON-REACTIVE ACCESS (for services/callbacks)
// =============================================================================

export const getCRMStoreState = () => useUnifiedCRMStore.getState();
