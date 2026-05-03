/**
 * Skills Architecture — Type Definitions
 *
 * Each skill is a self-contained unit: schema + instructions + handler.
 * Skills are registered in registry.ts and loaded selectively per request tier.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.50.0';

// ============================================================================
// Skill Domains
// ============================================================================

export type SkillDomain =
  | 'search'
  | 'create'
  | 'update'
  | 'analytics'
  | 'coaching'
  | 'scheduling'
  | 'intelligence'
  | 'product'
  | 'leads'
  | 'sequences'
  | 'admin'
  | 'presentation'
  | 'context'
  | 'email';

// ============================================================================
// Skill Definition
// ============================================================================

export interface SkillDefinition {
  /** Tool function name — matches what the LLM calls (e.g. "create_deal") */
  name: string;

  /** Human-readable display name (e.g. "Create Deal") */
  displayName: string;

  /** Functional domain for grouping */
  domain: SkillDomain;

  /** Semver version */
  version: string;

  /** Loading tier: 'core' = always loaded at standard+, 'pro' = only at pro tier */
  loadTier: 'core' | 'pro';

  /** OpenAI-compatible tool schema sent to the LLM */
  schema: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  };

  /** Behavioral instructions injected into the system prompt */
  instructions: string;

  /** Execution handler */
  execute: (ctx: ToolExecutionContext) => Promise<any>;

  /** Example trigger phrases for docs/testing */
  triggerExamples?: string[];
}

// ============================================================================
// Tool Execution Context
// ============================================================================

export interface ToolExecutionContext {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  args: Record<string, unknown>;
  activeContext?: {
    lastEntityType?: string;
    lastEntityIds?: string[];
    lastEntityNames?: string[];
  };
  entityContext?: {
    primaryEntity?: {
      type?: string;
      id?: string;
      name?: string;
    };
    referencedEntities?: Record<string, Array<{ id: string; name: string }>>;
  };
  sessionId?: string;
  sessionTable?: 'chat_sessions' | 'messaging_sessions';
  traceId?: string;
}

// ============================================================================
// Tool Filter (for selective loading)
// ============================================================================

export interface ToolFilter {
  /** Routing tier from complexity-router */
  tier?: 'lite' | 'standard' | 'pro';
  /** Optional domain filter */
  domains?: SkillDomain[];
}

// ============================================================================
// Tool Schema (what the LLM receives)
// ============================================================================

export type ToolSchema = SkillDefinition['schema'];
