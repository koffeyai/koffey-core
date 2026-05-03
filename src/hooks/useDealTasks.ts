/**
 * useDealTasks - Task management for Deal Dialog
 * 
 * Normalized to CRM pattern for automatic realtime sync.
 * Query key: ['crm', 'tasks', organizationId, { deal_id }]
 * 
 * When tasks are created/updated/deleted:
 * 1. Mutation updates Supabase
 * 2. Supabase Realtime fires event
 * 3. useRealtimeCacheBridge catches event
 * 4. Invalidates ['crm', 'tasks', organizationId]
 * 5. This hook refetches automatically
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import { syncInfo, syncDebug, syncError } from '@/lib/syncLogger';

// ============================================================================
// TYPES
// ============================================================================

export interface DealTask {
  id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'completed';
  completed: boolean;
  deal_id: string;
  contact_id?: string | null;
  account_id?: string | null;
  user_id: string;
  organization_id: string;
  source_document_id?: string | null;
  created_at: string;
  updated_at: string;
  // Calendar sync fields
  google_event_id?: string | null;
  calendar_synced_at?: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'in_progress' | 'completed';
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'in_progress' | 'completed';
  completed?: boolean;
}

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

const taskKeys = {
  all: (orgId: string) => ['crm', 'tasks', orgId] as const,
  forDeal: (orgId: string, dealId: string) => 
    ['crm', 'tasks', orgId, { deal_id: dealId }] as const,
};

// ============================================================================
// HOOK
// ============================================================================

export function useDealTasks(dealId: string | null) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const queryClient = useQueryClient();
  
  const organizationId = currentOrganization?.organization_id;
  const userId = user?.id;

  // ==========================================================================
  // QUERY: Fetch tasks for this deal
  // ==========================================================================
  
  const {
    data: tasks = [],
    isLoading: loading,
    error,
    refetch
  } = useQuery({
    queryKey: dealId && organizationId 
      ? taskKeys.forDeal(organizationId, dealId) 
      : ['crm', 'tasks', 'disabled'],
    queryFn: async () => {
      if (!dealId || !organizationId) return [];
      
      syncDebug('query-refetch', 'Fetching deal tasks', { dealId, organizationId });
      
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('deal_id', dealId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        syncError('query-refetch', 'Failed to fetch deal tasks', { error: error.message });
        throw error;
      }
      
      syncDebug('query-refetch', `Fetched ${data?.length || 0} tasks for deal`, { dealId });
      return (data || []) as DealTask[];
    },
    enabled: !!dealId && !!organizationId && !!userId,
    staleTime: 30000, // 30 seconds - realtime handles most updates
  });

  // ==========================================================================
  // HELPER: Invalidate task caches
  // ==========================================================================
  
  const invalidateTaskCaches = useCallback(() => {
    if (!organizationId) return;
    
    // Invalidate all task queries for this org
    // This ensures deal cards, task lists, and this dialog all refresh
    queryClient.invalidateQueries({
      queryKey: taskKeys.all(organizationId),
      refetchType: 'active'
    });
    
    syncDebug('cache-invalidation', 'Task caches invalidated', { organizationId });
  }, [queryClient, organizationId]);

  // ==========================================================================
  // MUTATION: Create task
  // ==========================================================================
  
  const createMutation = useMutation({
    mutationFn: async (taskData: CreateTaskInput) => {
      if (!userId || !dealId || !organizationId) {
        throw new Error('Missing required context for task creation');
      }

      syncInfo('mutation', 'Creating task', { dealId, title: taskData.title });

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: taskData.title,
          description: taskData.description || null,
          due_date: taskData.due_date || null,
          priority: taskData.priority || 'medium',
          status: taskData.status || 'open',
          completed: false,
          deal_id: dealId,
          user_id: userId,
          organization_id: organizationId,
        })
        .select()
        .single();

      if (error) {
        syncError('mutation', 'Failed to create task', { error: error.message });
        throw error;
      }

      syncInfo('mutation', 'Task created', { taskId: data.id });
      return data as DealTask;
    },
    onSuccess: (newTask) => {
      // Optimistic update: add to cache immediately
      if (organizationId && dealId) {
        queryClient.setQueryData<DealTask[]>(
          taskKeys.forDeal(organizationId, dealId),
          (old = []) => [newTask, ...old]
        );
      }
      
      // Also invalidate to ensure consistency
      // (Realtime will likely beat this, but belt + suspenders)
      invalidateTaskCaches();
      
      // Trigger calendar sync if task has a due date (fire-and-forget)
      if (newTask.due_date) {
        supabase.functions.invoke('google-calendar-sync', {
          body: {
            action: 'create',
            taskId: newTask.id,
            title: newTask.title,
            description: newTask.description,
            due_date: newTask.due_date,
          }
        }).then(({ data, error }) => {
          if (error) {
            console.warn('[useDealTasks] Calendar sync failed:', error);
          } else if (data?.success) {
            syncInfo('mutation', 'Task synced to calendar', { taskId: newTask.id, eventId: data.eventId });
          }
        }).catch(err => console.warn('[useDealTasks] Calendar sync error:', err));
      }
      
      toast.success('Next step added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add next step');
    }
  });

  // ==========================================================================
  // MUTATION: Update task
  // ==========================================================================
  
  const updateMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: UpdateTaskInput }) => {
      if (!organizationId) {
        throw new Error('Missing organization context');
      }

      syncInfo('mutation', 'Updating task', { taskId, updates: Object.keys(updates) });

      const { data, error } = await supabase
        .from('tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        syncError('mutation', 'Failed to update task', { error: error.message });
        throw error;
      }

      syncInfo('mutation', 'Task updated', { taskId });
      return data as DealTask;
    },
    onSuccess: (updatedTask) => {
      // Optimistic update
      if (organizationId && dealId) {
        queryClient.setQueryData<DealTask[]>(
          taskKeys.forDeal(organizationId, dealId),
          (old = []) => old.map(t => t.id === updatedTask.id ? updatedTask : t)
        );
      }
      
      invalidateTaskCaches();
      
      // Trigger calendar sync for updates if task has a due date
      if (updatedTask.due_date) {
        supabase.functions.invoke('google-calendar-sync', {
          body: {
            action: 'update',
            taskId: updatedTask.id,
            title: updatedTask.title,
            description: updatedTask.description,
            due_date: updatedTask.due_date,
          }
        }).catch(err => console.warn('[useDealTasks] Calendar update sync error:', err));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update task');
    }
  });

  // ==========================================================================
  // MUTATION: Delete task
  // ==========================================================================
  
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!organizationId) {
        throw new Error('Missing organization context');
      }

      syncInfo('mutation', 'Deleting task', { taskId });

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('organization_id', organizationId);

      if (error) {
        syncError('mutation', 'Failed to delete task', { error: error.message });
        throw error;
      }

      syncInfo('mutation', 'Task deleted', { taskId });
      return taskId;
    },
    onMutate: async (taskId: string) => {
      // Get the task before deleting to trigger calendar sync
      const taskToDelete = tasks.find(t => t.id === taskId);
      if (taskToDelete?.google_event_id) {
        // Fire calendar delete in background
        supabase.functions.invoke('google-calendar-sync', {
          body: { action: 'delete', taskId }
        }).catch(err => console.warn('[useDealTasks] Calendar delete sync error:', err));
      }
    },
    onSuccess: (deletedTaskId) => {
      // Optimistic update
      if (organizationId && dealId) {
        queryClient.setQueryData<DealTask[]>(
          taskKeys.forDeal(organizationId, dealId),
          (old = []) => old.filter(t => t.id !== deletedTaskId)
        );
      }
      
      invalidateTaskCaches();
      toast.success('Task deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete task');
    }
  });

  // ==========================================================================
  // PUBLIC API (preserves existing interface)
  // ==========================================================================
  
  const createTask = useCallback(
    async (taskData: CreateTaskInput): Promise<DealTask | null> => {
      try {
        return await createMutation.mutateAsync(taskData);
      } catch {
        return null;
      }
    },
    [createMutation]
  );

  const updateTask = useCallback(
    async (taskId: string, updates: UpdateTaskInput): Promise<DealTask | null> => {
      try {
        return await updateMutation.mutateAsync({ taskId, updates });
      } catch {
        return null;
      }
    },
    [updateMutation]
  );

  const deleteTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      try {
        await deleteMutation.mutateAsync(taskId);
        return true;
      } catch {
        return false;
      }
    },
    [deleteMutation]
  );

  const toggleComplete = useCallback(
    async (taskId: string): Promise<DealTask | null> => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return null;
      
      return updateTask(taskId, {
        completed: !task.completed,
        status: !task.completed ? 'completed' : 'open'
      });
    },
    [tasks, updateTask]
  );

  // ==========================================================================
  // RETURN
  // ==========================================================================
  
  return {
    // Data
    tasks,
    loading,
    error,
    
    // Mutations
    createTask,
    updateTask,
    deleteTask,
    toggleComplete,
    
    // Utilities
    refresh: refetch,
    
    // Mutation states (for loading indicators)
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
