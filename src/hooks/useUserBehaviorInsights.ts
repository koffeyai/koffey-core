/**
 * React hook for accessing behavioral insights from the behaviorTracker
 * Connects the behaviorTracker to React components for personalization
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { behaviorTracker, UserBehaviorMetrics, OperationContext } from '@/lib/behaviorTracker';
import { useAuth } from '@/components/auth/AuthProvider';

export interface BehaviorInsight {
  type: 'tip' | 'warning' | 'celebration';
  message: string;
  priority: number;
}

export interface WorkingPatterns {
  preferredBatchSize: number;
  averageVelocity: number;
  isInFlowState: boolean;
  commonModules: string[];
}

export function useUserBehaviorInsights() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<UserBehaviorMetrics | undefined>();
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Refresh metrics periodically
  useEffect(() => {
    if (!user?.id) return;

    const refreshMetrics = () => {
      const currentMetrics = behaviorTracker.getMetrics(user.id);
      setMetrics(currentMetrics);
      setLastUpdate(Date.now());
    };

    // Initial fetch
    refreshMetrics();

    // Refresh every 5 seconds
    const interval = setInterval(refreshMetrics, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Track an action and update local state
  const trackAction = useCallback((action: string, context: Partial<OperationContext>) => {
    if (!user?.id) return;
    
    behaviorTracker.trackAction(user.id, action, {
      module: context.module || 'general',
      action: action,
      ...context
    } as OperationContext);
    
    // Immediately refresh metrics
    setMetrics(behaviorTracker.getMetrics(user.id));
    setLastUpdate(Date.now());
  }, [user?.id]);

  // Track batch operation
  const trackBatchOperation = useCallback((batchSize: number) => {
    if (!user?.id) return;
    behaviorTracker.trackBatchOperation(user.id, batchSize);
  }, [user?.id]);

  // Get current frustration level
  const frustrationLevel = useMemo(() => {
    if (!user?.id) return 'low';
    return behaviorTracker.getFrustrationLevel(user.id);
  }, [user?.id, lastUpdate]);

  // Get action velocity
  const actionVelocity = useMemo(() => {
    if (!user?.id) return 0;
    return behaviorTracker.getActionVelocity(user.id);
  }, [user?.id, lastUpdate]);

  // Get contextual suggestion
  const currentSuggestion = useMemo(() => {
    if (!user?.id) return null;
    return behaviorTracker.getSuggestion(user.id);
  }, [user?.id, lastUpdate]);

  // Derive working patterns
  const workingPatterns = useMemo((): WorkingPatterns => {
    if (!metrics) {
      return {
        preferredBatchSize: 20,
        averageVelocity: 0,
        isInFlowState: false,
        commonModules: []
      };
    }

    const avgBatchSize = metrics.batchSizePreference.length > 0
      ? metrics.batchSizePreference.reduce((a, b) => a + b, 0) / metrics.batchSizePreference.length
      : 20;

    // User is in "flow state" if they have high velocity and low frustration
    const isInFlowState = metrics.actionVelocity > 5 && 
                          metrics.frustrationSignals < 2 &&
                          metrics.consecutiveActions > 5;

    // Get most common modules from context switches
    const moduleCount = new Map<string, number>();
    metrics.contextSwitchPoints.forEach(module => {
      moduleCount.set(module, (moduleCount.get(module) || 0) + 1);
    });
    const commonModules = Array.from(moduleCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([module]) => module);

    return {
      preferredBatchSize: Math.round(avgBatchSize),
      averageVelocity: metrics.actionVelocity,
      isInFlowState,
      commonModules
    };
  }, [metrics]);

  // Generate insights based on current behavior
  const insights = useMemo((): BehaviorInsight[] => {
    const result: BehaviorInsight[] = [];

    if (currentSuggestion) {
      result.push({
        type: 'tip',
        message: currentSuggestion,
        priority: 1
      });
    }

    if (frustrationLevel === 'high') {
      result.push({
        type: 'warning',
        message: "You seem to be encountering some friction. Need help?",
        priority: 2
      });
    }

    if (workingPatterns.isInFlowState) {
      result.push({
        type: 'celebration',
        message: "You're in the zone! Great productivity streak.",
        priority: 3
      });
    }

    if (actionVelocity > 8) {
      result.push({
        type: 'tip',
        message: "High activity detected. Consider using keyboard shortcuts for faster navigation.",
        priority: 4
      });
    }

    return result.sort((a, b) => a.priority - b.priority);
  }, [currentSuggestion, frustrationLevel, workingPatterns, actionVelocity]);

  // Get personalized suggestions based on behavior
  const getPersonalizedSuggestions = useCallback((
    baseSuggestions: Array<{ id: string; text: string; weight?: number }>
  ) => {
    if (!metrics || baseSuggestions.length === 0) return baseSuggestions;

    // Boost suggestions related to user's common modules
    return baseSuggestions.map(suggestion => {
      let boost = 0;
      
      // Check if suggestion relates to common modules
      workingPatterns.commonModules.forEach(module => {
        if (suggestion.text.toLowerCase().includes(module.toLowerCase())) {
          boost += 0.2;
        }
      });

      // Reduce priority if user is frustrated (simpler suggestions first)
      if (frustrationLevel === 'high' && suggestion.text.length > 50) {
        boost -= 0.3;
      }

      return {
        ...suggestion,
        weight: (suggestion.weight || 1) + boost
      };
    }).sort((a, b) => (b.weight || 1) - (a.weight || 1));
  }, [metrics, workingPatterns, frustrationLevel]);

  // Check if user should be shown advanced features
  const shouldShowAdvancedFeatures = useMemo(() => {
    if (!metrics) return false;
    // Show advanced features if user has done many actions
    return metrics.consecutiveActions > 10 || 
           metrics.batchSizePreference.length > 3;
  }, [metrics]);

  return {
    // Raw metrics
    metrics,
    
    // Derived values
    frustrationLevel,
    actionVelocity,
    workingPatterns,
    insights,
    currentSuggestion,
    shouldShowAdvancedFeatures,
    
    // Actions
    trackAction,
    trackBatchOperation,
    getPersonalizedSuggestions
  };
}
