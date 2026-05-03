import { useCallback } from 'react';
import { AuditService, AuditEntry } from '@/services/AuditService';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

/**
 * Hook for audit logging CRM operations
 */
export function useAuditLog() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  
  const auditService = AuditService.getInstance();
  const organizationId = currentOrganization?.organization_id;

  const logCreate = useCallback(async (
    tableName: string,
    recordId: string,
    newValues: any,
    chatMessageId?: string
  ) => {
    if (!organizationId || !user?.id) return;
    
    try {
      await auditService.logEntityAction(
        tableName,
        recordId,
        'create',
        organizationId,
        user.id,
        undefined,
        newValues,
        chatMessageId
      );
    } catch (error) {
      console.error('Audit logging failed for create:', error);
    }
  }, [organizationId, user?.id, auditService]);

  const logUpdate = useCallback(async (
    tableName: string,
    recordId: string,
    oldValues: any,
    newValues: any,
    chatMessageId?: string
  ) => {
    if (!organizationId || !user?.id) return;
    
    try {
      await auditService.logEntityAction(
        tableName,
        recordId,
        'update',
        organizationId,
        user.id,
        oldValues,
        newValues,
        chatMessageId
      );
    } catch (error) {
      console.error('Audit logging failed for update:', error);
    }
  }, [organizationId, user?.id, auditService]);

  const logDelete = useCallback(async (
    tableName: string,
    recordId: string,
    oldValues: any,
    chatMessageId?: string
  ) => {
    if (!organizationId || !user?.id) return;
    
    try {
      await auditService.logEntityAction(
        tableName,
        recordId,
        'delete',
        organizationId,
        user.id,
        oldValues,
        undefined,
        chatMessageId
      );
    } catch (error) {
      console.error('Audit logging failed for delete:', error);
    }
  }, [organizationId, user?.id, auditService]);

  const getEntityHistory = useCallback(async (
    recordId: string
  ): Promise<AuditEntry[]> => {
    if (!organizationId) return [];
    
    return auditService.getEntityHistory(recordId, organizationId);
  }, [organizationId, auditService]);

  const getPendingApprovals = useCallback(async (): Promise<AuditEntry[]> => {
    if (!organizationId) return [];
    
    return auditService.getPendingApprovals(organizationId);
  }, [organizationId, auditService]);

  const approveChange = useCallback(async (
    auditId: string,
    reason?: string
  ) => {
    if (!user?.id) return;
    
    await auditService.approveEntry(auditId, user.id, reason);
  }, [user?.id, auditService]);

  const rejectChange = useCallback(async (
    auditId: string,
    reason: string
  ) => {
    if (!user?.id) return;
    
    await auditService.rejectEntry(auditId, user.id, reason);
  }, [user?.id, auditService]);

  return {
    logCreate,
    logUpdate,
    logDelete,
    getEntityHistory,
    getPendingApprovals,
    approveChange,
    rejectChange,
    organizationId
  };
}
