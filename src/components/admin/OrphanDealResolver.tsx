import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Check, Building2, DollarSign, Loader2 } from 'lucide-react';
import { AccountCombobox } from '@/components/deals/AccountCombobox';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useCRM } from '@/hooks/useCRM';
import { useDialogStore } from '@/stores/dialogStore';
import { toast } from 'sonner';

interface OrphanDeal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  created_at: string;
  account_id: string | null;
}

interface ResolverState {
  [dealId: string]: {
    accountId: string | null;
    accountName: string;
  };
}

export function OrphanDealResolver() {
  const [orphanDeals, setOrphanDeals] = useState<OrphanDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolverState, setResolverState] = useState<ResolverState>({});
  const [savingDealId, setSavingDealId] = useState<string | null>(null);
  const { organizationId } = useOrganizationAccess();
  const { openAccountDialog } = useDialogStore();

  // Fetch orphan deals
  useEffect(() => {
    async function fetchOrphanDeals() {
      if (!organizationId) return;
      
      setLoading(true);
      const { data, error } = await supabase
        .from('deals')
        .select('id, name, amount, stage, created_at, account_id')
        .eq('organization_id', organizationId)
        .is('account_id', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching orphan deals:', error);
        toast.error('Failed to load orphan deals');
      } else {
        setOrphanDeals(data || []);
      }
      setLoading(false);
    }

    fetchOrphanDeals();
  }, [organizationId]);

  const handleAccountChange = (dealId: string, accountId: string, accountName: string) => {
    setResolverState(prev => ({
      ...prev,
      [dealId]: { accountId, accountName }
    }));
  };

  const handleCreateNewAccount = (dealId: string, searchTerm: string) => {
    openAccountDialog(undefined, searchTerm, (newAccountId, newAccountName) => {
      handleAccountChange(dealId, newAccountId, newAccountName);
    });
  };

  const handleSaveDeal = async (dealId: string) => {
    const state = resolverState[dealId];
    if (!state?.accountId) {
      toast.error('Please select an account first');
      return;
    }

    setSavingDealId(dealId);
    
    const { error } = await supabase
      .from('deals')
      .update({ account_id: state.accountId })
      .eq('id', dealId);

    if (error) {
      console.error('Error updating deal:', error);
      toast.error('Failed to update deal');
    } else {
      toast.success('Deal linked to account successfully');
      setOrphanDeals(prev => prev.filter(d => d.id !== dealId));
      setResolverState(prev => {
        const newState = { ...prev };
        delete newState[dealId];
        return newState;
      });
    }

    setSavingDealId(null);
  };

  const handleSaveAll = async () => {
    const dealsToSave = Object.entries(resolverState).filter(([_, state]) => state.accountId);
    
    if (dealsToSave.length === 0) {
      toast.error('No deals to save. Please select accounts first.');
      return;
    }

    setLoading(true);
    let successCount = 0;

    for (const [dealId, state] of dealsToSave) {
      if (state.accountId) {
        const { error } = await supabase
          .from('deals')
          .update({ account_id: state.accountId })
          .eq('id', dealId);

        if (!error) {
          successCount++;
        }
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully linked ${successCount} deal(s) to accounts`);
      // Refresh the list
      const { data } = await supabase
        .from('deals')
        .select('id, name, amount, stage, created_at, account_id')
        .eq('organization_id', organizationId)
        .is('account_id', null)
        .order('created_at', { ascending: false });
      
      setOrphanDeals(data || []);
      setResolverState({});
    }

    setLoading(false);
  };

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading && orphanDeals.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading orphan deals...</span>
        </CardContent>
      </Card>
    );
  }

  if (orphanDeals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            All Deals Linked
          </CardTitle>
          <CardDescription>
            All opportunities in your CRM are properly associated with accounts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Orphan Deals Require Attention
            </CardTitle>
            <CardDescription>
              {orphanDeals.length} deal(s) are not linked to any account. 
              Assign accounts to enable account-level analytics.
            </CardDescription>
          </div>
          <Button 
            onClick={handleSaveAll}
            disabled={loading || Object.keys(resolverState).length === 0}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Data Quality Issue</AlertTitle>
          <AlertDescription>
            These deals cannot be analyzed at the account level until they are linked to accounts.
            Select or create an account for each deal below.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {orphanDeals.map((deal) => (
            <div 
              key={deal.id} 
              className="flex items-center gap-4 p-4 border rounded-lg bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{deal.name}</span>
                  <Badge variant="outline" className="shrink-0">{deal.stage}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatAmount(deal.amount)}
                  </span>
                  <span>Created {new Date(deal.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-64">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <AccountCombobox
                    value={resolverState[deal.id]?.accountId || null}
                    displayValue={resolverState[deal.id]?.accountName || ''}
                    onChange={(accountId, accountName) => 
                      handleAccountChange(deal.id, accountId, accountName)
                    }
                    onCreateNew={(searchTerm) => 
                      handleCreateNewAccount(deal.id, searchTerm)
                    }
                    required
                  />
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => handleSaveDeal(deal.id)}
                disabled={!resolverState[deal.id]?.accountId || savingDealId === deal.id}
              >
                {savingDealId === deal.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default OrphanDealResolver;
