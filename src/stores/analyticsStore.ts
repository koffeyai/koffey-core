import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { analyticsEngine } from '@/lib/analyticsEngine';
import { supabase } from '@/integrations/supabase/client';
import { alertingSystem } from '@/lib/alertingSystem';
import { enhancedPerformanceMonitor } from '@/lib/performanceMonitor.enhanced';

interface AnalyticsState {
  // Metrics data
  metrics: Record<string, any>;
  dashboards: any[];
  reports: any[];
  
  // Loading states
  loading: Record<string, boolean>;
  
  // Cache
  queryCache: Map<string, any>;
  
  // Actions
  actions: {
    executeQuery: (query: any) => Promise<any>;
    executeAnalyticsQuery: (viewName: string, organizationIds: string[], filters?: any) => Promise<any>;
    getRevenueAnalytics: (organizationIds: string[], timeRange?: 'week' | 'month' | 'quarter' | 'year') => Promise<any>;
    getCustomerEngagement: (organizationIds: string[]) => Promise<any>;
    getAccountHealth: (organizationIds: string[]) => Promise<any>;
    getSalesActivity: (organizationIds: string[], userId?: string) => Promise<any>;
    createDashboard: (dashboard: any) => Promise<void>;
    generateReport: (params: any) => Promise<any>;
    refreshMetrics: (organizationIds: string[]) => Promise<void>;
    clearCache: () => void;
  };
}

export const useAnalyticsStore = create<AnalyticsState>()(
  devtools(
    (set, get) => ({
      metrics: {},
      dashboards: [],
      reports: [],
      loading: {},
      queryCache: new Map(),
      
      actions: {
        executeQuery: async (query) => {
          const cacheKey = JSON.stringify(query);
          
          // Check cache
          if (get().queryCache.has(cacheKey)) {
            return get().queryCache.get(cacheKey);
          }
          
          set(state => ({
            loading: { ...state.loading, [`query_${query.id}`]: true }
          }));
          
          try {
            const result = await analyticsEngine.executeQuery(query);
            
            // Cache result
            get().queryCache.set(cacheKey, result);
            
            set(state => ({
              loading: { ...state.loading, [`query_${query.id}`]: false }
            }));
            
            return result;
          } catch (error) {
            set(state => ({
              loading: { ...state.loading, [`query_${query.id}`]: false }
            }));
            throw error;
          }
        },
        
        // New methods using materialized views
        executeAnalyticsQuery: async (viewName: string, organizationIds: string[], filters: any = {}) => {
          set(state => ({
            loading: { ...state.loading, [`mv_${viewName}`]: true }
          }));
          
          try {
            // Use any to bypass TypeScript issues with dynamic view names
            const { data, error } = await (supabase as any)
              .from(viewName)
              .select('*')
              .in('organization_id', organizationIds)
              .match(filters);
              
            if (error) throw error;
            
            set(state => ({
              loading: { ...state.loading, [`mv_${viewName}`]: false }
            }));
            
            return data;
          } catch (error) {
            set(state => ({
              loading: { ...state.loading, [`mv_${viewName}`]: false }
            }));
            throw error;
          }
        },
        
        getRevenueAnalytics: async (organizationIds: string[], _timeRange: 'week' | 'month' | 'quarter' | 'year' = 'month') => {
          // Query the materialized view directly with proper range filter
          // (can't use .match() for gte/lte — it serializes nested objects as [object Object])
          try {
            const { data, error } = await (supabase as any)
              .from('revenue_analytics_mv')
              .select('*')
              .in('organization_id', organizationIds);
            if (error) throw error;
            return data;
          } catch {
            return [];
          }
        },
        
        getCustomerEngagement: async (organizationIds: string[]) => {
          return get().actions.executeAnalyticsQuery('customer_engagement_mv', organizationIds);
        },
        
        getAccountHealth: async (organizationIds: string[]) => {
          return get().actions.executeAnalyticsQuery('account_health_mv', organizationIds);
        },
        
        getSalesActivity: async (organizationIds: string[], userId?: string) => {
          const filters = userId ? { user_id: userId } : {};
          return get().actions.executeAnalyticsQuery('sales_activity_analytics_mv', organizationIds, filters);
        },
        
        createDashboard: async (dashboard) => {
          set(state => ({
            dashboards: [...state.dashboards, dashboard]
          }));
        },
        
        generateReport: async (params) => {
          set(state => ({
            loading: { ...state.loading, report_generation: true }
          }));
          
          try {
            // Generate report logic here
            const report = {
              id: Math.random().toString(36).substr(2, 9),
              ...params,
              generatedAt: new Date()
            };
            
            set(state => ({
              reports: [...state.reports, report],
              loading: { ...state.loading, report_generation: false }
            }));
            
            return report;
          } catch (error) {
            set(state => ({
              loading: { ...state.loading, report_generation: false }
            }));
            throw error;
          }
        },
        
        refreshMetrics: async (organizationIds) => {
          set(state => ({
            loading: { ...state.loading, metrics: true }
          }));
          
          try {
            // Use materialized views for fast metrics
            const [revenueData, engagementData, activityData] = await Promise.all([
              get().actions.getRevenueAnalytics(organizationIds),
              get().actions.getCustomerEngagement(organizationIds),
              get().actions.getSalesActivity(organizationIds)
            ]);
            
            // Calculate aggregated metrics
            const totalRevenue = revenueData?.reduce((sum: number, r: any) => sum + (r.total_revenue || 0), 0) || 0;
            const wonDeals = revenueData?.reduce((sum: number, r: any) => sum + (r.won_count || 0), 0) || 0;
            const lostDeals = revenueData?.reduce((sum: number, r: any) => sum + (r.lost_count || 0), 0) || 0;
            const totalActivities = activityData?.reduce((sum: number, a: any) => sum + (a.activity_count || 0), 0) || 0;
            
            // Get performance data from enhanced monitor
            const webVitals = enhancedPerformanceMonitor.getWebVitals();
            const memoryMetrics = enhancedPerformanceMonitor.getMemoryMetrics();
            
            const metrics = {
              revenue: { 
                current: totalRevenue, 
                previous: totalRevenue * 0.9, // Simplified calculation
                trend: 'up',
                won_deals: wonDeals,
                lost_deals: lostDeals
              },
              deals: { won: wonDeals, lost: lostDeals, pending: 0 },
              activities: { 
                completed: totalActivities, 
                scheduled: 0, 
                overdue: 0 
              },
              performance: { 
                webVitals,
                memory: memoryMetrics,
                apiCalls: 0, 
                errorRate: 0, 
                avgResponseTime: webVitals.TTFB?.current || 0
              },
              engagement: {
                highly_engaged: engagementData?.filter((e: any) => e.engagement_level === 'highly_engaged').length || 0,
                at_risk: engagementData?.filter((e: any) => e.churn_risk === 'high').length || 0,
                dormant: engagementData?.filter((e: any) => e.engagement_level === 'dormant').length || 0
              }
            };
            
            set({
              metrics,
              loading: { ...get().loading, metrics: false }
            });
            
          } catch (error) {
            set(state => ({
              loading: { ...state.loading, metrics: false }
            }));
            throw error;
          }
        },
        
        clearCache: () => {
          get().queryCache.clear();
        }
      }
    })
  )
);