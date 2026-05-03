import React, { useEffect, useState, useCallback } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  X,
  Lightbulb,
  Target
} from 'lucide-react';
import { useWorkflowOptimization } from '@/hooks/useWorkflowOptimization';
import { supabase } from '@/integrations/supabase/client';
import { launchChatWith } from '@/stores/unifiedChatStore';

type CRMEntityType = 'contacts' | 'deals' | 'accounts' | 'tasks' | 'activities';

interface OptimizedFormWrapperProps {
  entityType: CRMEntityType;
  children: React.ReactNode;
  formData: any;
  onFieldChange: (field: string, value: any) => void;
  className?: string;
  totalFields?: number;
}

export const OptimizedFormWrapper: React.FC<OptimizedFormWrapperProps> = ({
  entityType,
  children,
  formData,
  onFieldChange,
  className = "",
  totalFields = 6
}) => {
  const [userId, setUserId] = useState<string>('');
  
  const {
    optimization,
    loading,
    formProgress,
    updateFormProgress,
    trackFieldInteraction,
    trackValidationError,
    trackAssistanceUsed,
    completeFormTracking,
    proactiveRecommendation,
    dismissRecommendation,
    acceptRecommendation,
    getOptimizedFieldOrder,
    shouldShowAssistance,
    getFieldSuggestion,
    predictedCompletionTime,
    riskFactors,
    hasHighRisk
  } = useWorkflowOptimization({
    entityType,
    userId,
    enabled: !!userId
  });

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Update form progress when formData changes
  useEffect(() => {
    updateFormProgress(formData, totalFields);
  }, [formData, totalFields, updateFormProgress]);

  // Handle proactive recommendation acceptance
  const handleAcceptRecommendation = useCallback(() => {
    if (proactiveRecommendation) {
      acceptRecommendation();
      
      if (proactiveRecommendation.intervention === 'assistance') {
        trackAssistanceUsed('proactive');
        launchChatWith(proactiveRecommendation.message, {
          type: 'proactive_assistance',
          entityType,
          currentField: Object.keys(formData).pop(),
          formProgress,
          riskFactors
        });
      }
    }
  }, [proactiveRecommendation, acceptRecommendation, trackAssistanceUsed, entityType, formData, formProgress, riskFactors]);

  // Enhanced field change handler with tracking
  const handleFieldChange = useCallback((field: string, value: any) => {
    trackFieldInteraction(field, value);
    onFieldChange(field, value);
  }, [trackFieldInteraction, onFieldChange]);

  // Format completion time
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Workflow Optimization Header */}
      {optimization && !loading && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Smart Form Assistant</CardTitle>
              </div>
              <div className="flex items-center space-x-4">
                {predictedCompletionTime > 0 && (
                  <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatTime(predictedCompletionTime)} remaining</span>
                  </div>
                )}
                <div className="flex items-center space-x-1">
                  <Progress value={formProgress * 100} className="w-20" />
                  <span className="text-sm font-medium">{Math.round(formProgress * 100)}%</span>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Optimization Insights */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1">
                  <Target className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Optimized Order</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Form fields reordered for your workflow preferences
                </p>
              </div>

              {/* Risk Assessment */}
              {hasHighRisk && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-1">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Attention Needed</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {riskFactors.length} potential issues detected
                  </p>
                </div>
              )}

              {/* AI Assistance Available */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">AI Help Ready</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Intelligent suggestions and guidance available
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proactive Recommendations */}
      {proactiveRecommendation && (
        <Alert className="border-blue-200 bg-blue-50">
          <Brain className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-medium mb-1">Smart Suggestion</p>
              <p className="text-sm">{proactiveRecommendation.message}</p>
              <div className="flex items-center space-x-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {Math.round(proactiveRecommendation.confidence * 100)}% confidence
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {proactiveRecommendation.intervention}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              <Button 
                size="sm" 
                onClick={handleAcceptRecommendation}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Accept
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={dismissRecommendation}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Risk Factor Alerts */}
      {riskFactors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {riskFactors.slice(0, 2).map((risk: any, index: number) => (
            <Alert key={index} variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <span className="font-medium capitalize">{risk.type}</span> risk: {Math.round(risk.probability * 100)}%
                {risk.triggerField && (
                  <span className="ml-2 text-xs">({risk.triggerField})</span>
                )}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Form Content with Enhanced Tracking */}
      <div className="relative">
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, {
              ...child.props,
              onFieldChange: handleFieldChange,
              trackValidationError,
              shouldShowAssistance,
              getFieldSuggestion,
              getOptimizedFieldOrder
            } as any);
          }
          return child;
        })}
      </div>

      {/* Form Completion Celebration */}
      {formProgress >= 1 && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-green-800">Form Complete!</p>
                <p className="text-sm text-green-700">
                  All required fields have been filled. Ready to submit.
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};