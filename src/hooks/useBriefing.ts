import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from './useOrganizationAccess';

export interface MomentumWin {
  deal_name: string;
  deal_id?: string;
  achievement: string;
  context: string;
}

export interface Momentum {
  summary: string;
  wins: MomentumWin[];
  quota_status: {
    percentage: number;
    message: string;
  };
}

export interface PlayAction {
  label: string;
  type: 'meeting_prep' | 'send_content' | 'create_task' | 'call' | 'email' | 'schedule';
  deal_id?: string;
}

export interface PriorityPlay {
  headline: string;
  deal_name?: string;
  deal_id?: string;
  why_this_matters: string;
  context: string[];
  action: PlayAction;
}

export interface AvailablePlay {
  deal_name: string;
  deal_id: string;
  status: 'play_available' | 'patience_window' | 'momentum';
  headline: string;
  context: string;
  suggested_action: PlayAction;
}

export interface InMotionItem {
  deal_name: string;
  deal_id: string;
  what: string;
  context: string;
  your_part_done: boolean;
}

export interface Meeting {
  time: string;
  title: string;
  deal_id?: string;
  prep_ready: boolean;
  key_insight?: string;
}

export interface Briefing {
  greeting: string;
  momentum: Momentum;
  priority_play: PriorityPlay | null;
  available_plays: AvailablePlay[];
  in_motion: InMotionItem[];
  todays_meetings: Meeting[];
}

export interface BriefingResponse {
  briefing: Briefing;
  cached: boolean;
  generated_at: string;
  processing_time_ms?: number;
}

const BACKGROUND_REFRESH_TIMEOUT_MS = 8000;
const refreshInFlight = new Set<string>();

async function loadFallbackBriefing(organizationId: string): Promise<BriefingResponse | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { data: row } = await supabase
    .from('daily_briefings')
    .select('momentum, priority_play, available_plays, in_motion, todays_meetings, generated_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .order('briefing_date', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row?.momentum) return null;

  return {
    briefing: {
      greeting: (row.momentum as any)?.greeting || 'Good morning!',
      momentum: row.momentum as unknown as Momentum,
      priority_play: (row.priority_play as unknown as PriorityPlay) || null,
      available_plays: (row.available_plays as unknown as AvailablePlay[]) || [],
      in_motion: (row.in_motion as unknown as InMotionItem[]) || [],
      todays_meetings: (row.todays_meetings as unknown as Meeting[]) || [],
    },
    cached: true,
    generated_at: row.generated_at || new Date().toISOString(),
  };
}

async function invokeGenerateBriefing(
  organizationId: string,
  options: { forceRegenerate?: boolean; timeoutMs?: number } = {}
): Promise<BriefingResponse> {
  const timeoutMs = options.timeoutMs ?? BACKGROUND_REFRESH_TIMEOUT_MS;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Briefing generation timed out')), timeoutMs);
  });

  try {
    const invokePromise = supabase.functions.invoke('generate-briefing', {
      body: {
        organizationId,
        ...(options.forceRegenerate ? { forceRegenerate: true } : {}),
      },
    });

    const result = await Promise.race([invokePromise, timeoutPromise]) as {
      data: BriefingResponse | null;
      error: Error | null;
    };

    if (result.error || !result.data) {
      throw result.error || new Error('Failed to generate briefing');
    }

    return result.data;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useBriefing() {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  // Include today's date in the query key so the briefing auto-refreshes
  // when the date changes (e.g., user left tab open overnight)
  const today = new Date().toISOString().split('T')[0];

  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['briefing', organizationId, today],
    queryFn: async (): Promise<BriefingResponse> => {
      if (!organizationId) throw new Error('No organization');

      // Return the latest stored briefing immediately when present,
      // then refresh in the background so first paint isn't blocked by LLM latency.
      const fallback = await loadFallbackBriefing(organizationId);
      if (fallback) {
        const refreshKey = `${organizationId}:${today}`;
        if (!refreshInFlight.has(refreshKey)) {
          refreshInFlight.add(refreshKey);
          void invokeGenerateBriefing(organizationId)
            .then((freshData) => {
              queryClient.setQueryData(['briefing', organizationId, today], freshData);
            })
            .catch(() => {
              // Keep fallback response if refresh fails/times out.
            })
            .finally(() => {
              refreshInFlight.delete(refreshKey);
            });
        }
        return fallback;
      }

      // No fallback exists: block only on a bounded request.
      return await invokeGenerateBriefing(organizationId);
    },
    enabled: !!organizationId,
    staleTime: 15 * 60 * 1000, // 15 minutes - briefing refreshes more often
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: true, // Auto-refresh when user returns to the app
    retry: 2
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');
      return await invokeGenerateBriefing(organizationId, { forceRegenerate: true, timeoutMs: 12000 });
    },
    onSuccess: (newData) => {
      queryClient.setQueryData(['briefing', organizationId, today], newData);
    }
  });

  const markViewed = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_briefings')
        .update({ viewed_at: new Date().toISOString() })
        .eq('briefing_date', today);
    }
  });

  const trackAction = useMutation({
    mutationFn: async (action: { type: string; deal_id?: string; play_index?: number }) => {
      const today = new Date().toISOString().split('T')[0];
      
      // Get current actions
      const { data: current } = await supabase
        .from('daily_briefings')
        .select('plays_actioned')
        .eq('briefing_date', today)
        .single();

      const actions = (current?.plays_actioned as any[]) || [];
      actions.push({ ...action, timestamp: new Date().toISOString() });

      await supabase
        .from('daily_briefings')
        .update({ plays_actioned: actions })
        .eq('briefing_date', today);
    }
  });

  return {
    briefing: data?.briefing,
    isLoading,
    error,
    isCached: data?.cached,
    generatedAt: data?.generated_at,
    regenerate: regenerate.mutate,
    isRegenerating: regenerate.isPending,
    markViewed: markViewed.mutate,
    trackAction: trackAction.mutate,
    refetch
  };
}
