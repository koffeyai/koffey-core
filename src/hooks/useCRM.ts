import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeSingle } from '@/lib/database';
import { toast } from '@/hooks/use-toast';
import { logError, logInfo } from '@/lib/logger';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useCacheInvalidation } from '@/hooks/useCacheInvalidation';
import { useEnhancedRetry } from '@/hooks/useEnhancedRetry';
import { behaviorTracker } from '@/lib/behaviorTracker';
import { circuitBreakers, withCircuitBreaker } from '@/lib/circuitBreaker';
import { unifiedCacheManager } from '@/lib/cache';
import { AuditService } from '@/services/AuditService';
import { crmEventBus } from '@/lib/crmEventBus';
import { useUnifiedCRMStore } from '@/stores/unifiedCRMStore';
import { useMicroWins } from '@/hooks/useMicroWins';

// ============= TYPES =============
export type CRMEntity = 'contacts' | 'deals' | 'accounts' | 'tasks' | 'activities';

export interface CRMFilters {
  search?: string;
  status?: string;
  status_in?: string[]; // Array of statuses for leads/contacts separation
  status_not_in?: string[]; // Exclude specific statuses
  assignedTo?: string;
  createdAfter?: string;
  createdBefore?: string;
  tags?: string[];
  [key: string]: any;
}

export interface FieldConfig {
  field: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'date' | 'number' | 'currency' | 'badge' | 'status';
  width?: string;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string; color?: string }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: (value: any) => string | null;
  };
}

export interface EntityConfig<T = any> {
  table: string;
  displayName: string;
  displayNamePlural: string;
  primaryKey: string;
  
  // Field configurations
  listFields: FieldConfig[];
  formFields: FieldConfig[];
  requiredFields: string[];
  
  // Options for status/select fields
  statusOptions?: { value: string; label: string; color: string }[];
  
  // Permissions
  permissions: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    bulk: boolean;
  };
  
  // Query configuration
  queryConfig: {
    pageSize: number;
    searchFields: string[];
    defaultSort: string;
    relations?: string[];
  };
  
  // Validation rules
  validation: {
    [field: string]: {
      required?: boolean;
      min?: number;
      max?: number;
      pattern?: RegExp;
      custom?: (value: any, entity?: T) => string | null;
    };
  };
}

interface QueryPage {
  entities: any[];
  nextPage: number | null;
  totalCount: number;
}

interface CRMStats {
  totalContacts: number;
  totalDeals: number;
  totalActivities: number;
  totalTasks: number;
  recentActivity: any[];
}

// ============= ENTITY VALIDATOR =============
export class EntityValidator<T = any> {
  constructor(private config: EntityConfig<T>) {}

  validate(data: Partial<T>): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    // Check required fields
    this.config.requiredFields.forEach(field => {
      const value = (data as any)[field];
      if (!value && value !== 0) {
        errors[field] = `${this.getFieldLabel(field)} is required`;
      }
    });

