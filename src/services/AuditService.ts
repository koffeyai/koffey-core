/**
 * AuditService - Comprehensive audit trail and approval workflow
 */

import { supabase } from '@/integrations/supabase/client';

const AUDIT_OPERATION_VALUES = {
  create: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
} as const;

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  organization_id: string;
  user_id: string;
  operation: string;
  old_values?: any;
  new_values?: any;
  changes?: any;
  chat_message_id?: string;
  approval_required: boolean;
  approval_status: string;
  approved_by?: string;
  reason?: string;
  created_at: string;
}

export interface ApprovalRule {
  id: string;
  entity_type: string;
  rule_name: string;
  condition_type: string;
  field_name?: string;
  threshold_value?: number;
  threshold_text?: string;
  requires_approval: boolean;
  approver_role: string;
  is_active: boolean;
}

export class AuditService {
  private static instance: AuditService;

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log an entity operation
   */
  async logEntityAction(
    tableName: string,
    recordId: string,
    operation: 'create' | 'update' | 'delete',
    organizationId: string,
    userId: string,
    oldValues?: any,
    newValues?: any,
    chatMessageId?: string,
    reason?: string
  ): Promise<AuditEntry> {
    try {
      // Calculate changes
      const changes = this.computeChanges(oldValues, newValues);
      
      // Check if approval is required
      const approvalRequired = await this.checkApprovalRequired(
        tableName,
        operation,
        newValues || oldValues,
        organizationId
      );

      const auditData = {
        table_name: tableName,
        record_id: recordId,
        organization_id: organizationId,
        user_id: userId,
        operation: AUDIT_OPERATION_VALUES[operation],
        old_values: oldValues,
        new_values: newValues,
        changes,
        chat_message_id: chatMessageId,
        approval_required: approvalRequired,
        approval_status: approvalRequired ? 'pending' : 'auto_approved',
        reason
      };

      const { data, error } = await supabase
        .from('audit_log')
        .insert(auditData)
        .select()
        .single();

      if (error) {
        console.warn('[AuditService] Failed to log audit entry (non-blocking):', error.code, error.message);
        return auditData as any; // Return the attempted data for debugging, don't crash the operation
      }

      // If approval is required, create notification
      if (approvalRequired) {
        await this.createApprovalNotification(data, organizationId);
      }

      return data;
    } catch (error) {
      console.error('Audit logging failed:', error);
      // Return a mock entry instead of throwing - audit is non-critical
      // This prevents audit failures from crashing the app
      return {
        id: 'audit-failed',
        table_name: tableName,
        record_id: recordId,
        organization_id: organizationId,
        user_id: userId,
        operation: AUDIT_OPERATION_VALUES[operation],
        old_values: oldValues,
        new_values: newValues,
        approval_required: false,
        approval_status: 'auto_approved',
        created_at: new Date().toISOString()
      } as AuditEntry;
    }
  }

