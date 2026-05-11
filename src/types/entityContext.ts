/**
 * Structured Entity Context
 * 
 * Provides cross-message awareness of CRM entities without
 * relying on LLM parsing formatted display strings.
 * Persisted in chat_sessions.entity_context for session restore.
 * 
 * @example
 * // User: "show my deals" → Scout shows Home Depot
 * // User: "analyze it" → System uses primaryEntity.id
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type EntityType = 'account' | 'deal' | 'contact' | 'task';

export interface EntityReference {
  /** UUID of the entity */
  id: string;
  /** Display name */
  name: string;
  /** Entity type for routing to correct tool */
  type: EntityType;
  /** Additional context (stage, industry, role) */
  subtitle?: string;
  /** Ambiguous option group from the last clarification prompt */
  selectionGroup?: string;
  /** 1-based option number shown to the user */
  selectionIndex?: number;
  /** Original fuzzy label that produced this option list */
  selectionLabel?: string;
  /** Timestamp when referenced (epoch ms or ISO string from backend) */
  referencedAt: number | string;
}

export interface ReferencedEntities {
  deals?: EntityReference[];
  accounts?: EntityReference[];
  contacts?: EntityReference[];
  tasks?: EntityReference[];
}

// ============================================================================
// CONTEXT PASSED TO BACKEND
// ============================================================================

export interface EntityContext {
  /** Entities from the previous response */
  referencedEntities?: ReferencedEntities;
  /** The most recently referenced entity (for "it", "that" resolution) */
  primaryEntity?: EntityReference | null;
}

// ============================================================================
// CONTEXT RETURNED FROM BACKEND
// ============================================================================

export interface EntityContextMetadata {
  /** Entities mentioned/returned in this response */
  referencedEntities: ReferencedEntities;
  /** Primary entity if a single entity was the focus */
  primaryEntity?: EntityReference | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum entities to store per type */
export const MAX_ENTITIES_PER_TYPE = 5;

/** Context expiry time (24 hours in ms) */
export const CONTEXT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Debounce delay for saving to DB (ms) */
export const SAVE_DEBOUNCE_MS = 1000;

function toEpochMs(timestamp: number | string): number {
  if (typeof timestamp === 'number') return timestamp;

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the most recently referenced entity of a specific type
 */
export function getMostRecentEntity(
  context: ReferencedEntities | undefined,
  type: EntityType
): EntityReference | undefined {
  const key = `${type}s` as keyof ReferencedEntities;
  const entities = context?.[key];
  if (!entities || entities.length === 0) return undefined;
  
  return [...entities].sort((a, b) => toEpochMs(b.referencedAt) - toEpochMs(a.referencedAt))[0];
}

/**
 * Get the single primary entity if one exists
 */
export function getPrimaryEntity(
  context: EntityContext | undefined
): EntityReference | undefined {
  return context?.primaryEntity;
}

/**
 * Merge incoming entities with existing context
 * - Deduplicates by ID
 * - Sorts by recency (newest first)
 * - Keeps max 5 per type
 */
export function mergeEntityContext(
  existing: ReferencedEntities | undefined,
  incoming: ReferencedEntities | undefined
): ReferencedEntities {
  if (!incoming) return existing || {};
  if (!existing) return incoming;

  const merged: ReferencedEntities = {};
  const types: Array<keyof ReferencedEntities> = ['deals', 'accounts', 'contacts', 'tasks'];
  
  for (const type of types) {
    const existingEntities = existing[type] || [];
    const incomingEntities = incoming[type] || [];
    
    if (existingEntities.length === 0 && incomingEntities.length === 0) {
      continue;
    }

    // Combine with incoming first (higher priority)
    const combined = [...incomingEntities, ...existingEntities];
    
    // Dedupe by ID (keep first occurrence = most recent)
    const seen = new Set<string>();
    const deduped = combined.filter(entity => {
      if (seen.has(entity.id)) return false;
      seen.add(entity.id);
      return true;
    });
    
    // Sort by recency and limit
    const sorted = deduped
      .sort((a, b) => toEpochMs(b.referencedAt) - toEpochMs(a.referencedAt))
      .slice(0, MAX_ENTITIES_PER_TYPE);
    
    if (sorted.length > 0) {
      merged[type] = sorted;
    }
  }
  
  return merged;
}

/**
 * Check if persisted context is stale (older than 24 hours)
 */
export function isContextStale(updatedAt: number | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - updatedAt > CONTEXT_EXPIRY_MS;
}
