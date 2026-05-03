import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkflowOptimizationService } from '@/services/workflowOptimizationService';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { supabase } from '@/integrations/supabase/client';

type CRMEntityType = 'contacts' | 'deals' | 'accounts' | 'tasks' | 'activities';

interface UseWorkflowOptimizationProps {
  entityType: CRMEntityType;
  userId?: string;
  enabled?: boolean;
}

interface ProactiveRecommendation {
  shouldIntervene: boolean;
  intervention: 'suggestion' | 'assistance' | 'simplification';
  message: string;
  confidence: number;
}

export const useWorkflowOptimization = ({
  entityType,
  userId,
  enabled = true
}: UseWorkflowOptimizationProps) => {
  const { organizationId } = useOrganizationAccess();
  const [optimization, setOptimization] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currentField, setCurrentField] = useState<string>('');
  const [formProgress, setFormProgress] = useState(0);
  const [proactiveRecommendation, setProactiveRecommendation] = useState<ProactiveRecommendation | null>(null);
  
  // Track form interaction metrics
  const startTimeRef = useRef<number>(Date.now());
  const fieldTimingsRef = useRef<Record<string, number>>({});
  const errorsRef = useRef<string[]>([]);
  const assistanceUsedRef = useRef(false);
  const fieldOrderRef = useRef<string[]>([]);

  // Load workflow optimization data
  const loadOptimization = useCallback(async (formData: any = {}) => {
    if (!enabled || !userId || !organizationId) return;

    try {
      setLoading(true);
      const data = await WorkflowOptimizationService.getWorkflowOptimization(
        userId,
        entityType,
        organizationId,
        formData
      );
      setOptimization(data);
    } catch (error) {
      console.error('Error loading workflow optimization:', error);
    } finally {
      setLoading(false);
    }
  }, [entityType, userId, organizationId, enabled]);

  // Track field focus/change
  const trackFieldInteraction = useCallback((field: string, value: any) => {
    if (!enabled || !userId) return;

    setCurrentField(field);
    
    // Record field timing
    const now = Date.now();
    if (fieldTimingsRef.current[field]) {
      const timeSpent = now - fieldTimingsRef.current[field];
      if (timeSpent > 30000) { // More than 30 seconds indicates potential struggle
        errorsRef.current.push(field);
      }
    }
    fieldTimingsRef.current[field] = now;

    // Track field order
    if (!fieldOrderRef.current.includes(field)) {
      fieldOrderRef.current.push(field);
    }
  }, [enabled, userId]);

  // Calculate and update form progress
  const updateFormProgress = useCallback((formData: any, totalFields: number) => {
    const completedFields = Object.keys(formData).filter(key => 
      formData[key] && formData[key] !== '' && formData[key] !== null
    ).length;
    
    const progress = totalFields > 0 ? completedFields / totalFields : 0;
    setFormProgress(progress);

    // Check for proactive recommendations
    if (currentField && userId) {
      WorkflowOptimizationService.generateProactiveRecommendations(
        userId,
        entityType,
        currentField,
        progress
      ).then(setProactiveRecommendation);
    }
  }, [currentField, userId, entityType]);

  // Track form validation errors
  const trackValidationError = useCallback((field: string, error: string) => {
    if (!enabled) return;
    
    errorsRef.current.push(field);
    
    // Log specific error types for pattern analysis
    WorkflowOptimizationService.trackFormInteraction({
      entityType,
      userId: userId || '',
      organizationId: organizationId || '',
      errorCount: 1,
      fieldCompletionOrder: [field],
      timestamp: Date.now()
    });
  }, [enabled, entityType, userId, organizationId]);

  // Track assistance usage
  const trackAssistanceUsed = useCallback((assistanceType: string) => {
    assistanceUsedRef.current = true;
    
    // Log assistance usage
    if (enabled && userId && organizationId) {
      WorkflowOptimizationService.trackFormInteraction({
        entityType,
        userId,
        organizationId: organizationId,
        assistanceUsed: true,
        conversationsStarted: assistanceType === 'chat' ? 1 : 0,
        predictionsAccepted: assistanceType === 'prediction' ? 1 : 0,
        timestamp: Date.now()
      });
    }
  }, [enabled, entityType, userId, organizationId]);

  // Complete form tracking
  const completeFormTracking = useCallback((abandoned = false) => {
    if (!enabled || !userId || !organizationId) return;

    const completionTime = Date.now() - startTimeRef.current;
    const abandonmentRate = abandoned ? 1 : 0;

    WorkflowOptimizationService.trackFormInteraction({
      entityType,
      userId,
      organizationId: organizationId,
      completionTime,
      abandonmentRate,
      errorCount: errorsRef.current.length,
      assistanceUsed: assistanceUsedRef.current,
      fieldCompletionOrder: fieldOrderRef.current,
      timestamp: Date.now()
    });

    // Reset tracking refs
    startTimeRef.current = Date.now();
    fieldTimingsRef.current = {};
    errorsRef.current = [];
    assistanceUsedRef.current = false;
    fieldOrderRef.current = [];
  }, [enabled, entityType, userId, organizationId]);

  // Get optimized field order
  const getOptimizedFieldOrder = useCallback((defaultOrder: string[]) => {
    if (!optimization?.suggestedFieldOrder) return defaultOrder;
    
    // Merge suggested order with any missing fields from default
    const optimized = [...optimization.suggestedFieldOrder];
    defaultOrder.forEach(field => {
      if (!optimized.includes(field)) {
        optimized.push(field);
      }
    });
    
    return optimized;
  }, [optimization?.suggestedFieldOrder]);

  // Check if field needs proactive assistance
  const shouldShowAssistance = useCallback((field: string) => {
    return optimization?.proactiveAssistanceFields?.includes(field) || false;
  }, [optimization?.proactiveAssistanceFields]);

  // Get simplification suggestions for field
  const getFieldSuggestion = useCallback((field: string) => {
    return optimization?.simplificationOpportunities?.find(opp => opp.field === field);
  }, [optimization?.simplificationOpportunities]);

  // Dismiss proactive recommendation
  const dismissRecommendation = useCallback(() => {
    setProactiveRecommendation(null);
  }, []);

  // Accept proactive recommendation
  const acceptRecommendation = useCallback(() => {
    if (proactiveRecommendation) {
      trackAssistanceUsed('proactive');
      setProactiveRecommendation(null);
    }
  }, [proactiveRecommendation, trackAssistanceUsed]);

  // Load optimization when component mounts or dependencies change
  useEffect(() => {
    loadOptimization();
  }, [loadOptimization]);

  // Auto-dismiss recommendations after 30 seconds
  useEffect(() => {
    if (proactiveRecommendation) {
      const timer = setTimeout(() => {
        setProactiveRecommendation(null);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [proactiveRecommendation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (formProgress > 0 && formProgress < 1) {
        completeFormTracking(true); // Mark as abandoned
      }
    };
  }, [formProgress, completeFormTracking]);

  return {
    // Optimization data
    optimization,
    loading,
    
    // Field optimization
    getOptimizedFieldOrder,
    shouldShowAssistance,
    getFieldSuggestion,
    
    // Progress tracking
    formProgress,
    currentField,
    updateFormProgress,
    
    // Interaction tracking
    trackFieldInteraction,
    trackValidationError,
    trackAssistanceUsed,
    completeFormTracking,
    
    // Proactive recommendations
    proactiveRecommendation,
    dismissRecommendation,
    acceptRecommendation,
    
    // Computed values
    predictedCompletionTime: optimization?.predictedCompletionTime || 0,
    riskFactors: optimization?.riskFactors || [],
    hasHighRisk: optimization?.riskFactors?.some((risk: any) => risk.probability > 0.7) || false
  };
};