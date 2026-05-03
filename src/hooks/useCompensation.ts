import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface CompensationPlan {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  base_commission_rate: number;
  tiers: CommissionTier[];
  bonus_criteria: BonusCriteria[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionTier {
  threshold: number;
  rate: number;
  label?: string;
}

export interface BonusCriteria {
  type: 'quota_attainment' | 'deal_count' | 'custom';
  threshold: number;
  bonus_amount: number;
  label?: string;
}

export interface UserCompensationAssignment {
  id: string;
  user_id: string;
  compensation_plan_id: string;
  organization_id: string;
  effective_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  compensation_plan?: CompensationPlan;
  profile?: { id: string; email: string; full_name: string | null };
}

export interface CommissionRecord {
  id: string;
  user_id: string;
  deal_id: string;
  organization_id: string;
  deal_amount: number;
  commission_rate: number;
  commission_earned: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  calculated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  deal?: { id: string; name: string; amount: number; stage: string; close_date: string | null };
  profile?: { id: string; email: string; full_name: string | null };
}

interface UseCompensationReturn {
  plans: CompensationPlan[];
  assignments: UserCompensationAssignment[];
  commissions: CommissionRecord[];
  myCommissions: CommissionRecord[];
  loading: boolean;
  error: string | null;
  createPlan: (plan: Partial<CompensationPlan>) => Promise<CompensationPlan | null>;
  updatePlan: (id: string, updates: Partial<CompensationPlan>) => Promise<boolean>;
  deletePlan: (id: string) => Promise<boolean>;
  assignPlan: (userId: string, planId: string) => Promise<boolean>;
  removeAssignment: (assignmentId: string) => Promise<boolean>;
  approveCommission: (commissionId: string) => Promise<boolean>;
  markCommissionPaid: (commissionId: string) => Promise<boolean>;
  rejectCommission: (commissionId: string, notes?: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

// Use any to bypass type issues until Supabase types regenerate
const db = supabase as any;

export function useCompensation(organizationId: string | undefined): UseCompensationReturn {
  const { user } = useAuth();
  const [plans, setPlans] = useState<CompensationPlan[]>([]);
  const [assignments, setAssignments] = useState<UserCompensationAssignment[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [myCommissions, setMyCommissions] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId || !user) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const { data: plansData, error: plansError } = await db
        .from('compensation_plans')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (plansError) throw plansError;
      const parsedPlans: CompensationPlan[] = (plansData || []).map((p: any) => ({
        ...p,
        tiers: Array.isArray(p.tiers) ? p.tiers : [],
        bonus_criteria: Array.isArray(p.bonus_criteria) ? p.bonus_criteria : [],
      }));
      setPlans(parsedPlans);

      const { data: assignmentsData, error: assignmentsError } = await db
        .from('user_compensation_assignments')
        .select('*, compensation_plan:compensation_plans(*)')
        .eq('organization_id', organizationId)
        .is('end_date', null);

      if (assignmentsError) throw assignmentsError;
      
      const userIds = [...new Set((assignmentsData || []).map((a: any) => a.user_id))];
      const { data: profilesData } = await supabase.from('profiles').select('id, email, full_name').in('id', userIds as string[]);
      const profilesMap: Record<string, any> = {};
      (profilesData || []).forEach(p => { profilesMap[p.id] = p; });

      setAssignments((assignmentsData || []).map((a: any) => ({
        ...a, profile: profilesMap[a.user_id],
        compensation_plan: a.compensation_plan ? { ...a.compensation_plan, tiers: a.compensation_plan.tiers || [], bonus_criteria: a.compensation_plan.bonus_criteria || [] } : undefined,
      })));

      const { data: commissionsData, error: commissionsError } = await db
        .from('commission_records')
        .select('*, deal:deals(id, name, amount, stage, close_date)')
        .eq('organization_id', organizationId)
        .order('calculated_at', { ascending: false });

      if (commissionsError) throw commissionsError;
      const commUserIds = [...new Set((commissionsData || []).map((c: any) => c.user_id))];
      const { data: commProfilesData } = await supabase.from('profiles').select('id, email, full_name').in('id', commUserIds as string[]);
      const commProfilesMap: Record<string, any> = {};
      (commProfilesData || []).forEach(p => { commProfilesMap[p.id] = p; });

      const parsed = (commissionsData || []).map((c: any) => ({ ...c, profile: commProfilesMap[c.user_id] }));
      setCommissions(parsed);
      setMyCommissions(parsed.filter((c: any) => c.user_id === user.id));
    } catch (err: any) {
      setError(err.message || 'Failed to load compensation data');
    } finally {
      setLoading(false);
    }
  }, [organizationId, user]);

  useEffect(() => { loadData(); }, [loadData]);

  const createPlan = async (plan: Partial<CompensationPlan>) => {
    if (!organizationId || !user) return null;
    try {
      const { data, error } = await db.from('compensation_plans').insert({
        organization_id: organizationId, name: plan.name || 'New Plan', description: plan.description,
        base_commission_rate: plan.base_commission_rate || 0.05, tiers: plan.tiers || [], bonus_criteria: plan.bonus_criteria || [],
        is_active: true, created_by: user.id,
      }).select().single();
      if (error) throw error;
      await loadData();
      return { ...data, tiers: data.tiers || [], bonus_criteria: data.bonus_criteria || [] } as CompensationPlan;
    } catch (err: any) { setError(err.message); return null; }
  };

  const updatePlan = async (id: string, updates: Partial<CompensationPlan>) => {
    try {
      const { error } = await db.from('compensation_plans').update(updates).eq('id', id);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const deletePlan = async (id: string) => {
    try {
      const { error } = await db.from('compensation_plans').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const assignPlan = async (userId: string, planId: string) => {
    if (!organizationId || !user) return false;
    try {
      await db.from('user_compensation_assignments').update({ end_date: new Date().toISOString().split('T')[0] })
        .eq('user_id', userId).eq('organization_id', organizationId).is('end_date', null);
      const { error } = await db.from('user_compensation_assignments').insert({
        user_id: userId, compensation_plan_id: planId, organization_id: organizationId, created_by: user.id,
      });
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const removeAssignment = async (assignmentId: string) => {
    try {
      const { error } = await db.from('user_compensation_assignments').update({ end_date: new Date().toISOString().split('T')[0] }).eq('id', assignmentId);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const approveCommission = async (commissionId: string) => {
    if (!user) return false;
    try {
      const { error } = await db.from('commission_records').update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() }).eq('id', commissionId);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const markCommissionPaid = async (commissionId: string) => {
    try {
      const { error } = await db.from('commission_records').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', commissionId);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  const rejectCommission = async (commissionId: string, notes?: string) => {
    try {
      const { error } = await db.from('commission_records').update({ status: 'rejected', notes }).eq('id', commissionId);
      if (error) throw error;
      await loadData();
      return true;
    } catch (err: any) { setError(err.message); return false; }
  };

  return { plans, assignments, commissions, myCommissions, loading, error, createPlan, updatePlan, deletePlan, assignPlan, removeAssignment, approveCommission, markCommissionPaid, rejectCommission, refresh: loadData };
}
