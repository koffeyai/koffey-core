import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useMemo } from 'react';
import { toast } from 'sonner';

export interface DealContact {
  id: string;
  deal_id: string;
  contact_id: string;
  organization_id: string | null;
  support_axis: number | null;
  influence_axis: number | null;
  quadrant: string | null;
  role_in_deal: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined contact data
  contact?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    linkedin_url: string | null;
  };
}

export interface DealContactHistory {
  id: string;
  deal_contact_id: string | null;
  deal_id: string;
  contact_id: string;
  support_axis: number | null;
  influence_axis: number | null;
  quadrant: string | null;
  change_type: 'created' | 'ranking_updated' | 'removed';
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

export interface StakeholderStats {
  total: number;
  ranked: number;
  unranked: number;
  byQuadrant: {
    champion_influential: number;
    champion_peripheral: number;
    adversarial_influential: number;
    adversarial_peripheral: number;
  };
}

interface AddContactParams {
  dealId: string;
  contactId: string;
  roleInDeal?: string;
  notes?: string;
}

interface UpdateRankingParams {
  dealContactId: string;
  supportAxis: number;
  influenceAxis: number;
  changeReason?: string;
}

interface RemoveContactParams {
  dealContactId: string;
}

export function useDealContacts(dealId: string | undefined) {
  const { user } = useAuth();
  const { organizationId } = useOrganizationAccess();
  const queryClient = useQueryClient();

  const queryKey = ['deal-contacts', dealId];

  // Fetch contacts linked to the deal
  const {
    data: contacts = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<DealContact[]> => {
      if (!dealId || !organizationId) return [];

      const { data, error } = await supabase
        .from('deal_contacts')
        .select(`
          *,
          contact:contacts(
            id,
            first_name,
            last_name,
            full_name,
            email,
            title,
            company,
            linkedin_url
          )
        `)
        .eq('deal_id', dealId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as DealContact[];
    },
    enabled: !!dealId && !!organizationId,
    staleTime: 30000,
  });

  // Fetch ranking history for trend analysis
  const { data: history = [] } = useQuery({
    queryKey: ['deal-contact-history', dealId],
    queryFn: async (): Promise<DealContactHistory[]> => {
      if (!dealId || !organizationId) return [];

      const { data, error } = await supabase
        .from('deal_contact_history')
        .select('*')
        .eq('deal_id', dealId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as DealContactHistory[];
    },
    enabled: !!dealId && !!organizationId,
    staleTime: 60000,
  });

  // Add contact to deal
  const addContactMutation = useMutation({
    mutationFn: async ({ dealId, contactId, roleInDeal, notes }: AddContactParams) => {
      if (!organizationId || !user?.id) {
        throw new Error('Organization and user required');
      }

      const { data, error } = await supabase
        .from('deal_contacts')
        .insert({
          deal_id: dealId,
          contact_id: contactId,
          organization_id: organizationId,
          role_in_deal: roleInDeal || null,
          notes: notes || null,
          created_by: user.id,
        })
        .select(`
          *,
          contact:contacts(
            id,
            first_name,
            last_name,
            full_name,
            email,
            title,
            company,
            linkedin_url
          )
        `)
        .single();

      if (error) throw error;
      return data as DealContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Stakeholder added to deal');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('This contact is already linked to the deal');
      } else {
        toast.error('Failed to add stakeholder');
      }
    },
  });

  // Update ranking
  const updateRankingMutation = useMutation({
    mutationFn: async ({ dealContactId, supportAxis, influenceAxis }: UpdateRankingParams) => {
      const { data, error } = await supabase
        .from('deal_contacts')
        .update({
          support_axis: supportAxis,
          influence_axis: influenceAxis,
        })
        .eq('id', dealContactId)
        .select(`
          *,
          contact:contacts(
            id,
            first_name,
            last_name,
            full_name,
            email,
            title,
            company,
            linkedin_url
          )
        `)
        .single();

      if (error) throw error;
      return data as DealContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['deal-contact-history', dealId] });
      toast.success('Stakeholder ranking updated');
    },
    onError: () => {
      toast.error('Failed to update ranking');
    },
  });

  // Remove contact from deal
  const removeContactMutation = useMutation({
    mutationFn: async ({ dealContactId }: RemoveContactParams) => {
      const { error } = await supabase
        .from('deal_contacts')
        .delete()
        .eq('id', dealContactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['deal-contact-history', dealId] });
      toast.success('Stakeholder removed from deal');
    },
    onError: () => {
      toast.error('Failed to remove stakeholder');
    },
  });

  // Compute stats
  const stats = useMemo((): StakeholderStats => {
    const byQuadrant = {
      champion_influential: 0,
      champion_peripheral: 0,
      adversarial_influential: 0,
      adversarial_peripheral: 0,
    };

    let ranked = 0;
    let unranked = 0;

    contacts.forEach(contact => {
      if (contact.quadrant && contact.quadrant in byQuadrant) {
        byQuadrant[contact.quadrant as keyof typeof byQuadrant]++;
        ranked++;
      } else {
        unranked++;
      }
    });

    return {
      total: contacts.length,
      ranked,
      unranked,
      byQuadrant,
    };
  }, [contacts]);

  // Get unranked contacts (limit to 10 for coaching prompt)
  const unrankedContacts = useMemo(() => {
    return contacts
      .filter(c => !c.quadrant)
      .slice(0, 10);
  }, [contacts]);

  // Get recent ranking changes for trend analysis
  const recentChanges = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    return history
      .filter(h => new Date(h.created_at).getTime() > thirtyDaysAgo && h.change_type === 'ranking_updated')
      .map(h => ({
        contactId: h.contact_id,
        quadrant: h.quadrant,
        changedAt: h.created_at,
        daysAgo: Math.floor((now - new Date(h.created_at).getTime()) / (24 * 60 * 60 * 1000)),
      }));
  }, [history]);

  return {
    contacts,
    history,
    stats,
    unrankedContacts,
    recentChanges,
    isLoading,
    error,
    refetch,
    addContact: addContactMutation.mutate,
    updateRanking: updateRankingMutation.mutate,
    removeContact: removeContactMutation.mutate,
    removeContactAsync: removeContactMutation.mutateAsync,
    isAdding: addContactMutation.isPending,
    isUpdating: updateRankingMutation.isPending,
    isRemoving: removeContactMutation.isPending,
  };
}

// Helper to get quadrant label
export function getQuadrantLabel(quadrant: string | null): string {
  const labels: Record<string, string> = {
    champion_influential: 'Champion (Influential)',
    champion_peripheral: 'Supporter (Peripheral)',
    adversarial_influential: 'Blocker (Influential)',
    adversarial_peripheral: 'Tactical Blocker (Peripheral)',
  };
  return quadrant ? labels[quadrant] || 'Unknown' : 'Unranked';
}

// Helper to get quadrant color classes
export function getQuadrantColor(quadrant: string | null): string {
  const colors: Record<string, string> = {
    champion_influential: 'bg-green-500/20 text-green-400 border-green-500/30',
    champion_peripheral: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    adversarial_influential: 'bg-red-500/20 text-red-400 border-red-500/30',
    adversarial_peripheral: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };
  return quadrant ? colors[quadrant] || 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground border-dashed';
}
