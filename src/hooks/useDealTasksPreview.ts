/**
 * useDealTasksPreview - Task previews for Deal Cards in Pipeline View
 * 
 * Normalized to CRM pattern for automatic realtime sync.
 * Query key: ['crm', 'tasks', organizationId, { deal_ids: [...] }]
 * 
 * This hook fetches tasks for multiple deals at once (batch query)
 * to avoid N+1 queries when rendering the pipeline board.
 * 
 * Realtime sync happens automatically via useRealtimeCacheBridge.
 */

import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { syncDebug, syncError } from '@/lib/syncLogger';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskPreview {
  id: string;
  title: string;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'completed';
  completed: boolean;
  deal_id: string;
}

// Backward compatibility alias
export type DealTaskPreview = TaskPreview;

export interface DealTasksData {
  tasks: TaskPreview[];
  totalCount: number;
}

interface TasksByDeal {
  [dealId: string]: DealTasksData;
}

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

const taskPreviewKeys = {
  // Base key that realtime bridge invalidates
  base: (orgId: string) => ['crm', 'tasks', orgId] as const,
  
  // Specific key for batch preview queries
  forDeals: (orgId: string, dealIds: string[]) => 
    ['crm', 'tasks', orgId, { deal_ids: dealIds.sort().join(',') }] as const,
};

// ============================================================================
// HOOK
// ============================================================================

export function useDealTasksPreview(dealIds: string[]) {
  const { currentOrganization } = useOrganizationAccess();
  
  const organizationId = currentOrganization?.organization_id;
  
  // Stable key for the deal IDs array
  const dealIdsKey = useMemo(
    () => dealIds.sort().join(','),
    [dealIds]
  );

  // ==========================================================================
  // QUERY: Fetch task previews for all deals in view
  // ==========================================================================
  
  const {
    data: tasksByDeal = {},
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: organizationId && dealIds.length > 0
      ? taskPreviewKeys.forDeals(organizationId, dealIds)
      : ['crm', 'tasks', 'disabled'],
    queryFn: async (): Promise<TasksByDeal> => {
      if (!organizationId || dealIds.length === 0) return {};
      
      syncDebug('query-refetch', 'Fetching task previews', { 
        organizationId, 
        dealCount: dealIds.length 
      });

      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, completed, deal_id')
        .eq('organization_id', organizationId)
        .in('deal_id', dealIds)
        .eq('completed', false) // Only show incomplete tasks on cards
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false }) // high > medium > low
        .limit(100); // Safety limit

      if (error) {
        syncError('query-refetch', 'Failed to fetch task previews', { 
          error: error.message 
        });
        throw error;
      }

      // Group tasks by deal_id for efficient lookup
      const grouped: TasksByDeal = {};
      
      for (const task of (data || [])) {
        if (!grouped[task.deal_id]) {
          grouped[task.deal_id] = { tasks: [], totalCount: 0 };
        }
        grouped[task.deal_id].tasks.push(task as TaskPreview);
        grouped[task.deal_id].totalCount++;
      }

      syncDebug('query-refetch', `Fetched tasks for ${Object.keys(grouped).length} deals`, {
        totalTasks: data?.length || 0
      });

      return grouped;
    },
    enabled: !!organizationId && dealIds.length > 0,
    staleTime: 30000, // 30 seconds - realtime handles updates
    
    // Keep previous data while refetching to prevent UI flicker
    placeholderData: (previousData) => previousData,
  });

  // ==========================================================================
  // HELPER: Get tasks for a specific deal
  // ==========================================================================
  
  const getTasksForDeal = useCallback(
    (dealId: string): TaskPreview[] => {
      return tasksByDeal[dealId]?.tasks || [];
    },
    [tasksByDeal]
  );

  // ==========================================================================
  // HELPER: Get next task (soonest due date) for a deal
  // ==========================================================================
  
  const getNextTaskForDeal = useCallback(
    (dealId: string): TaskPreview | null => {
      const dealData = tasksByDeal[dealId];
      if (!dealData || dealData.tasks.length === 0) return null;
      
      // Already sorted by due_date in query, return first
      return dealData.tasks[0];
    },
    [tasksByDeal]
  );

  // ==========================================================================
  // HELPER: Get task count for a deal
  // ==========================================================================
  
  const getTaskCountForDeal = useCallback(
    (dealId: string): number => {
      return tasksByDeal[dealId]?.totalCount || 0;
    },
    [tasksByDeal]
  );

  // ==========================================================================
  // HELPER: Check if deal has overdue tasks
  // ==========================================================================
  
  const hasOverdueTasks = useCallback(
    (dealId: string): boolean => {
      const dealData = tasksByDeal[dealId];
      if (!dealData) return false;
      
      const now = new Date().toISOString().split('T')[0];
      return dealData.tasks.some(task => task.due_date && task.due_date < now);
    },
    [tasksByDeal]
  );

  // ==========================================================================
  // RETURN
  // ==========================================================================
  
  return {
    // Data
    tasksByDeal,
    isLoading,
    error,
    
    // Accessors
    getTasksForDeal,
    getNextTaskForDeal,
    getTaskCountForDeal,
    hasOverdueTasks,
    
    // Utilities
    refetch,
  };
}

// ============================================================================
// CONVENIENCE HOOK: Single deal task preview
// ============================================================================

/**
 * Convenience wrapper for when you only need tasks for a single deal.
 * Uses the batch hook internally for consistency.
 */
export function useSingleDealTaskPreview(dealId: string | null) {
  const dealIds = useMemo(
    () => dealId ? [dealId] : [],
    [dealId]
  );
  
  const { getTasksForDeal, getNextTaskForDeal, isLoading, error } = useDealTasksPreview(dealIds);
  
  return {
    tasks: dealId ? getTasksForDeal(dealId) : [],
    nextTask: dealId ? getNextTaskForDeal(dealId) : null,
    isLoading,
    error,
  };
}
