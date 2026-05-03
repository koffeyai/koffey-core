import { supabase } from '@/integrations/supabase/client';

export interface AnalyticsData {
  totalContacts: number;
  totalDeals: number;
  totalRevenue: number;
  avgDealSize: number;
  winRate: number;
  recentActivity: number;
  monthlyTrends: Array<{
    month: string;
    revenue: number;
    deals: number;
    contacts: number;
  }>;
  dealsByStage: Array<{
    stage: string;
    count: number;
    value: number;
  }>;
  topPerformers: Array<{
    name: string;
    deals: number;
    revenue: number;
    conversion: number;
  }>;
  performanceMetrics: {
    customerSatisfaction: number;
    monthlyRevenue: string;
    activeDealsPipeline: number;
    totalActivities: number;
  };
  trends: {
    contacts: number;
    deals: number;
    revenue: number;
    activities: number;
  };
}

class AnalyticsDataService {
  private isDemoOrganization(org: any): boolean {
    if (!org) return false;
    
    // Check explicit demo flag
    if (org.is_demo === true) return true;
    
    // Check name patterns for demo organizations
    const demoPatterns = ['demo', 'sample', 'test', 'example'];
    const orgName = org.name?.toLowerCase() || '';
    return demoPatterns.some(pattern => orgName.includes(pattern));
  }

  private generateDemoData(): AnalyticsData {
    // Consistent demo data based on a RevOps company scenario
    const baseDate = new Date();
    const monthlyTrends = [];
    
    // Generate 6 months of progressive growth data
    for (let i = 5; i >= 0; i--) {
      const month = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      // Progressive growth with some realistic variation
      const baseRevenue = 45000 + (5 - i) * 8000;
      const variation = (Math.sin(i) * 0.1 + 1); // ±10% variation
      
      monthlyTrends.push({
        month: monthName,
        revenue: Math.floor(baseRevenue * variation),
        deals: Math.floor((12 + (5 - i) * 2) * variation),
        contacts: Math.floor((85 + (5 - i) * 15) * variation)
      });
    }

    return {
      totalContacts: 247,
      totalDeals: 89,
      totalRevenue: 425000,
      avgDealSize: 4775,
      winRate: 68,
      recentActivity: 34,
      monthlyTrends,
      dealsByStage: [
        { stage: 'Prospecting', count: 24, value: 120000 },
        { stage: 'Qualification', count: 18, value: 95000 },
        { stage: 'Proposal', count: 12, value: 75000 },
        { stage: 'Negotiation', count: 8, value: 85000 },
        { stage: 'Closed Won', count: 15, value: 135000 },
        { stage: 'Closed Lost', count: 12, value: 0 }
      ],
      topPerformers: [
        { name: 'Sarah Chen', deals: 23, revenue: 145000, conversion: 74 },
        { name: 'Marcus Rodriguez', deals: 19, revenue: 128000, conversion: 68 },
        { name: 'Emily Johnson', deals: 17, revenue: 98000, conversion: 71 },
        { name: 'David Kim', deals: 15, revenue: 87000, conversion: 65 },
        { name: 'Lisa Thompson', deals: 13, revenue: 76000, conversion: 69 }
      ],
      performanceMetrics: {
        customerSatisfaction: 92,
        monthlyRevenue: '$87K',
        activeDealsPipeline: 62,
        totalActivities: 234
      },
      trends: {
        contacts: 12,
        deals: 8,
        revenue: 15,
        activities: -2
      }
    };
  }

  private async calculateRealData(organizationIds: string[]): Promise<AnalyticsData> {
    try {
      // Fetch actual data from database
      const [contactsResult, dealsResult, activitiesResult] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, created_at')
          .in('organization_id', organizationIds),
        supabase
          .from('deals')
          .select('id, amount, stage, created_at, close_date')
          .in('organization_id', organizationIds),
        supabase
          .from('activities')
          .select('id, created_at')
          .in('organization_id', organizationIds)
      ]);

      const contacts = contactsResult.data || [];
      const deals = dealsResult.data || [];
      const activities = activitiesResult.data || [];

      // Calculate metrics
      const totalRevenue = deals
        .filter(deal => deal.stage === 'Closed Won')
        .reduce((sum, deal) => sum + (deal.amount || 0), 0);

      const wonDeals = deals.filter(deal => deal.stage === 'Closed Won').length;
      const totalDeals = deals.length;
      const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
      const avgDealSize = wonDeals > 0 ? Math.round(totalRevenue / wonDeals) : 0;