    // Apply field-specific validation
    Object.entries(this.config.validation).forEach(([field, rules]) => {
      const value = (data as any)[field];
      
      if (!value && value !== 0) {
        if (rules.required) {
          errors[field] = `${this.getFieldLabel(field)} is required`;
        }
        return;
      }

      // Min/max validation
      if (typeof value === 'string') {
        if (rules.min && value.length < rules.min) {
          errors[field] = `${this.getFieldLabel(field)} must be at least ${rules.min} characters`;
        }
        if (rules.max && value.length > rules.max) {
          errors[field] = `${this.getFieldLabel(field)} must be no more than ${rules.max} characters`;
        }
      }

      if (typeof value === 'number') {
        if (rules.min && value < rules.min) {
          errors[field] = `${this.getFieldLabel(field)} must be at least ${rules.min}`;
        }
        if (rules.max && value > rules.max) {
          errors[field] = `${this.getFieldLabel(field)} must be no more than ${rules.max}`;
        }
      }

      // Pattern validation
      if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
        errors[field] = `${this.getFieldLabel(field)} format is invalid`;
      }

      // Custom validation
      if (rules.custom) {
        const customError = rules.custom(value, data as T);
        if (customError) {
          errors[field] = customError;
        }
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  private getFieldLabel(field: string): string {
    const fieldConfig = [...this.config.listFields, ...this.config.formFields]
      .find(f => f.field === field);
    return fieldConfig?.label || field;
  }
}

// ============= SELECTION MANAGER =============
class SelectionManager<T extends { id: string }> {
  private selectedIds = new Set<string>();
  private entities: T[] = [];

  setEntities(entities: T[]) {
    this.entities = entities;
    this.selectedIds.forEach(id => {
      if (!entities.find(e => e.id === id)) {
        this.selectedIds.delete(id);
      }
    });
  }

  toggle(id: string) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  selectAll() {
    this.entities.forEach(entity => {
      this.selectedIds.add(entity.id);
    });
  }

  clearSelection() {
    this.selectedIds.clear();
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  getSelected(): T[] {
    return this.entities.filter(entity => this.selectedIds.has(entity.id));
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }
}

// ============= ENTITY CONFIG =============
import { getLegacyEntityConfig as getEntityConfig } from '@/hooks/crmEntityConfigs';

// ============= MAIN HOOK =============
export function useCRM<T extends { id: string }>(
  entityType: CRMEntity,
  filters: CRMFilters = {}
) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const queryClient = useQueryClient();
  const { invalidateAfterCreate, invalidateAfterUpdate, invalidateAfterDelete, invalidateAfterBulkOperation } = useCacheInvalidation();
  const { retryWithUserFeedback } = useEnhancedRetry();
  
  const config = useMemo(() => getEntityConfig(entityType), [entityType]);
  const selection = useMemo(() => new SelectionManager<T>(), []);
  const organizationId = currentOrganization?.organization_id;
  const auditService = useRef(AuditService.getInstance()).current;
  const { trackWinAction } = useMicroWins();

  // Track user behavior
  const trackOperation = useCallback((operation: string) => {
    if (user) {
      behaviorTracker.trackAction(user.id, operation, {
        module: entityType,
        action: operation
      });
    }
  }, [user, entityType]);

  // Audit logging helper
  const logAudit = useCallback(async (
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    oldValues?: any,
    newValues?: any
  ) => {
    if (!organizationId || !user?.id) return;
    try {
      await auditService.logEntityAction(
        entityType,
        recordId,
        operation,
        organizationId,
        user.id,
        oldValues,
        newValues
      );
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }, [organizationId, user?.id, entityType, auditService]);

  // ============= INFINITE QUERY =============
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error
  } = useInfiniteQuery<QueryPage>({
    queryKey: ['crm', entityType, organizationId, filters],
    queryFn: async ({ pageParam = 0 }) => {
      if (!organizationId) {
        throw new Error('No organization selected');
      }

      const currentPage = pageParam as number;
      // For deals and contacts, join the accounts table so account name is available
      const selectClause = (entityType === 'deals' || entityType === 'contacts')
        ? '*, accounts(id, name, domain)'
        : '*';
      let query = supabase
        .from(config.table as any)
        .select(selectClause, { count: 'exact' })
        .eq('organization_id', organizationId)
        .range(
          currentPage * config.queryConfig.pageSize,
          (currentPage + 1) * config.queryConfig.pageSize - 1
        )
        .order(config.queryConfig.defaultSort, { ascending: false });

      // Apply search filter
      if (filters.search && config.queryConfig.searchFields.length > 0) {
        const searchConditions = config.queryConfig.searchFields
          .map(field => `${field}.ilike.%${filters.search}%`)
          .join(',');
        query = query.or(searchConditions);
      }

      // Apply other filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      // Array of statuses filter (for leads/contacts separation)
      if (filters.status_in && filters.status_in.length > 0) {
        query = query.in('status', filters.status_in);
      }
      // Exclude specific statuses (using .or() with not.in + is.null to properly
      // include NULL status rows — PostgreSQL's != excludes NULLs due to three-valued logic)
      if (filters.status_not_in && filters.status_not_in.length > 0) {
        const statusList = filters.status_not_in.map(s => `"${s}"`).join(',');
        query = query.or(`status.not.in.(${statusList}),status.is.null`);
      }
      if (filters.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }
      if (filters.createdAfter) {
        query = query.gte('created_at', filters.createdAfter);
      }
      if (filters.createdBefore) {
        query = query.lte('created_at', filters.createdBefore);
      }

      const { data, error, count } = await query;

      if (error) {
        logError('Failed to fetch CRM entities', {
          entityType,
          error: error.message,
          filters
        });
        throw error;
      }

      return {
        entities: data || [],
        nextPage: data && data.length === config.queryConfig.pageSize ? currentPage + 1 : null,
        totalCount: count || 0
      } as QueryPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!organizationId && !!user
  });

  // Flatten entities
  const entities = useMemo(() => {
    const allEntities = data?.pages.flatMap(page => page.entities) || [];
    selection.setEntities(allEntities as T[]);
    return allEntities as T[];
  }, [data, selection]);

  const totalCount = data?.pages[0]?.totalCount || 0;

  // Sync totalCount to unified store for dashboard consistency
  // Uses getState() pattern to avoid feedback loops - effect reads store directly
  // instead of subscribing, preventing render cascades
  useEffect(() => {
    if (totalCount > 0 && organizationId) {
      const { totalCounts, setTotalCount } = useUnifiedCRMStore.getState();
      // Store's setTotalCount is now idempotent, but check here too for clarity
      if (totalCounts[entityType] !== totalCount) {
        setTotalCount(entityType, totalCount);
      }
    }
  }, [totalCount, entityType, organizationId]);

  // ============= CREATE MUTATION =============
  const createMutation = useMutation({
    mutationFn: withCircuitBreaker(async (entityData: Partial<T>) => {
      if (!organizationId || !user) {
        throw new Error('Missing organization or user context');
      }

      trackOperation('create');

      return await retryWithUserFeedback(async () => {
        const newRecord = await safeSingle(
          supabase
            .from(config.table as any)
            .insert({
              ...entityData,
              organization_id: organizationId,
              user_id: user.id
            })
            .select(),
          {
            errorMessage: `Failed to create ${config.displayName}`,
            logContext: 'crm_entity_create'
          }
        );

        if (!newRecord) {
          throw new Error(`Failed to create ${config.displayName}`);
        }

        return newRecord;
      });
    }, circuitBreakers.database),
    onSuccess: (newEntity) => {
      invalidateAfterCreate(entityType, newEntity);
      queryClient.invalidateQueries({ 
        queryKey: ['crm', entityType, organizationId] 
      });
      
      // Audit log the creation
      logAudit('create', (newEntity as any).id, undefined, newEntity);
      
      // Trigger analytics invalidation for dashboard sync
      crmEventBus.emitAnalyticsInvalidate(entityType);
      
      // Track micro-win for creation
      trackWinAction(`${entityType.slice(0, -1)}_created`);
      
      toast({
        title: 'Success',
        description: `${config.displayName} created successfully`
      });

      logInfo(`${entityType} created`, {
        entityId: (newEntity as any).id,
        organizationId
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to create ${config.displayName.toLowerCase()}`,
        variant: 'destructive'
      });

      logError(`Failed to create ${entityType}`, {
        error: error.message
      });
    }
  });

  // ============= UPDATE MUTATION =============
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates, oldValues }: { id: string; updates: Partial<T>; oldValues?: Partial<T> }) => {
      // If oldValues not provided, fetch current record first
      let previousValues: any = oldValues;
      if (!previousValues) {
        const { data: current } = await supabase
          .from(config.table as any)
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .single();
        previousValues = current || undefined;
      }

      const updatedRecord = await retryWithUserFeedback(async () => {
        const result = await safeSingle(
          supabase
            .from(config.table as any)
            .update({
              ...updates,
              updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('organization_id', organizationId)
            .select(),
          {
            errorMessage: `Failed to update ${config.displayName}`,
            logContext: 'crm_entity_update'
          }
        );

        if (!result) {
          throw new Error(`Failed to update ${config.displayName}`);
        }

        return result;
      });

      return { updatedRecord, previousValues };
    },
    onSuccess: ({ updatedRecord, previousValues }, { id, updates }) => {
      invalidateAfterUpdate(entityType, id, updates);
      queryClient.invalidateQueries({ 
        queryKey: ['crm', entityType, organizationId] 
      });
      
      // Audit log the update
      logAudit('update', id, previousValues, updatedRecord);
      
      // Trigger analytics invalidation for dashboard sync
      crmEventBus.emitAnalyticsInvalidate(entityType);
      
      // Track micro-win for updates (especially deal stage changes)
      const metadata: Record<string, any> = {};
      if (entityType === 'deals' && updates && 'stage' in updates) {
        metadata.stage = (updates as any).stage;
        metadata.stageChanged = previousValues?.stage !== (updates as any).stage;

        // Detect reopen: was closed, now not
        const closedStages = ['closed-won', 'closed-lost', 'closed_won', 'closed_lost'];
        const wasClosedStage = closedStages.includes(previousValues?.stage || '');
        const isNowClosed = closedStages.includes((updates as any).stage || '');

        if (wasClosedStage && !isNowClosed) {
          // Check for existing commission records
          supabase
            .from('commission_records')
            .select('status')
            .eq('deal_id', id)
            .then(({ data: commissions }) => {
              if (commissions && commissions.length > 0) {
                const voided = commissions.filter((c: any) => c.status === 'voided');
                const approvedOrPaid = commissions.filter((c: any) => c.status === 'approved' || c.status === 'paid');
                
                if (voided.length > 0) {
                  toast({
                    title: 'Deal Reopened',
                    description: `${voided.length} pending commission(s) voided automatically`,
                  });
                }
                if (approvedOrPaid.length > 0) {
                  toast({
                    title: '⚠️ Commission Warning',
                    description: `${approvedOrPaid.length} approved/paid commission(s) exist for this reopened deal — review with finance`,
                    variant: 'destructive',
                  });
                }
              }
            });
        }
      }
      trackWinAction(`${entityType.slice(0, -1)}_updated`, metadata);
      
      toast({
        title: 'Success',
        description: `${config.displayName} updated successfully`
      });

      logInfo(`${entityType} updated`, {
        entityId: id
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to update ${config.displayName.toLowerCase()}`,
        variant: 'destructive'
      });
    }
  });

  // ============= DELETE MUTATION =============
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Fetch record before deleting for audit log
      const { data: recordToDelete } = await supabase
        .from(config.table as any)
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      // For accounts, unlink child records first to avoid FK constraint errors
      if (entityType === 'accounts') {
        // Unlink contacts from this account
        await supabase
          .from('contacts')
          .update({ account_id: null })
          .eq('account_id', id);

        // Unlink deals from this account (ON DELETE SET NULL may not be applied yet)
        await supabase
          .from('deals')
          .update({ account_id: null })
          .eq('account_id', id);

        // Unlink tasks from this account
        await supabase
          .from('tasks')
          .update({ account_id: null })
          .eq('account_id', id);
      }

      // For deals, clean up deal_contacts junction records
      if (entityType === 'deals') {
        await supabase
          .from('deal_contacts')
          .delete()
          .eq('deal_id', id);
      }

      const { error } = await supabase
        .from(config.table as any)
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) throw error;
      return { id, deletedRecord: recordToDelete };
    },
    onSuccess: ({ id: deletedId, deletedRecord }) => {
      invalidateAfterDelete(entityType, deletedId);
      queryClient.invalidateQueries({ 
        queryKey: ['crm', entityType, organizationId] 
      });
      
      // Audit log the deletion
      logAudit('delete', deletedId, deletedRecord, undefined);
      
      // Trigger analytics invalidation for dashboard sync
      crmEventBus.emitAnalyticsInvalidate(entityType);
      
      toast({
        title: 'Success',
        description: `${config.displayName} deleted successfully`
      });

      logInfo(`${entityType} deleted`, { id: deletedId });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to delete ${config.displayName.toLowerCase()}`,
        variant: 'destructive'
      });
    }
  });

  // ============= BULK DELETE MUTATION =============
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (user) {
        behaviorTracker.trackBatchOperation(user.id, ids.length);
        trackOperation('bulk_delete');
      }

      return await retryWithUserFeedback(async () => {
        const { error } = await supabase
          .from(config.table as any)
          .delete()
          .in('id', ids)
          .eq('organization_id', organizationId);

        if (error) throw error;
        return ids;
      });
    },
    onSuccess: (deletedIds) => {
      invalidateAfterBulkOperation(entityType, 'delete', deletedIds);
      queryClient.invalidateQueries({ 
        queryKey: ['crm', entityType, organizationId] 
      });
      
      // Trigger analytics invalidation for dashboard sync
      crmEventBus.emitAnalyticsInvalidate(entityType);
      
      toast({
        title: 'Success',
        description: `${deletedIds.length} ${config.displayNamePlural.toLowerCase()} deleted successfully`
      });

      logInfo(`Bulk delete ${entityType}`, { count: deletedIds.length });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete selected items',
        variant: 'destructive'
      });
    }
  });

  // ============= BULK UPDATE MUTATION =============
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: any }) => {
      if (user) {
        behaviorTracker.trackBatchOperation(user.id, ids.length);
        trackOperation('bulk_update');
      }

      return await retryWithUserFeedback(async () => {
        const { error } = await supabase
          .from(config.table as any)
          .update(updates)
          .in('id', ids)
          .eq('organization_id', organizationId);

        if (error) throw error;
        return { ids, updates };
      });
    },
    onSuccess: ({ ids, updates }) => {
      invalidateAfterBulkOperation(entityType, 'update', ids);
      queryClient.invalidateQueries({ 
        queryKey: ['crm', entityType, organizationId] 
      });
      
      // Trigger analytics invalidation for dashboard sync
      crmEventBus.emitAnalyticsInvalidate(entityType);
      
      toast({
        title: 'Success',
        description: `${ids.length} ${config.displayNamePlural.toLowerCase()} updated successfully`
      });

      logInfo(`Bulk update ${entityType}`, { count: ids.length, updates });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to update ${config.displayNamePlural.toLowerCase()}`,
        variant: 'destructive'
      });
    }
  });

  // ============= STATS (for dashboard) =============
  const [stats, setStats] = useState<CRMStats | null>(null);

  const fetchStats = useCallback(async () => {
    if (!organizationId) return;

    const cacheKey = `crm_stats_${organizationId}`;
    const cached = unifiedCacheManager.get<CRMStats>(cacheKey);
    if (cached) {
      setStats(cached);
      return;
    }

    try {
      const [contacts, deals, activities, tasks] = await Promise.all([
        supabase.from('contacts').select('id').eq('organization_id', organizationId),
        supabase.from('deals').select('id').eq('organization_id', organizationId),
        supabase.from('activities').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('id').eq('organization_id', organizationId)
      ]);

      const statsData: CRMStats = {
        totalContacts: contacts.data?.length || 0,
        totalDeals: deals.data?.length || 0,
        totalActivities: activities.data?.length || 0,
        totalTasks: tasks.data?.length || 0,
        recentActivity: activities.data || []
      };
      
      setStats(statsData);
      unifiedCacheManager.set(cacheKey, statsData, 2 * 60 * 1000);
    } catch (err: any) {
      logError('Failed to fetch CRM stats', { error: err.message });
    }
  }, [organizationId]);

  // ============= API METHODS =============
  const create = useCallback((entityData: Partial<T>) => {
    return createMutation.mutateAsync(entityData);
  }, [createMutation]);

  const update = useCallback((id: string, updates: Partial<T>) => {
    return updateMutation.mutateAsync({ id, updates });
  }, [updateMutation]);

  const deleteEntity = useCallback((id: string) => {
    return deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const bulkDelete = useCallback((ids: string[]) => {
    return bulkDeleteMutation.mutateAsync(ids);
  }, [bulkDeleteMutation]);

  const bulkUpdate = useCallback((ids: string[], updates: any) => {
    return bulkUpdateMutation.mutateAsync({ ids, updates });
  }, [bulkUpdateMutation]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    // Data
    entities,
    loading: isLoading,
    loadingMore: isFetchingNextPage,
    error,
    hasMore: hasNextPage,
    totalCount,
    stats,
    
    // CRUD operations (match old API)
    createEntity: create,
    updateEntity: update,
    deleteEntity,
    bulkOperations: {
      delete: bulkDelete,
      update: bulkUpdate
    },
    
    // Pagination
    loadMore,
    refresh,
    
    // Selection management
    selection,
    
    // Config (for backwards compatibility)
    config,
    
    // Stats
    refreshStats: fetchStats,
    
    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isBulkUpdating: bulkUpdateMutation.isPending
  };
}
