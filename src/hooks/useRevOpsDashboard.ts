import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { revopsAnalyticsService, DataQualityMetrics, PipelineHealth, LeadScore } from '@/services/revopsAnalyticsService';
import { useUnifiedCRMStore } from '@/stores/unifiedCRMStore';
import { useAnalyticsSync } from '@/hooks/useAnalyticsSync';
import { logDebug } from '@/lib/logger';

interface RevOpsDashboardState {
  dataQuality: DataQualityMetrics | null;
  pipelineHealth: PipelineHealth | null;
  leadScores: LeadScore[];
  insights: {
    lead_quality_trend: 'improving' | 'declining' | 'stable';
    pipeline_health_trend: 'healthy' | 'at_risk' | 'critical';
    data_quality_priority: Array<{
      area: string;
      priority: 'high' | 'medium' | 'low';
      impact: string;
      estimated_effort: 'low' | 'medium' | 'high';
    }>;
    recommended_actions: Array<{
      action: string;
      category: 'lead_scoring' | 'data_quality' | 'pipeline_management';
      urgency: 'immediate' | 'this_week' | 'this_month';
      expected_impact: 'high' | 'medium' | 'low';
    }>;
  } | null;
  loading: {
    dataQuality: boolean;
    pipelineHealth: boolean;
    leadScores: boolean;
    insights: boolean;
  };
  error: string | null;
  lastUpdated: Date | null;
}

interface UseRevOpsDashboardReturn extends RevOpsDashboardState {
  refreshAll: () => Promise<void>;
  refreshDataQuality: () => Promise<void>;
  refreshPipelineHealth: () => Promise<void>;
  refreshLeadScores: () => Promise<void>;
  refreshInsights: () => Promise<void>;
  calculateLeadScore: (contactId: string) => Promise<void>;
  isInitialLoading: boolean;
  hasData: boolean;
  // Unified store counts (for consistent display)
  storeCounts: {
    contacts: number | null;
    deals: number | null;
    accounts: number | null;
    activities: number | null;
    tasks: number | null;
  };
}

