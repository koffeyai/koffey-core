import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from './useOrganizationAccess';
import { useCRMEvent } from '@/lib/crmEventBus';

// ============================================================================
// Types
// ============================================================================

export interface MemoryFact {
  fact: string;
  category: 'personal' | 'professional' | 'deal' | 'communication' | 'preference';
  confidence: number;
  source?: string;
  source_id?: string;
  extracted_at?: string;
}

export interface KeyDate {
  date: string;
  label: string;
  recurring: boolean;
}

export interface CommunicationPreferences {
  channel: string | null;
  tone: string | null;
  best_time: string | null;
}

export interface RelationshipSignals {
  sentiment: string;
  engagement_level: string;
}

export interface ClientMemoryData {
  facts: MemoryFact[];
  summary: string;
  key_dates: KeyDate[];
  communication_preferences: CommunicationPreferences;
  relationship_signals: RelationshipSignals;
}

export interface ClientMemory {
  id: string;
  contact_id: string;
  organization_id: string;
  memory: ClientMemoryData;
  version: number;
  fact_count: number;
  last_encoded_at: string;
  last_analyzed_at: string | null;
  last_compacted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useClientMemory(contactId: string | undefined) {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  const {
    data: memory,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['client-memory', contactId],
    queryFn: async (): Promise<ClientMemory | null> => {
      if (!contactId) return null;

      const { data, error } = await supabase
        .from('client_memory')
        .select('*')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as ClientMemory | null;
    },
    enabled: !!contactId && !!organizationId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Invalidate when CRM entities change (activities, deals created/updated)
  useCRMEvent('entity:created', (event) => {
    if (event.entityType === 'activities' || event.entityType === 'deals') {
      // Delay invalidation slightly to allow the trigger + edge function to process
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['client-memory', contactId] });
      }, 15000); // 15 seconds — accounts for debounce + processing
    }
  });

  useCRMEvent('entity:updated', (event) => {
    if (event.entityType === 'contacts' && event.entityId === contactId) {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['client-memory', contactId] });
      }, 15000);
    }
  });

  return {
    memory,
    isLoading,
    error,
    refetch,
    hasFacts: (memory?.fact_count || 0) > 0,
  };
}
