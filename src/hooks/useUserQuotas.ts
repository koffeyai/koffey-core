import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface UserQuota {
  id: string;
  user_id: string;
  organization_id: string;
  amount: number;
  period: 'monthly' | 'quarterly' | 'annual';
  fiscal_year_start_month: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: { id: string; email: string; full_name: string | null };
}

export interface TeamMemberWithQuota {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  quota?: UserQuota;
  won_deals_value: number;
  attainment_percentage: number;
}

interface UseUserQuotasReturn {
  userQuotas: UserQuota[];
  teamMembers: TeamMemberWithQuota[];
  myQuota: UserQuota | null;
  loading: boolean;
  error: string | null;
  setUserQuota: (userId: string, amount: number, period?: 'monthly' | 'quarterly' | 'annual') => Promise<boolean>;
  bulkSetQuotas: (userIds: string[], amount: number, period?: 'monthly' | 'quarterly' | 'annual') => Promise<boolean>;
  deleteUserQuota: (quotaId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const db = supabase as any;

export function useUserQuotas(organizationId: string | undefined): UseUserQuotasReturn {
  const { user } = useAuth();
  const [userQuotas, setUserQuotas] = useState<UserQuota[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberWithQuota[]>([]);
  const [myQuota, setMyQuota] = useState<UserQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId || !user) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const { data: quotasData, error: quotasError } = await db
        .from('user_quotas').select('*').eq('organization_id', organizationId).eq('is_active', true);
      if (quotasError) throw quotasError;

      const quotaUserIds = [...new Set((quotasData || []).map((q: any) => q.user_id))];
      const { data: quotaProfiles } = await supabase.from('profiles').select('id, email, full_name').in('id', quotaUserIds as string[]);
      const quotaProfilesMap: Record<string, any> = {};
      (quotaProfiles || []).forEach(p => { quotaProfilesMap[p.id] = p; });

      const parsedQuotas: UserQuota[] = (quotasData || []).map((q: any) => ({ ...q, profile: quotaProfilesMap[q.user_id] }));
      setUserQuotas(parsedQuotas);
      setMyQuota(parsedQuotas.find(q => q.user_id === user.id) || null);

      const { data: membersData, error: membersError } = await supabase
        .from('organization_members').select('user_id, role').eq('organization_id', organizationId).eq('is_active', true);
      if (membersError) throw membersError;

      const memberIds = (membersData || []).map(m => m.user_id);
      const { data: memberProfiles } = await supabase.from('profiles').select('id, email, full_name').in('id', memberIds);
      const memberProfilesMap: Record<string, any> = {};
      (memberProfiles || []).forEach(p => { memberProfilesMap[p.id] = p; });

      const { data: dealsData } = await supabase.from('deals').select('user_id, amount').eq('organization_id', organizationId).eq('stage', 'won');
      const wonDealsMap: Record<string, number> = {};
      (dealsData || []).forEach(d => { if (d.user_id) wonDealsMap[d.user_id] = (wonDealsMap[d.user_id] || 0) + (Number(d.amount) || 0); });

      const quotasMap: Record<string, UserQuota> = {};
      parsedQuotas.forEach(q => { quotasMap[q.user_id] = q; });

      setTeamMembers((membersData || []).map(m => {
        const profile = memberProfilesMap[m.user_id];
        const quota = quotasMap[m.user_id];
        const wonValue = wonDealsMap[m.user_id] || 0;
        const quotaAmount = quota?.amount || 0;
        return {
          user_id: m.user_id, email: profile?.email || '', full_name: profile?.full_name || null,
          role: m.role, quota, won_deals_value: wonValue,
          attainment_percentage: quotaAmount > 0 ? (wonValue / quotaAmount) * 100 : 0,
        };
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load quotas');
    } finally {
      setLoading(false);
    }
  }, [organizationId, user]);

  useEffect(() => { loadData(); }, [loadData]);

  const setUserQuota = async (userId: string, amount: number, period: 'monthly' | 'quarterly' | 'annual' = 'quarterly') => {
    if (!organizationId || !user) return false;
    try {
      await db.from('user_quotas').update({ is_active: false }).eq('user_id', userId).eq('organization_id', organizationId).eq('period', period).eq('is_active', true);
      const { error } = await db.from('user_quotas').insert({ user_id: userId, organization_id: organizationId, amount, period, is_active: true, created_by: user.id });
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const bulkSetQuotas = async (userIds: string[], amount: number, period: 'monthly' | 'quarterly' | 'annual' = 'quarterly') => {
    if (!organizationId || !user) return false;
    try {
      for (const userId of userIds) {
        await db.from('user_quotas').update({ is_active: false }).eq('user_id', userId).eq('organization_id', organizationId).eq('period', period).eq('is_active', true);
      }
      const { error } = await db.from('user_quotas').insert(userIds.map(userId => ({ user_id: userId, organization_id: organizationId, amount, period, is_active: true, created_by: user.id })));
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const deleteUserQuota = async (quotaId: string) => {
    try {
      const { error } = await db.from('user_quotas').update({ is_active: false }).eq('id', quotaId);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  return { userQuotas, teamMembers, myQuota, loading, error, setUserQuota, bulkSetQuotas, deleteUserQuota, refresh: loadData };
}
