import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from 'sonner';

export type QuotaPeriod = 'monthly' | 'quarterly' | 'annual';

export interface SalesQuota {
  id: string;
  organization_id: string;
  user_id: string | null;
  amount: number;
  period: QuotaPeriod;
  fiscal_year_start: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface QuotaProgress {
  current: number;
  target: number;
  percentage: number;
  periodLabel: string;
  daysRemaining: number;
  pacing: 'ahead' | 'on-track' | 'behind';
}

interface UseQuotaReturn {
  quota: SalesQuota | null;
  progress: QuotaProgress | null;
  loading: boolean;
  saving: boolean;
  canManageQuota: boolean;
  setQuota: (amount: number, period: QuotaPeriod) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export const useQuota = (organizationId: string | undefined, wonDealsValue: number = 0, userRole?: string): UseQuotaReturn => {
  const { user } = useAuth();
  const [quota, setQuotaState] = useState<SalesQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Calculate canManageQuota directly from passed role
  const managerRoles = ['admin', 'owner', 'manager'];
  const canManageQuota = managerRoles.includes(userRole || '');

  const fetchQuota = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('sales_quotas')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setQuotaState({
          ...data,
          period: data.period as QuotaPeriod
        });
      } else {
        setQuotaState(null);
      }
    } catch (error) {
      console.error('Failed to fetch quota:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  const setQuota = async (amount: number, period: QuotaPeriod): Promise<boolean> => {
    if (!organizationId || !user) {
      toast.error('Unable to save quota');
      return false;
    }

    setSaving(true);
    try {
      // Deactivate existing quotas
      await supabase
        .from('sales_quotas')
        .update({ is_active: false })
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      // Create new quota
      const { data, error } = await supabase
        .from('sales_quotas')
        .insert({
          organization_id: organizationId,
          amount,
          period,
          created_by: user.id,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setQuotaState({
        ...data,
        period: data.period as QuotaPeriod
      });
      toast.success('Revenue target saved');
      return true;
    } catch (error: any) {
      console.error('Failed to save quota:', error);
      // Check for RLS permission error
      if (error?.code === '42501' || error?.message?.includes('row-level security')) {
        toast.error('Only managers and admins can set revenue targets');
      } else {
        toast.error('Failed to save revenue target');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Calculate progress based on current period
  const calculateProgress = (): QuotaProgress | null => {
    if (!quota) return null;

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const fiscalStart = quota.fiscal_year_start || 1;
    
    let periodStart: Date;
    let periodEnd: Date;
    let periodLabel: string;

    switch (quota.period) {
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        periodLabel = now.toLocaleDateString('en-US', { month: 'long' });
        break;
      
      case 'quarterly':
        // Calculate fiscal quarter
        const fiscalMonth = ((currentMonth - fiscalStart + 12) % 12) + 1;
        const quarterIndex = Math.floor((fiscalMonth - 1) / 3);
        const quarterStartMonth = ((fiscalStart - 1 + quarterIndex * 3) % 12);
        
        periodStart = new Date(now.getFullYear(), quarterStartMonth, 1);
        if (quarterStartMonth > now.getMonth()) {
          periodStart.setFullYear(periodStart.getFullYear() - 1);
        }
        periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 3, 0);
        periodLabel = `Q${quarterIndex + 1}`;
        break;
      
      case 'annual':
        const fiscalYearStartMonth = fiscalStart - 1; // 0-indexed
        periodStart = new Date(now.getFullYear(), fiscalYearStartMonth, 1);
        if (periodStart > now) {
          periodStart.setFullYear(periodStart.getFullYear() - 1);
        }
        periodEnd = new Date(periodStart.getFullYear() + 1, fiscalYearStartMonth, 0);
        periodLabel = `FY${periodStart.getFullYear() + 1}`;
        break;
    }

    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, totalDays - elapsedDays);
    
    const percentage = quota.amount > 0 ? (wonDealsValue / quota.amount) * 100 : 0;
    const expectedPercentage = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
    
    let pacing: 'ahead' | 'on-track' | 'behind';
    if (percentage >= expectedPercentage + 10) {
      pacing = 'ahead';
    } else if (percentage >= expectedPercentage - 10) {
      pacing = 'on-track';
    } else {
      pacing = 'behind';
    }

    return {
      current: wonDealsValue,
      target: quota.amount,
      percentage: Math.min(percentage, 100),
      periodLabel,
      daysRemaining,
      pacing
    };
  };

  return {
    quota,
    progress: calculateProgress(),
    loading,
    saving,
    canManageQuota,
    setQuota,
    refresh: fetchQuota
  };
};
