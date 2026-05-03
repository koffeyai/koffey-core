import { useMemo } from 'react';
import { useUnifiedCRMStore } from '@/stores/unifiedCRMStore';
import { differenceInDays, parseISO, isValid } from 'date-fns';

export interface RiskFactor {
  type: 'inactivity' | 'overdue' | 'approaching' | 'no_amount' | 'no_contact' | 'stage_stuck' | 'low_probability';
  severity: 'low' | 'medium' | 'high';
  description: string;
  daysAffected?: number;
}

export interface AtRiskDeal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  closeDate: string | null;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  suggestedAction: string;
}

// Risk thresholds by stage (days without activity before flagging)
const INACTIVITY_THRESHOLDS: Record<string, number> = {
  'prospecting': 7,
  'qualification': 5,
  'proposal': 3,
  'negotiation': 2,
  'closed_won': 999,
  'closed_lost': 999,
};

export function useAtRiskDeals() {
  const dealsMap = useUnifiedCRMStore(state => state.entities.deals);
  const activitiesMap = useUnifiedCRMStore(state => state.entities.activities);
  
  const deals = useMemo(() => Array.from(dealsMap?.values() || []), [dealsMap]);
  const activities = useMemo(() => Array.from(activitiesMap?.values() || []), [activitiesMap]);

  const atRiskDeals = useMemo(() => {
    const now = new Date();
    const results: AtRiskDeal[] = [];

    for (const deal of deals) {
      // Skip closed deals
      if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') continue;

      const factors: RiskFactor[] = [];
      let riskScore = 0;

      // 1. Check inactivity
      const dealActivities = activities.filter(a => a.deal_id === deal.id);
      const lastActivity = dealActivities.length > 0
        ? dealActivities.reduce((latest, a) => {
            const aDate = a.activity_date ? parseISO(a.activity_date) : parseISO(a.created_at);
            const latestDate = latest.activity_date ? parseISO(latest.activity_date) : parseISO(latest.created_at);
            return aDate > latestDate ? a : latest;
          })
        : null;

      const lastActivityDate = lastActivity
        ? (lastActivity.activity_date ? parseISO(lastActivity.activity_date) : parseISO(lastActivity.created_at))
        : parseISO(deal.created_at);

      const daysSinceActivity = differenceInDays(now, lastActivityDate);
      const threshold = INACTIVITY_THRESHOLDS[deal.stage] || 7;

      if (daysSinceActivity > threshold) {
        const severity = daysSinceActivity > threshold * 3 ? 'high' : daysSinceActivity > threshold * 2 ? 'medium' : 'low';
        factors.push({
          type: 'inactivity',
          severity,
          description: `No activity in ${daysSinceActivity} days`,
          daysAffected: daysSinceActivity
        });
        riskScore += severity === 'high' ? 30 : severity === 'medium' ? 20 : 10;
      }

      // 2. Check close date
      if (deal.close_date || deal.expected_close_date) {
        const closeDate = parseISO(deal.close_date || deal.expected_close_date!);
        if (isValid(closeDate)) {
          const daysUntilClose = differenceInDays(closeDate, now);

          if (daysUntilClose < 0) {
            // Past due
            factors.push({
              type: 'overdue',
              severity: 'high',
              description: `Close date passed ${Math.abs(daysUntilClose)} days ago`,
              daysAffected: Math.abs(daysUntilClose)
            });
            riskScore += 35;
          } else if (daysUntilClose <= 7) {
            // Approaching close
            factors.push({
              type: 'approaching',
              severity: daysUntilClose <= 3 ? 'high' : 'medium',
              description: `Closing in ${daysUntilClose} days`,
              daysAffected: daysUntilClose
            });
            riskScore += daysUntilClose <= 3 ? 25 : 15;
          }
        }
      }

      // 3. Check missing amount
      if (!deal.amount || deal.amount === 0) {
        factors.push({
          type: 'no_amount',
          severity: 'medium',
          description: 'No deal value set'
        });
        riskScore += 10;
      }

      // 4. Check missing contact
      if (!deal.contact_id) {
        factors.push({
          type: 'no_contact',
          severity: 'medium',
          description: 'No contact associated'
        });
        riskScore += 10;
      }

      // 5. Check low probability
      if (deal.probability !== null && deal.probability < 30) {
        factors.push({
          type: 'low_probability',
          severity: deal.probability < 15 ? 'high' : 'medium',
          description: `Low win probability (${deal.probability}%)`
        });
        riskScore += deal.probability < 15 ? 20 : 10;
      }

      // Only include deals with risk factors
      if (factors.length > 0) {
        // Cap at 100
        riskScore = Math.min(riskScore, 100);

        // Determine risk level
        const riskLevel: AtRiskDeal['riskLevel'] = 
          riskScore >= 70 ? 'critical' :
          riskScore >= 50 ? 'high' :
          riskScore >= 30 ? 'medium' : 'low';

        // Generate suggested action based on top risk factor
        const topFactor = factors.sort((a, b) => {
          const severityOrder = { high: 3, medium: 2, low: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        })[0];

        let suggestedAction = 'Review this deal';
        switch (topFactor.type) {
          case 'inactivity':
            suggestedAction = 'Schedule a follow-up call or send check-in email';
            break;
          case 'overdue':
            suggestedAction = 'Update close date or mark as closed-lost';
            break;
          case 'approaching':
            suggestedAction = 'Push for final decision or negotiate terms';
            break;
          case 'no_amount':
            suggestedAction = 'Add deal value to improve forecasting';
            break;
          case 'no_contact':
            suggestedAction = 'Link a primary contact to this deal';
            break;
          case 'low_probability':
            suggestedAction = 'Re-qualify or consider moving to lost';
            break;
        }

        results.push({
          id: deal.id,
          name: deal.name,
          amount: deal.amount,
          stage: deal.stage,
          closeDate: deal.close_date || deal.expected_close_date,
          riskScore,
          riskLevel,
          factors,
          suggestedAction
        });
      }
    }

    // Sort by risk score descending
    return results.sort((a, b) => b.riskScore - a.riskScore);
  }, [deals, activities]);

  // Summary stats
  const summary = useMemo(() => ({
    total: atRiskDeals.length,
    critical: atRiskDeals.filter(d => d.riskLevel === 'critical').length,
    high: atRiskDeals.filter(d => d.riskLevel === 'high').length,
    medium: atRiskDeals.filter(d => d.riskLevel === 'medium').length,
    low: atRiskDeals.filter(d => d.riskLevel === 'low').length,
    totalValueAtRisk: atRiskDeals.reduce((sum, d) => sum + (d.amount || 0), 0)
  }), [atRiskDeals]);

  // Get risk info for a specific deal
  const getRiskForDeal = (dealId: string): AtRiskDeal | null => {
    return atRiskDeals.find(d => d.id === dealId) || null;
  };

  return {
    atRiskDeals,
    summary,
    getRiskForDeal
  };
}
