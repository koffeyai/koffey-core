/**
 * Shared types for extracted tool executors.
 *
 * All tool executor functions receive a ToolExecutorContext and return a Promise<any>.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.50.0';

export interface ToolExecutorContext {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
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
}

export type AccountMatchResult = {
  id: string;
  name: string;
  matchType: 'exact' | 'fuzzy' | 'domain';
} | null;
