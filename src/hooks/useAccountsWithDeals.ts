import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

export interface AccountWithDeals {
  id: string;
  account_number: number;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  domain: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  organization_id: string | null;
  deal_count: number;
  total_deal_value: number;
  // Enrichment data
  scraped_data: Record<string, any> | null;
  enriched_at: string | null;
  data_sources: any[] | null;
  confidence_scores: Record<string, number> | null;
}

export function useAccountsWithDeals(searchTerm: string = '') {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const queryClient = useQueryClient();

  const query = useQuery<AccountWithDeals[]>({
    queryKey: ['accounts-with-deals', organizationId, searchTerm],
    queryFn: async () => {
      if (!organizationId) return [];

      // Fetch accounts
      let accountsQuery = supabase
        .from('accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (searchTerm.trim()) {
        accountsQuery = accountsQuery.or(
          `name.ilike.%${searchTerm}%,industry.ilike.%${searchTerm}%,domain.ilike.%${searchTerm}%`
        );
      }

      const { data: accounts, error: accountsError } = await accountsQuery;
      if (accountsError) throw accountsError;
      if (!accounts || accounts.length === 0) return [];

      // Fetch deal counts per account in one query
      const accountIds = accounts.map(a => a.id);
      const { data: dealStats, error: dealsError } = await supabase
        .from('deals')
        .select('account_id, amount')
        .eq('organization_id', organizationId)
        .in('account_id', accountIds);

      if (dealsError) throw dealsError;

      // Aggregate deal counts and totals
      const dealAgg: Record<string, { count: number; total: number }> = {};
      (dealStats || []).forEach(deal => {
        if (!deal.account_id) return;
        if (!dealAgg[deal.account_id]) {
          dealAgg[deal.account_id] = { count: 0, total: 0 };
        }
        dealAgg[deal.account_id].count++;
        dealAgg[deal.account_id].total += deal.amount || 0;
      });

      return accounts.map(account => ({
        ...account,
        deal_count: dealAgg[account.id]?.count || 0,
        total_deal_value: dealAgg[account.id]?.total || 0,
      }));
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts-with-deals', organizationId] });
  };

  return {
    accounts: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refresh,
  };
}
