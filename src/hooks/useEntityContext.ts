/**
 * useEntityContext - Persistent entity context for pronoun resolution
 * 
 * Features:
 * - React state for fast access
 * - Database persistence for session restore
 * - Debounced saves (1 save/second max)
 * - Auto-expiry of stale context (24h)
 * - Merge incoming with existing (deduped, sorted)
 * 
 * @example
 * const { entityContext, updateContext } = useEntityContext({ sessionId });
 * // Pass entityContext to unified-chat
 * // Call updateContext(response.meta.entityContext) after response
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  EntityReference,
  ReferencedEntities,
  EntityContextMetadata
} from '@/types/entityContext';
import { mergeEntityContext } from '@/types/entityContext';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum entities to store per type */
const MAX_ENTITIES_PER_TYPE = 5;

/** Context expiry time (24 hours in ms) */
const CONTEXT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Debounce delay for saving to DB (ms) */
const SAVE_DEBOUNCE_MS = 1000;

// ============================================================================
// TYPES
// ============================================================================

interface PersistedEntityContext {
  referencedEntities: ReferencedEntities;
  primaryEntity?: EntityReference;
  updatedAt: number;
}

interface UseEntityContextOptions {
  sessionId: string | null;
  organizationId: string | null;
}

interface UseEntityContextReturn {
  /** Current context to pass to backend */
  entityContext: {
    referencedEntities?: ReferencedEntities;
    primaryEntity?: EntityReference;
  };
  /** Update context from response */
  updateContext: (response: EntityContextMetadata) => void;
  /** Clear primary entity on topic shift */
  clearPrimaryEntity: () => void;
  /** Clear context (new session) */
  clearContext: () => void;
  /** Loading state */
  isLoading: boolean;
  /** Whether restored from DB */
  isRestored: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function isContextStaleCheck(updatedAt: number | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - updatedAt > CONTEXT_EXPIRY_MS;
}

function isValidEntityReference(entity: unknown): entity is EntityReference {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as Record<string, unknown>;
  // Accept referencedAt as number (epoch ms) or string (ISO date from backend)
  const hasValidTimestamp = typeof e.referencedAt === 'number' ||
    (typeof e.referencedAt === 'string' && e.referencedAt.length > 0);
  return (
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    typeof e.name === 'string' &&
    e.name.length > 0 &&
    ['account', 'deal', 'contact', 'task'].includes(e.type as string) &&
    hasValidTimestamp
  );
}

function sanitizeEntityContext(context: unknown): ReferencedEntities {
  if (!context || typeof context !== 'object') return {};
  
  const input = context as Record<string, unknown>;
  const sanitized: ReferencedEntities = {};
  const types: Array<keyof ReferencedEntities> = ['deals', 'accounts', 'contacts', 'tasks'];
  
  for (const type of types) {
    const entities = input[type];
    if (!Array.isArray(entities)) continue;
    
    const valid = entities
      .filter(isValidEntityReference)
      .slice(0, MAX_ENTITIES_PER_TYPE);
    
    if (valid.length > 0) {
      sanitized[type] = valid;
    }
  }
  
  return sanitized;
}

// ============================================================================
// HOOK
// ============================================================================

export function useEntityContext({
  sessionId,
  organizationId
}: UseEntityContextOptions): UseEntityContextReturn {
  // State
  const [referencedEntities, setReferencedEntities] = useState<ReferencedEntities>({});
  const [primaryEntity, setPrimaryEntity] = useState<EntityReference | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  
  // Refs for debouncing
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<PersistedEntityContext | null>(null);
  const lastSessionIdRef = useRef<string | null>(null);

  // ==========================================================================
  // SAVE TO DATABASE (debounced)
  // ==========================================================================
  
  const saveToDatabase = useCallback(async (context: PersistedEntityContext) => {
    if (!sessionId || !organizationId) return;

    try {
      // Cast to JSON-compatible type for Supabase
      const jsonContext = JSON.parse(JSON.stringify(context));
      
      const { error } = await supabase
        .from('chat_sessions')
        .update({ entity_context: jsonContext })
        .eq('id', sessionId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('[useEntityContext] Save failed:', error.message);
      } else {
        console.log('[useEntityContext] Context saved to DB');
      }
    } catch (err) {
      console.error('[useEntityContext] Save error:', err);
    }
  }, [sessionId, organizationId]);

  const scheduleSave = useCallback((context: PersistedEntityContext) => {
    pendingSaveRef.current = context;
    
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    saveTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        saveToDatabase(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }
    }, SAVE_DEBOUNCE_MS);
  }, [saveToDatabase]);

  // ==========================================================================
  // LOAD FROM DATABASE
  // ==========================================================================
  
  useEffect(() => {
    // Skip if same session (avoid reloading on re-renders)
    if (sessionId === lastSessionIdRef.current) return;
    lastSessionIdRef.current = sessionId;

    // Reset state if no session
    if (!sessionId || !organizationId) {
      setReferencedEntities({});
      setPrimaryEntity(undefined);
      setIsRestored(false);
      return;
    }

    const loadContext = async () => {
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('entity_context')
          .eq('id', sessionId)
          .eq('organization_id', organizationId)
          .single();

        if (error) {
          // Session might not exist yet - not an error
          if (error.code !== 'PGRST116') {
            console.error('[useEntityContext] Load error:', error.message);
          }
          setIsRestored(true);
          return;
        }

        // Parse from JSON, with type assertion
        const rawContext = data?.entity_context;
        const context = rawContext as unknown as PersistedEntityContext | null;
        
        if (context && context.updatedAt && !isContextStaleCheck(context.updatedAt)) {
          // Sanitize before using (defense in depth)
          const sanitized = sanitizeEntityContext(context.referencedEntities);
          setReferencedEntities(sanitized);
          
          if (context.primaryEntity && isValidEntityReference(context.primaryEntity)) {
            setPrimaryEntity(context.primaryEntity);
          }
          
          console.log('[useEntityContext] Restored:', {
            deals: sanitized.deals?.length || 0,
            accounts: sanitized.accounts?.length || 0,
            primary: context.primaryEntity?.name
          });
        } else if (context) {
          // Clear stale context
          console.log('[useEntityContext] Clearing stale context');
          await supabase
            .from('chat_sessions')
            .update({ entity_context: null })
            .eq('id', sessionId);
        }
        
        setIsRestored(true);
      } catch (err) {
        console.error('[useEntityContext] Load failed:', err);
        setIsRestored(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadContext();
  }, [sessionId, organizationId]);

  // ==========================================================================
  // CLEANUP ON UNMOUNT
  // ==========================================================================
  
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // Flush pending save synchronously on unmount
      if (pendingSaveRef.current && sessionId && organizationId) {
        // Fire and forget - we're unmounting anyway
        const jsonContext = JSON.parse(JSON.stringify(pendingSaveRef.current));
        supabase
          .from('chat_sessions')
          .update({ entity_context: jsonContext })
          .eq('id', sessionId)
          .eq('organization_id', organizationId);
      }
    };
  }, [sessionId, organizationId]);

  // ==========================================================================
  // UPDATE CONTEXT
  // ==========================================================================
  
  const updateContext = useCallback((response: EntityContextMetadata) => {
    if (!response) return;

    // Sanitize incoming data
    const sanitizedIncoming = sanitizeEntityContext(response.referencedEntities);
    
    setReferencedEntities(prev => {
      const merged = mergeEntityContext(prev, sanitizedIncoming);
      
      // Prepare for persistence
      const persisted: PersistedEntityContext = {
        referencedEntities: merged,
        primaryEntity: response.primaryEntity || primaryEntity,
        updatedAt: Date.now()
      };
      
      scheduleSave(persisted);
      return merged;
    });

    if (response.primaryEntity) {
      setPrimaryEntity(response.primaryEntity);
    }
  }, [primaryEntity, scheduleSave]);

  // ==========================================================================
  // CLEAR PRIMARY ENTITY (topic shift — keep referenced entities, clear focus)
  // ==========================================================================

  const clearPrimaryEntity = useCallback(() => {
    setPrimaryEntity(undefined);
  }, []);

  // ==========================================================================
  // CLEAR CONTEXT
  // ==========================================================================

  const clearContext = useCallback(() => {
    setReferencedEntities({});
    setPrimaryEntity(undefined);
    
    if (sessionId && organizationId) {
      supabase
        .from('chat_sessions')
        .update({ entity_context: null })
        .eq('id', sessionId)
        .eq('organization_id', organizationId)
        .then(({ error }) => {
          if (error) console.error('[useEntityContext] Clear failed:', error.message);
        });
    }
  }, [sessionId, organizationId]);

  // ==========================================================================
  // RETURN
  // ==========================================================================
  
  return {
    entityContext: {
      referencedEntities,
      primaryEntity
    },
    updateContext,
    clearPrimaryEntity,
    clearContext,
    isLoading,
    isRestored
  };
}
