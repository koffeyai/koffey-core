import { CRMEntityType, ConflictInfo } from '@/stores/unifiedCRMStore';
import { logDebug } from './logger';

// =============================================================================
// EVENT TYPES
// =============================================================================

export type CRMEventType =
  | 'entity:created'
  | 'entity:updated'
  | 'entity:deleted'
  | 'entity:conflict'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:error'
  | 'cache:invalidated'
  | 'cache:cleared'
  | 'analytics:invalidate';

export interface CRMEvent<T = any> {
  type: CRMEventType;
  entityType?: CRMEntityType;
  entityId?: string;
  payload?: T;
  timestamp: number;
  source?: 'local' | 'realtime' | 'refetch';
}

export interface EntityCreatedPayload {
  entity: Record<string, any>;
}

export interface EntityUpdatedPayload {
  entity: Record<string, any>;
  previousEntity?: Record<string, any>;
  changedFields?: string[];
}

export interface EntityDeletedPayload {
  entityId: string;
}

export interface ConflictPayload {
  conflict: ConflictInfo;
}

export interface SyncPayload {
  entityTypes?: CRMEntityType[];
  error?: Error;
}

// =============================================================================
// EVENT BUS IMPLEMENTATION
// =============================================================================

type EventHandler<T = any> = (event: CRMEvent<T>) => void;

interface Subscription {
  id: string;
  eventType: CRMEventType | '*';
  entityType?: CRMEntityType;
  handler: EventHandler;
}

class CRMEventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private subscriptionIdCounter = 0;
  private eventHistory: CRMEvent[] = [];
  private maxHistorySize = 100;

  // Subscribe to events
  subscribe<T = any>(
    eventType: CRMEventType | '*',
    handler: EventHandler<T>,
    entityType?: CRMEntityType
  ): () => void {
    const id = `sub_${++this.subscriptionIdCounter}`;
    
    this.subscriptions.set(id, {
      id,
      eventType,
      entityType,
      handler: handler as EventHandler,
    });

    logDebug('[CRMEventBus] Subscription added', { id, eventType, entityType });

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(id);
      logDebug('[CRMEventBus] Subscription removed', { id });
    };
  }

  // Emit an event
  emit<T = any>(
    type: CRMEventType,
    payload?: T,
    options?: {
      entityType?: CRMEntityType;
      entityId?: string;
      source?: 'local' | 'realtime' | 'refetch';
    }
  ): void {
    const event: CRMEvent<T> = {
      type,
      payload,
      entityType: options?.entityType,
      entityId: options?.entityId,
      source: options?.source || 'local',
      timestamp: Date.now(),
    };

    // Add to history
    this.eventHistory.push(event as CRMEvent);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    logDebug('[CRMEventBus] Event emitted', { type, entityType: options?.entityType, entityId: options?.entityId });

    // Notify subscribers
    this.subscriptions.forEach((subscription) => {
      const matchesEventType = subscription.eventType === '*' || subscription.eventType === type;
      const matchesEntityType = !subscription.entityType || subscription.entityType === options?.entityType;

      if (matchesEventType && matchesEntityType) {
        try {
          subscription.handler(event);
        } catch (error) {
          console.error('[CRMEventBus] Handler error:', error);
        }
      }
    });
  }

  // Convenience methods for common events
  emitEntityCreated(entityType: CRMEntityType, entity: Record<string, any>, source: 'local' | 'realtime' = 'local'): void {
    this.emit<EntityCreatedPayload>('entity:created', { entity }, {
      entityType,
      entityId: entity.id,
      source,
    });
  }

  emitEntityUpdated(
    entityType: CRMEntityType,
    entity: Record<string, any>,
    previousEntity?: Record<string, any>,
    source: 'local' | 'realtime' = 'local'
  ): void {
    const changedFields = previousEntity
      ? Object.keys(entity).filter((key) => entity[key] !== previousEntity[key])
      : undefined;

    this.emit<EntityUpdatedPayload>('entity:updated', { entity, previousEntity, changedFields }, {
      entityType,
      entityId: entity.id,
      source,
    });
  }

  emitEntityDeleted(entityType: CRMEntityType, entityId: string, source: 'local' | 'realtime' = 'local'): void {
    this.emit<EntityDeletedPayload>('entity:deleted', { entityId }, {
      entityType,
      entityId,
      source,
    });
  }

  emitConflict(conflict: ConflictInfo): void {
    this.emit<ConflictPayload>('entity:conflict', { conflict }, {
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      source: 'realtime',
    });
  }

  emitSyncStarted(entityTypes?: CRMEntityType[]): void {
    this.emit<SyncPayload>('sync:started', { entityTypes });
  }

  emitSyncCompleted(entityTypes?: CRMEntityType[]): void {
    this.emit<SyncPayload>('sync:completed', { entityTypes });
  }

  emitSyncError(error: Error, entityTypes?: CRMEntityType[]): void {
    this.emit<SyncPayload>('sync:error', { entityTypes, error });
  }

  emitCacheInvalidated(entityType: CRMEntityType): void {
    this.emit('cache:invalidated', undefined, { entityType });
  }

  emitCacheCleared(): void {
    this.emit('cache:cleared');
  }

  // Analytics invalidation - triggers RPC refetches
  emitAnalyticsInvalidate(entityType: CRMEntityType): void {
    this.emit('analytics:invalidate', { entityType }, { entityType });
  }

  // Get recent events (for debugging)
  getRecentEvents(count = 10): CRMEvent[] {
    return this.eventHistory.slice(-count);
  }

  // Get subscription count (for debugging)
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  // Clear all subscriptions (for cleanup)
  clear(): void {
    this.subscriptions.clear();
    this.eventHistory = [];
    logDebug('[CRMEventBus] Cleared all subscriptions and history');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const crmEventBus = new CRMEventBus();

// =============================================================================
// REACT HOOK
// =============================================================================

import { useEffect, useRef } from 'react';

export const useCRMEvent = <T = any>(
  eventType: CRMEventType | '*',
  handler: EventHandler<T>,
  entityType?: CRMEntityType
): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribe = crmEventBus.subscribe<T>(
      eventType,
      (event) => handlerRef.current(event),
      entityType
    );

    return unsubscribe;
  }, [eventType, entityType]);
};

// Subscribe to entity conflicts
export const useCRMConflicts = (
  onConflict: (conflict: ConflictInfo) => void
): void => {
  useCRMEvent<ConflictPayload>('entity:conflict', (event) => {
    if (event.payload?.conflict) {
      onConflict(event.payload.conflict);
    }
  });
};

// Subscribe to entity changes for a specific type
export const useCRMEntityChanges = (
  entityType: CRMEntityType,
  handlers: {
    onCreate?: (entity: Record<string, any>) => void;
    onUpdate?: (entity: Record<string, any>, changedFields?: string[]) => void;
    onDelete?: (entityId: string) => void;
  }
): void => {
  useCRMEvent<EntityCreatedPayload>('entity:created', (event) => {
    if (event.payload?.entity) {
      handlers.onCreate?.(event.payload.entity);
    }
  }, entityType);

  useCRMEvent<EntityUpdatedPayload>('entity:updated', (event) => {
    if (event.payload?.entity) {
      handlers.onUpdate?.(event.payload.entity, event.payload.changedFields);
    }
  }, entityType);

  useCRMEvent<EntityDeletedPayload>('entity:deleted', (event) => {
    if (event.payload?.entityId) {
      handlers.onDelete?.(event.payload.entityId);
    }
  }, entityType);
};
