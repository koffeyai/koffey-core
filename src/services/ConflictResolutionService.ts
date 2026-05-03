/**
 * ConflictResolutionService - Handles concurrent edits and optimistic locking
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ConflictData {
  recordId: string;
  tableName: string;
  currentVersion: number;
  serverVersion: number;
  localChanges: any;
  serverChanges: any;
  conflictFields: string[];
}

export interface MergeStrategy {
  strategy: 'take_local' | 'take_server' | 'merge_fields' | 'manual_resolve';
  fieldResolutions?: Record<string, 'local' | 'server' | any>;
}

export class ConflictResolutionService {
  private static instance: ConflictResolutionService;
  private readonly supportedTables = new Set(['contacts', 'deals', 'accounts', 'tasks', 'activities']);

  static getInstance(): ConflictResolutionService {
    if (!ConflictResolutionService.instance) {
      ConflictResolutionService.instance = new ConflictResolutionService();
    }
    return ConflictResolutionService.instance;
  }

  /**
   * Attempt optimistic update with version checking
   */
  async updateWithVersionCheck(
    tableName: string,
    recordId: string,
    updates: any,
    expectedVersion: number
  ): Promise<{ success: boolean; conflict?: ConflictData; data?: any }> {
    try {
      if (!this.supportedTables.has(tableName)) {
        throw new Error(`Unsupported table for optimistic updates: ${tableName}`);
      }

      const { data: currentRecord, error: fetchError } = await supabase
        .from(tableName as any)
        .select('*')
        .eq('id', recordId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!currentRecord) {
        return { success: false };
      }

      const serverVersion = currentRecord.version || 1;
      if (serverVersion !== expectedVersion) {
        const conflict = await this.analyzeConflict(
          tableName,
          recordId,
          updates,
          currentRecord,
          expectedVersion
        );
        return { success: false, conflict };
      }

      const nextVersion = serverVersion + 1;
      const payload = {
        ...updates,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await supabase
        .from(tableName as any)
        .update(payload)
        .eq('id', recordId)
        .eq('version', expectedVersion)
        .select('*')
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updated) {
        const latest = await this.getLatestRecord(tableName, recordId);
        if (!latest) return { success: false };
        const conflict = await this.analyzeConflict(
          tableName,
          recordId,
          updates,
          latest,
          expectedVersion
        );
        return { success: false, conflict };
      }

      return { success: true, data: updated };
    } catch (error) {
      console.error('Optimistic update failed:', error);
      throw error;
    }
  }

  /**
   * Analyze conflict between local and server changes
   */
  private async analyzeConflict(
    tableName: string,
    recordId: string,
    localChanges: any,
    serverRecord: any,
    expectedVersion: number
  ): Promise<ConflictData> {
    // Get the version that the client was expecting (to find what changed on server)
    const { data: clientVersionRecord } = await this.getRecordAtVersion(
      tableName,
      recordId,
      expectedVersion
    );

    const serverChanges = this.computeChanges(
      clientVersionRecord || {},
      serverRecord
    );

    const conflictFields = this.findConflictingFields(localChanges, serverChanges);

    return {
      recordId,
      tableName,
      currentVersion: expectedVersion,
      serverVersion: serverRecord.version,
      localChanges,
      serverChanges,
      conflictFields
    };
  }

  /**
   * Get record at specific version (from audit log if available)
   */
  private async getRecordAtVersion(
    tableName: string,
    recordId: string,
    version: number
  ): Promise<any> {
    // Try to reconstruct from audit log
    const { data: auditEntries } = await supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('created_at', { ascending: true });

    if (!auditEntries || auditEntries.length === 0) {
      return null;
    }

    // Reconstruct the record at the given version
    let reconstructed = {};
    
    for (const entry of auditEntries) {
      const operation = String(entry.operation || '').toUpperCase();
      if (operation === 'INSERT' || operation === 'CREATE') {
        reconstructed = entry.new_values || {};
      } else if (operation === 'UPDATE') {
        reconstructed = Object.assign({}, reconstructed, entry.new_values || {});
      }
      
      // Stop when we reach the desired version (check safely)
      if ((reconstructed as any).version >= version) {
        break;
      }
    }

    return reconstructed;
  }

  /**
   * Get latest record
   */
  private async getLatestRecord(tableName: string, recordId: string): Promise<any> {
    if (!this.supportedTables.has(tableName)) return null;
    const { data, error } = await supabase
      .from(tableName as any)
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (error) {
      console.error('Failed to get latest record:', error);
      return null;
    }
    return data;
  }

  /**
   * Compute changes between two records
   */
  private computeChanges(oldRecord: any, newRecord: any): any {
    const changes: any = {};
    const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);

    allKeys.forEach(key => {
      if (oldRecord[key] !== newRecord[key]) {
        changes[key] = {
          from: oldRecord[key],
          to: newRecord[key]
        };
      }
    });

    return changes;
  }

  /**
   * Find fields that conflict between local and server changes
   */
  private findConflictingFields(localChanges: any, serverChanges: any): string[] {
    const conflictFields: string[] = [];
    
    Object.keys(localChanges).forEach(field => {
      if (serverChanges[field] && 
          localChanges[field] !== serverChanges[field].to) {
        conflictFields.push(field);
      }
    });

    return conflictFields;
  }

  /**
   * Resolve conflict using specified strategy
   */
  async resolveConflict(
    conflict: ConflictData,
    strategy: MergeStrategy
  ): Promise<{ success: boolean; data?: any }> {
    try {
      let resolvedChanges: any;

      switch (strategy.strategy) {
        case 'take_local':
          resolvedChanges = conflict.localChanges;
          break;

        case 'take_server':
          // Get latest server state
          const serverRecord = await this.getLatestRecord(
            conflict.tableName,
            conflict.recordId
          );
          return { success: true, data: serverRecord };

        case 'merge_fields':
          resolvedChanges = await this.mergeFields(conflict, strategy.fieldResolutions);
          break;

        case 'manual_resolve':
          resolvedChanges = strategy.fieldResolutions || conflict.localChanges;
          break;

        default:
          throw new Error(`Unknown merge strategy: ${strategy.strategy}`);
      }

      // Apply the resolved changes
      const result = await this.updateWithVersionCheck(
        conflict.tableName,
        conflict.recordId,
        resolvedChanges,
        conflict.serverVersion
      );

      if (!result.success) {
        // Another conflict occurred during resolution
        toast.error('Another user made changes while resolving conflict. Please try again.');
        return { success: false };
      }

      toast.success('Conflict resolved successfully');
      return result;
    } catch (error) {
      console.error('Conflict resolution failed:', error);
      throw error;
    }
  }

  /**
   * Merge fields based on field-level resolutions
   */
  private async mergeFields(
    conflict: ConflictData,
    fieldResolutions?: Record<string, 'local' | 'server' | any>
  ): Promise<any> {
    const merged = { ...conflict.localChanges };

    if (fieldResolutions) {
      Object.entries(fieldResolutions).forEach(([field, resolution]) => {
        if (resolution === 'server') {
          merged[field] = conflict.serverChanges[field]?.to;
        } else if (resolution === 'local') {
          merged[field] = conflict.localChanges[field];
        } else {
          merged[field] = resolution; // Custom value
        }
      });
    }

    return merged;
  }

  /**
   * Generate automatic merge suggestions
   */
  generateMergeSuggestions(conflict: ConflictData): MergeStrategy {
    const fieldResolutions: Record<string, 'local' | 'server'> = {};
    
    conflict.conflictFields.forEach(field => {
      const localValue = conflict.localChanges[field];
      const serverValue = conflict.serverChanges[field]?.to;
      
      // Simple heuristics for automatic resolution
      if (field === 'updated_at' || field === 'version') {
        fieldResolutions[field] = 'server'; // Always take server timestamp/version
      } else if (typeof localValue === 'string' && typeof serverValue === 'string') {
        // Take the longer string (assuming more complete data)
        fieldResolutions[field] = localValue.length > serverValue.length ? 'local' : 'server';
      } else if (typeof localValue === 'number' && typeof serverValue === 'number') {
        // Take the larger number (assuming incremental updates)
        fieldResolutions[field] = localValue > serverValue ? 'local' : 'server';
      } else {
        // Default to local changes for other types
        fieldResolutions[field] = 'local';
      }
    });

    return {
      strategy: 'merge_fields',
      fieldResolutions
    };
  }

  /**
   * Check if a record has been modified since last fetch
   */
  async checkForModifications(
    tableName: string,
    recordId: string,
    lastFetchedVersion: number
  ): Promise<{ modified: boolean; currentVersion?: number }> {
    try {
      const latest = await this.getLatestRecord(tableName, recordId);
      if (!latest) return { modified: false };
      const currentVersion = latest.version || 1;
      return { modified: currentVersion !== lastFetchedVersion, currentVersion };
    } catch (error) {
      console.error('Failed to check modifications:', error);
      return { modified: false };
    }
  }

  /**
   * Set up real-time conflict detection
   */
  setupRealTimeConflictDetection(
    tableName: string,
    recordId: string,
    onConflictDetected: (conflict: ConflictData) => void
  ) {
    const channel = supabase
      .channel(`conflict-detection-${tableName}-${recordId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tableName,
          filter: `id=eq.${recordId}`
        },
        (payload) => {
          // Notify about potential conflict
          console.log('Real-time update detected:', payload);
          // Implementation would check if this creates a conflict
          // and call onConflictDetected if needed
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}