export const useRevOpsDashboard = (): UseRevOpsDashboardReturn => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  // Get total counts from unified store
  const totalCounts = useUnifiedCRMStore((s) => s.totalCounts);

  // State management
  const [state, setState] = useState<RevOpsDashboardState>({
    dataQuality: null,
    pipelineHealth: null,
    leadScores: [],
    insights: null,
    loading: {
      dataQuality: false,
      pipelineHealth: false,
      leadScores: false,
      insights: false,
    },
    error: null,
    lastUpdated: null,
  });

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();

  // Helper to update loading state
  const setLoading = useCallback((key: keyof RevOpsDashboardState['loading'], value: boolean) => {
    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, [key]: value }
    }));
  }, []);

  // Helper to set error
  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  // Data Quality Analysis
  const refreshDataQuality = useCallback(async () => {
    if (!organizationId) return;

    setLoading('dataQuality', true);
    setError(null);

    try {
      const dataQuality = await revopsAnalyticsService.analyzeDataQuality(organizationId);
      setState(prev => ({
        ...prev,
        dataQuality,
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.error('Failed to refresh data quality', error);
      setError('Failed to analyze data quality');
    } finally {
      setLoading('dataQuality', false);
    }
  }, [organizationId, setLoading, setError]);

  // Pipeline Health Analysis
  const refreshPipelineHealth = useCallback(async () => {
    if (!organizationId) return;

    setLoading('pipelineHealth', true);
    setError(null);

    try {
      const pipelineHealth = await revopsAnalyticsService.getPipelineHealth(organizationId);
      setState(prev => ({
        ...prev,
        pipelineHealth,
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.error('Failed to refresh pipeline health', error);
      setError('Failed to analyze pipeline health');
    } finally {
      setLoading('pipelineHealth', false);
    }
  }, [organizationId, setLoading, setError]);

  // Lead Scores
  const refreshLeadScores = useCallback(async (grade?: string) => {
    if (!organizationId) return;

    setLoading('leadScores', true);
    setError(null);

    try {
      const leadScores = await revopsAnalyticsService.getLeadScores(organizationId, grade);
      setState(prev => ({
        ...prev,
        leadScores,
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.error('Failed to refresh lead scores', error);
      setError('Failed to fetch lead scores');
    } finally {
      setLoading('leadScores', false);
    }
  }, [organizationId, setLoading, setError]);

  // Insights Generation
  const refreshInsights = useCallback(async () => {
    if (!organizationId) return;

    setLoading('insights', true);
    setError(null);

    try {
      const insights = await revopsAnalyticsService.getRevOpsInsights(organizationId);
      setState(prev => ({
        ...prev,
        insights,
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.error('Failed to refresh insights', error);
      setError('Failed to generate insights');
    } finally {
      setLoading('insights', false);
    }
  }, [organizationId, setLoading, setError]);

  // Individual Lead Score Calculation
  const calculateLeadScore = useCallback(async (contactId: string) => {
    if (!organizationId) return;

    try {
      await revopsAnalyticsService.calculateLeadScore(contactId, organizationId);
      
      // Refresh lead scores to get updated data
      await refreshLeadScores();
      
      console.log('Lead score calculated and refreshed', { contactId, organizationId });
    } catch (error) {
      console.error('Failed to calculate lead score', error);
      throw error;
    }
  }, [organizationId, refreshLeadScores]);

  // Refresh All Data
  const refreshAll = useCallback(async () => {
    if (!organizationId) return;

    setError(null);
    
    try {
      // Parallel execution for better performance
      await Promise.allSettled([
        refreshDataQuality(),
        refreshPipelineHealth(),
        refreshLeadScores(),
      ]);

      // Generate insights after core data is loaded
      await refreshInsights();

      console.log('RevOps dashboard refreshed', { organizationId });
    } catch (error) {
      console.error('Failed to refresh RevOps dashboard', error);
      setError('Failed to refresh dashboard data');
    }
  }, [organizationId, refreshDataQuality, refreshPipelineHealth, refreshLeadScores, refreshInsights, setError]);

  // Subscribe to analytics invalidation events (debounced)
  const handleAnalyticsInvalidation = useCallback((invalidatedTypes: Set<string>) => {
    logDebug('[RevOpsDashboard] Analytics invalidation received', {
      types: Array.from(invalidatedTypes),
    });

    // Refresh relevant analytics based on which entity types changed
    if (invalidatedTypes.has('deals')) {
      refreshPipelineHealth();
    }
    if (invalidatedTypes.has('contacts') || invalidatedTypes.has('deals') || invalidatedTypes.has('accounts')) {
      refreshDataQuality();
    }
  }, [refreshPipelineHealth, refreshDataQuality]);

  useAnalyticsSync(handleAnalyticsInvalidation, 1500);

  // Auto-refresh mechanism
  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Auto-refresh every 5 minutes for pipeline health (most critical)
    refreshTimeoutRef.current = setTimeout(() => {
      if (organizationId) {
        refreshPipelineHealth();
        
        // Less frequent refresh for data quality and lead scores
        const now = new Date();
        const lastUpdate = state.lastUpdated;
        
        if (!lastUpdate || (now.getTime() - lastUpdate.getTime()) > 15 * 60 * 1000) {
          refreshDataQuality();
          refreshLeadScores();
          refreshInsights();
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }, [organizationId, refreshPipelineHealth, refreshDataQuality, refreshLeadScores, refreshInsights, state.lastUpdated]);

  // Initial load effect
  useEffect(() => {
    if (organizationId && user && isInitialLoading) {
      console.log('Initializing RevOps dashboard', { organizationId });
      
      refreshAll()
        .finally(() => {
          setIsInitialLoading(false);
          scheduleRefresh();
        });
    }

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [organizationId, user, isInitialLoading, refreshAll, scheduleRefresh]);

  // Schedule refresh when component is active
  useEffect(() => {
    if (!isInitialLoading && organizationId) {
      scheduleRefresh();
    }
  }, [isInitialLoading, organizationId, scheduleRefresh]);

  // Computed properties
  const hasData = !!(state.dataQuality || state.pipelineHealth || state.leadScores.length > 0);

  const isAnyLoading = Object.values(state.loading).some(loading => loading);

  // Memoized store counts for external consumption
  const storeCounts = useMemo(() => ({
    contacts: totalCounts.contacts,
    deals: totalCounts.deals,
    accounts: totalCounts.accounts,
    activities: totalCounts.activities,
    tasks: totalCounts.tasks,
  }), [totalCounts]);

  return {
    ...state,
    refreshAll,
    refreshDataQuality,
    refreshPipelineHealth,
    refreshLeadScores,
    refreshInsights,
    calculateLeadScore,
    isInitialLoading: isInitialLoading || isAnyLoading,
    hasData,
    storeCounts,
  };
};
