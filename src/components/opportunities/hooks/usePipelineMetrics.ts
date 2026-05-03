import { useMemo } from 'react';
import { useRoleBasedAccess } from './useRoleBasedAccess';
import { useQuota } from '@/hooks/useQuota';
import { Deal } from '../components/DealsPage';

interface PipelineMetrics {
  quotaAttainment: {
    current: number;
    target: number;
    percentage: number;
  };
  expectedEarnings: number;
  totalPipelineValue: number;
  activeDealsCount: number;
  selectedDealsValue: number;
  wonDealsValue: number;
  loading: boolean;
}

export const usePipelineMetrics = (deals: Deal[], selectedDeals: string[] = []) => {
  const { userRole, userId, organizationId } = useRoleBasedAccess();
  
  // Calculate won deals value first
  const wonDealsValue = useMemo(() => {
    const relevantDeals = userRole.canViewTeamData 
      ? deals 
      : deals.filter(deal => (deal as any).user_id === userId);
    
    const wonDeals = relevantDeals.filter(deal => deal.stage === 'closed-won');
    return wonDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
  }, [deals, userRole, userId]);

  // Use the quota hook with won deals value
  const { quota, progress, loading } = useQuota(organizationId, wonDealsValue);

  const metrics = useMemo((): PipelineMetrics => {
    if (!deals.length) {
      return {
        quotaAttainment: { 
          current: 0, 
          target: quota?.amount || 0, 
          percentage: 0 
        },
        expectedEarnings: 0,
        totalPipelineValue: 0,
        activeDealsCount: 0,
        selectedDealsValue: 0,
        wonDealsValue: 0,
        loading,
      };
    }

    // Filter deals based on user role
    const relevantDeals = userRole.canViewTeamData 
      ? deals 
      : deals.filter(deal => (deal as any).user_id === userId);

    const activeDeals = relevantDeals.filter(deal => 
      !['closed-won', 'closed-lost'].includes(deal.stage)
    );

    const wonDeals = relevantDeals.filter(deal => deal.stage === 'closed-won');
    const selectedDealsData = relevantDeals.filter(deal => selectedDeals.includes(deal.id));

    const totalPipelineValue = activeDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
    const expectedEarnings = activeDeals.reduce((sum, deal) => {
      const probability = (deal.probability || 0) / 100;
      return sum + (deal.amount || 0) * probability;
    }, 0);
    
    const calculatedWonDealsValue = wonDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
    const selectedDealsValue = selectedDealsData.reduce((sum, deal) => sum + (deal.amount || 0), 0);

    // Use quota from hook, or 0 if not set
    const quotaTarget = quota?.amount || 0;
    const quotaPercentage = quotaTarget > 0 ? (calculatedWonDealsValue / quotaTarget) * 100 : 0;

    return {
      quotaAttainment: {
        current: calculatedWonDealsValue,
        target: quotaTarget,
        percentage: Math.min(quotaPercentage, 100),
      },
      expectedEarnings,
      totalPipelineValue,
      activeDealsCount: activeDeals.length,
      selectedDealsValue,
      wonDealsValue: calculatedWonDealsValue,
      loading,
    };
  }, [deals, selectedDeals, quota, userRole, userId, loading]);

  return metrics;
};