      // Recent activity (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentActivity = activities.filter(
        activity => new Date(activity.created_at) > weekAgo
      ).length;

      // Generate monthly trends from actual data
      const monthlyTrends = this.generateMonthlyTrends(deals, contacts);

      // Group deals by stage
      const dealsByStage = this.groupDealsByStage(deals);

      // For real organizations, we'll use placeholder data for top performers
      // since we don't have sales rep data in the current schema
      const topPerformers = totalDeals > 0 ? [
        { name: 'Sales Team Member', deals: totalDeals, revenue: totalRevenue, conversion: winRate }
      ] : [];

      return {
        totalContacts: contacts.length,
        totalDeals: totalDeals,
        totalRevenue,
        avgDealSize,
        winRate,
        recentActivity,
        monthlyTrends,
        dealsByStage,
        topPerformers,
        performanceMetrics: {
          customerSatisfaction: winRate, // Use win rate as proxy
          monthlyRevenue: totalRevenue > 0 ? `$${Math.round(totalRevenue / 1000)}K` : '$0',
          activeDealsPipeline: deals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.stage)).length,
          totalActivities: activities.length
        },
        trends: {
          contacts: this.calculateTrend(contacts, 'created_at'),
          deals: this.calculateTrend(deals, 'created_at'),
          revenue: winRate > 0 ? Math.min(winRate - 50, 20) : 0, // Simplified trend calculation
          activities: this.calculateTrend(activities, 'created_at')
        }
      };
    } catch (error) {
      console.error('Error calculating real analytics data:', error);
      return this.getEmptyStateData();
    }
  }

  private generateMonthlyTrends(deals: any[], contacts: any[]) {
    const trends = [];
    const baseDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const month = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const nextMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() - i + 1, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const monthDeals = deals.filter(deal => {
        const dealDate = new Date(deal.created_at);
        return dealDate >= month && dealDate < nextMonth;
      });

      const monthContacts = contacts.filter(contact => {
        const contactDate = new Date(contact.created_at);
        return contactDate >= month && contactDate < nextMonth;
      });

      const monthRevenue = monthDeals
        .filter(deal => deal.stage === 'Closed Won')
        .reduce((sum, deal) => sum + (deal.amount || 0), 0);

      trends.push({
        month: monthName,
        revenue: monthRevenue,
        deals: monthDeals.length,
        contacts: monthContacts.length
      });
    }

    return trends;
  }

  private groupDealsByStage(deals: any[]) {
    const stages = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
    
    return stages.map(stage => {
      const stageDeals = deals.filter(deal => deal.stage === stage);
      const value = stageDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
      
      return {
        stage,
        count: stageDeals.length,
        value
      };
    });
  }

  private calculateTrend(items: any[], dateField: string): number {
    if (items.length === 0) return 0;

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());

    const currentCount = items.filter(item => new Date(item[dateField]) > lastMonth).length;
    const previousCount = items.filter(item => {
      const date = new Date(item[dateField]);
      return date > twoMonthsAgo && date <= lastMonth;
    }).length;

    if (previousCount === 0) return currentCount > 0 ? 100 : 0;
    return Math.round(((currentCount - previousCount) / previousCount) * 100);
  }

  private getEmptyStateData(): AnalyticsData {
    const emptyTrends = Array.from({ length: 6 }, (_, i) => {
      const month = new Date();
      month.setMonth(month.getMonth() - (5 - i));
      return {
        month: month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        revenue: 0,
        deals: 0,
        contacts: 0
      };
    });

    return {
      totalContacts: 0,
      totalDeals: 0,
      totalRevenue: 0,
      avgDealSize: 0,
      winRate: 0,
      recentActivity: 0,
      monthlyTrends: emptyTrends,
      dealsByStage: [
        { stage: 'Prospecting', count: 0, value: 0 },
        { stage: 'Qualification', count: 0, value: 0 },
        { stage: 'Proposal', count: 0, value: 0 },
        { stage: 'Negotiation', count: 0, value: 0 },
        { stage: 'Closed Won', count: 0, value: 0 },
        { stage: 'Closed Lost', count: 0, value: 0 }
      ],
      topPerformers: [],
      performanceMetrics: {
        customerSatisfaction: 0,
        monthlyRevenue: '$0',
        activeDealsPipeline: 0,
        totalActivities: 0
      },
      trends: {
        contacts: 0,
        deals: 0,
        revenue: 0,
        activities: 0
      }
    };
  }

  async getAnalyticsData(organizationIds: string[], currentOrganization: any): Promise<AnalyticsData> {
    // Check if this is a demo organization
    if (this.isDemoOrganization(currentOrganization)) {
      return this.generateDemoData();
    }

    // For real organizations, calculate from actual data
    return this.calculateRealData(organizationIds);
  }
}

export const analyticsDataService = new AnalyticsDataService();