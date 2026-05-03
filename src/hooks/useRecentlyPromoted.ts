import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

interface PromotedContact {
  id: string;
  full_name: string | null;
  email: string | null;
  previous_status: string | null;
  status: string | null;
  status_changed_at: string | null;
}

/**
 * Hook to fetch contacts that were recently promoted from lead to customer status
 * Used to show a celebratory banner in the Contacts view
 */
export function useRecentlyPromoted(days: number = 7) {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  return useQuery({
    queryKey: ['recently-promoted', organizationId, days],
    queryFn: async () => {
      if (!organizationId) return [];

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, email, previous_status, status, status_changed_at')
        .eq('organization_id', organizationId)
        .eq('status', 'customer')
        .in('previous_status', ['lead', 'mql', 'sql'])
        .gte('status_changed_at', cutoffDate.toISOString())
        .order('status_changed_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching recently promoted contacts:', error);
        return [];
      }

      return data as PromotedContact[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
