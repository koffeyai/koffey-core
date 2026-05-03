import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type TimeRange = '24h' | '7d' | '30d';

const getTimeRangeStart = (range: TimeRange): Date => {
  const now = new Date();
  switch (range) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
};

export interface SearchAccuracyMetrics {
  total: number;
  zero_result_count: number;
  zero_result_rate: number;
  avg_time_ms: number;
  avg_match_score: number;
  click_through_rate: number;
  refinement_count: number;
  refinement_rate: number;
  intent_distribution: Record<string, number>;
  is_healthy: boolean;
}

export interface FailingQuery {
  id: string;
  search_query: string;
  intent: string;
  time_to_result_ms: number;
  refinement_attempt: number;
  session_id: string | null;
  created_at: string;
}

/**
 * Hook to fetch aggregated search accuracy metrics using server-side RPC
 * Refreshes every 60 seconds for real-time monitoring
 */
export function useSearchAccuracyMetrics(organizationId: string | undefined, timeRange: TimeRange = '7d') {
  return useQuery({
    queryKey: ['search-accuracy-metrics', organizationId, timeRange],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const since = getTimeRangeStart(timeRange);
      
      const { data, error } = await supabase.rpc('get_search_accuracy_metrics', {
        p_organization_id: organizationId,
        p_since: since.toISOString()
      });
      
      if (error) throw error;
      return data as unknown as SearchAccuracyMetrics;
    },
    enabled: !!organizationId,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000 // Consider data stale after 30 seconds
  });
}

/**
 * Hook to fetch the list of failing (zero-result) queries for investigation
 */
export function useFailingQueries(organizationId: string | undefined, timeRange: TimeRange = '7d', limit = 10) {
  return useQuery({
    queryKey: ['failing-queries', organizationId, timeRange, limit],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const since = getTimeRangeStart(timeRange);
      
      const { data, error } = await supabase.rpc('get_failing_queries', {
        p_organization_id: organizationId,
        p_since: since.toISOString(),
        p_limit: limit
      });
      
      if (error) throw error;
      return (data as FailingQuery[]) || [];
    },
    enabled: !!organizationId,
    refetchInterval: 60000
  });
}

/**
 * Helper to mark a search result as clicked (for click-through tracking)
 * Called from the chat UI when user interacts with a search result
 */
export async function trackResultClick(logId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('query_accuracy_logs')
      .update({ user_clicked_result: true })
      .eq('id', logId);
    
    if (error) {
      console.error('Failed to track result click:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to track result click:', err);
    return false;
  }
}

/**
 * Helper to reset search refinement counter after successful result click
 * This distinguishes "user refined because they didn't find it" from "new search"
 */
export async function resetSearchRefinementCounter(sessionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('chat_sessions')
      .update({ search_attempt_count: 0 })
      .eq('id', sessionId);
    
    if (error) {
      console.error('Failed to reset refinement counter:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to reset refinement counter:', err);
    return false;
  }
}