  /**
   * Check if an operation requires approval
   */
  private async checkApprovalRequired(
    tableName: string,
    operation: string,
    data: any,
    organizationId: string
  ): Promise<boolean> {
    try {
      const { data: rules } = await supabase
        .from('approval_rules')
        .select('*')
        .eq('entity_type', tableName)
        .eq('is_active', true)
        .or(`organization_id.eq.${organizationId},organization_id.is.null`);

      if (!rules || rules.length === 0) return false;

      // Check each rule
      for (const rule of rules) {
        if (await this.evaluateApprovalRule(rule, data, operation)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Approval rule check failed:', error);
      return false; // Default to no approval required on error
    }
  }

  /**
   * Evaluate a single approval rule
   */
  private async evaluateApprovalRule(
    rule: ApprovalRule,
    data: any,
    operation: string
  ): Promise<boolean> {
    if (!rule.requires_approval) return false;

    switch (rule.condition_type) {
      case 'always':
        return true;

      case 'amount_threshold':
        if (rule.field_name && rule.threshold_value) {
          const value = data[rule.field_name];
          return value && parseFloat(value) > rule.threshold_value;
        }
        return false;

      case 'field_value':
        if (rule.field_name && rule.threshold_text) {
          const value = data[rule.field_name];
          return value === rule.threshold_text;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Create approval notification
   */
  private async createApprovalNotification(
    auditEntry: AuditEntry,
    organizationId: string
  ): Promise<void> {
    try {
      // Find users with approval permissions
      const { data: approvers } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId)
        .eq('role', 'admin')
        .eq('is_active', true);

      if (!approvers || approvers.length === 0) return;

      // Create notifications for all approvers
      const notifications = approvers.map(approver => ({
        organization_id: organizationId,
        user_id: approver.user_id,
        type: 'approval_required',
        title: 'Approval Required',
        message: `${auditEntry.operation} operation on ${auditEntry.table_name} requires approval`,
        action_label: 'Review',
        action_data: { audit_id: auditEntry.id },
        is_persistent: true
      }));

      await supabase
        .from('admin_notifications')
        .insert(notifications);
    } catch (error) {
      console.error('Failed to create approval notification:', error);
    }
  }

  /**
   * Approve a pending audit entry
   */
  async approveEntry(
    auditId: string,
    approverId: string,
    reason?: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('audit_log')
        .update({
          approval_status: 'approved',
          approved_by: approverId,
          reason: reason || 'Approved via admin review'
        })
        .eq('id', auditId)
        .eq('approval_status', 'pending');

      if (error) {
        throw error;
      }

      // Mark related notifications as read
      await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('action_data->audit_id', auditId);
    } catch (error) {
      console.error('Failed to approve entry:', error);
      throw error;
    }
  }

  /**
   * Reject a pending audit entry
   */
  async rejectEntry(
    auditId: string,
    approverId: string,
    reason: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('audit_log')
        .update({
          approval_status: 'rejected',
          approved_by: approverId,
          reason
        })
        .eq('id', auditId)
        .eq('approval_status', 'pending');

      if (error) {
        throw error;
      }

      // Mark related notifications as read
      await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('action_data->audit_id', auditId);
    } catch (error) {
      console.error('Failed to reject entry:', error);
      throw error;
    }
  }

  /**
   * Get audit history for an entity
   */
  async getEntityHistory(
    recordId: string,
    organizationId: string
  ): Promise<AuditEntry[]> {
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('record_id', recordId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get entity history:', error);
      return [];
    }
  }

  /**
   * Get pending approvals for organization
   */
  async getPendingApprovals(organizationId: string): Promise<AuditEntry[]> {
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get pending approvals:', error);
      return [];
    }
  }

  /**
   * Compute changes between old and new values
   */
  private computeChanges(oldValues: any, newValues: any): any {
    if (!oldValues && !newValues) return {};
    if (!oldValues) return { created: newValues };
    if (!newValues) return { deleted: oldValues };

    const changes: any = {};
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

    allKeys.forEach(key => {
      const oldVal = oldValues[key];
      const newVal = newValues[key];

      if (oldVal !== newVal) {
        changes[key] = {
          from: oldVal,
          to: newVal
        };
      }
    });

    return changes;
  }

  /**
   * Create approval rules for organization
   */
  async createApprovalRule(
    organizationId: string,
    rule: Omit<ApprovalRule, 'id'>
  ): Promise<ApprovalRule> {
    try {
      const { data, error } = await supabase
        .from('approval_rules')
        .insert({
          ...rule,
          organization_id: organizationId
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to create approval rule:', error);
      throw error;
    }
  }

  /**
   * Get approval rules for organization
   */
  async getApprovalRules(organizationId: string): Promise<ApprovalRule[]> {
    try {
      const { data, error } = await supabase
        .from('approval_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('rule_name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get approval rules:', error);
      return [];
    }
  }
}
