import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageCircle, 
  CheckCircle, 
  Clock, 
  Lightbulb, 
  Heart,
  ArrowRight,
  Save,
  SkipForward
} from 'lucide-react';
import { 
  ConversationalRecoveryFlow, 
  ConversationContext, 
  ConversationalPrompt,
  EscapeHatch
} from '@/services/conversationalRecoveryFlow';
import { CRMEntity as CRMEntityType, EntityConfig } from '@/hooks/useCRM';
import { useToast } from '@/hooks/use-toast';

interface ConversationalFormAssistantProps {
  entityType: CRMEntityType;
  config: EntityConfig<any>;
  formData: any;
  onFormDataChange: (data: any) => void;
  onFormComplete?: (data: any) => void;
  validationErrors?: any[];
  className?: string;
}

export const ConversationalFormAssistant: React.FC<ConversationalFormAssistantProps> = ({
  entityType,
  config,
  formData,
  onFormDataChange,
  onFormComplete,
  validationErrors = [],
  className = ''
}) => {
  const { toast } = useToast();
  const [conversationContext, setConversationContext] = useState<ConversationContext | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<ConversationalPrompt | null>(null);
  const [isInConversation, setIsInConversation] = useState(false);
  const [emotionalState, setEmotionalState] = useState<'neutral' | 'encouraged' | 'frustrated' | 'celebrating'>('neutral');

  // Initialize conversation when validation errors occur
  useEffect(() => {
    if (validationErrors.length > 0 && !isInConversation) {
      startConversationalRecovery();
    }
  }, [validationErrors, isInConversation]);

  // Listen for chat responses and user interactions
  useEffect(() => {
    const handleChatResponse = (event: CustomEvent) => {
      const { message, context: eventContext } = event.detail;
      
      if (eventContext?.type === 'conversational_recovery' && 
          eventContext?.sessionId === conversationContext?.sessionId) {
        handleConversationContinuation(message, eventContext);
      }
    };

    const handleUserMessage = (event: CustomEvent) => {
      const { message, context: eventContext } = event.detail;
      
      if (conversationContext && eventContext?.sessionId === conversationContext.sessionId) {
        // Process user response in conversation
        const response = ConversationalRecoveryFlow.handleUserResponse(
          conversationContext.sessionId,
          message
        );
        
        if (response) {
          setCurrentPrompt(response);
          updateEmotionalState(response.emotionalTone);
        }
      }
    };

    window.addEventListener('chat-response', handleChatResponse as EventListener);
    window.addEventListener('user-message', handleUserMessage as EventListener);
    
    return () => {
      window.removeEventListener('chat-response', handleChatResponse as EventListener);
      window.removeEventListener('user-message', handleUserMessage as EventListener);
    };
  }, [conversationContext]);

  const startConversationalRecovery = useCallback(() => {
    const context = ConversationalRecoveryFlow.initiateeRecovery(
      entityType,
      config,
      formData,
      validationErrors
    );
    
    setConversationContext(context);
    setIsInConversation(true);
    setEmotionalState('encouraged');
    
    toast({
      title: "🤖 Your AI Assistant is Here!",
      description: "I'll help you complete this form conversationally.",
    });
  }, [entityType, config, formData, validationErrors, toast]);

  const handleConversationContinuation = useCallback((message: string, context: any) => {
    // Extract any form data from the AI response
    // This would integrate with your ChatDataExtractor
    
    if (context.extractedData) {
      onFormDataChange({ ...formData, ...context.extractedData });
      setEmotionalState('celebrating');
      
      // Check if form is now complete
      if (context.isComplete && onFormComplete) {
        onFormComplete({ ...formData, ...context.extractedData });
        setIsInConversation(false);
      }
    }
  }, [formData, onFormDataChange, onFormComplete]);

  const handleEscapeHatch = useCallback((escapeHatch: EscapeHatch) => {
    switch (escapeHatch.type) {
      case 'save_draft':
        localStorage.setItem(`draft_${entityType}`, JSON.stringify(formData));
        toast({
          title: "💾 Draft Saved",
          description: "Your progress has been saved securely.",
        });
        setIsInConversation(false);
        break;
        
      case 'skip_optional':
        // Filter to only required fields
        const requiredData = Object.keys(formData).reduce((acc, key) => {
          if (config.requiredFields.includes(key) && formData[key]) {
            acc[key] = formData[key];
          }
          return acc;
        }, {} as any);
        
        if (onFormComplete) {
          onFormComplete(requiredData);
        }
        setIsInConversation(false);
        break;
        
      case 'bulk_mode':
        toast({
          title: "🚀 Bulk Mode",
          description: "Switching to bulk entry mode...",
        });
        // This would trigger a different UI mode
        break;
        
      default:
        toast({
          title: "Feature Coming Soon",
          description: `${escapeHatch.label} will be available soon!`,
        });
    }
  }, [entityType, formData, config, onFormComplete, toast]);

  const updateEmotionalState = useCallback((tone: string) => {
    switch (tone) {
      case 'encouraging':
        setEmotionalState('encouraged');
        break;
      case 'understanding':
        setEmotionalState('frustrated'); // User might be frustrated, we're understanding
        break;
      case 'collaborative':
        setEmotionalState('neutral');
        break;
      default:
        setEmotionalState('neutral');
    }
  }, []);

  const calculateProgress = useCallback(() => {
    const totalFields = config.formFields.length;
    const completedFields = Object.values(formData).filter(v => v && v !== '').length;
    return {
      completed: completedFields,
      total: totalFields,
      percentage: Math.round((completedFields / totalFields) * 100)
    };
  }, [formData, config]);

  const renderProgressCelebration = () => {
    const progress = calculateProgress();
    const { percentage } = progress;
    
    let celebrationIcon = <Clock className="h-4 w-4" />;
    let celebrationColor = "text-muted-foreground";
    let celebrationMessage = "Let's get started!";
    
    if (percentage > 0) {
      celebrationIcon = <ArrowRight className="h-4 w-4" />;
      celebrationColor = "text-blue-500";
      celebrationMessage = "Good progress!";
    }
    if (percentage > 25) {
      celebrationIcon = <Lightbulb className="h-4 w-4" />;
      celebrationColor = "text-yellow-500";
      celebrationMessage = "You're getting the hang of it!";
    }
    if (percentage > 50) {
      celebrationIcon = <Heart className="h-4 w-4" />;
      celebrationColor = "text-pink-500";
      celebrationMessage = "Halfway there! Great job!";
    }
    if (percentage > 75) {
      celebrationIcon = <CheckCircle className="h-4 w-4" />;
      celebrationColor = "text-green-500";
      celebrationMessage = "Almost done! You're doing amazing!";
    }
    if (percentage === 100) {
      celebrationIcon = <CheckCircle className="h-4 w-4" />;
      celebrationColor = "text-green-500";
      celebrationMessage = "Perfect! Everything's complete! 🎉";
    }
    
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className={celebrationColor}>{celebrationIcon}</span>
        <span className={celebrationColor}>{celebrationMessage}</span>
        <Badge variant="outline" className="text-xs">
          {progress.completed}/{progress.total} fields
        </Badge>
      </div>
    );
  };

  const renderConversationalInterface = () => {
    if (!isInConversation || !currentPrompt) return null;

    return (
      <Card className={`border-l-4 ${getEmotionalBorderColor()} transition-all duration-300`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageCircle className={`h-4 w-4 ${getEmotionalIconColor()}`} />
              Conversational Assistant
              <Badge variant="outline" className="text-xs">
                {currentPrompt.emotionalTone}
              </Badge>
            </CardTitle>
            {renderProgressCelebration()}
          </div>
          
          <Progress 
            value={calculateProgress().percentage} 
            className="h-2 transition-all duration-500" 
          />
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Main conversational message */}
          <Alert className={`border-l-4 ${getEmotionalBorderColor()}`}>
            <MessageCircle className="h-4 w-4" />
            <AlertDescription className="text-sm leading-relaxed">
              {currentPrompt.message}
            </AlertDescription>
          </Alert>
          
          {/* Progress celebration */}
          {currentPrompt.progressIndicator && (
            <div className="bg-green-50 p-3 rounded-md border border-green-200">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle className="h-4 w-4" />
                {currentPrompt.progressIndicator.celebrationMessage}
              </div>
              {currentPrompt.progressIndicator.estimatedTimeRemaining && (
                <div className="text-xs text-green-600 mt-1">
                  ⏱️ About {currentPrompt.progressIndicator.estimatedTimeRemaining} remaining
                </div>
              )}
            </div>
          )}
          
          {/* Contextual examples */}
          {currentPrompt.contextualExamples.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-md">
              <div className="text-xs font-medium text-blue-700 mb-2">Examples:</div>
              <div className="space-y-1">
                {currentPrompt.contextualExamples.map((example, index) => (
                  <div key={index} className="text-xs text-blue-600">
                    {example}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Suggested responses */}
          {currentPrompt.suggestedResponses.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Quick responses:</div>
              <div className="flex flex-wrap gap-2">
                {currentPrompt.suggestedResponses.map((response, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      // This would send the response to the chat
                      window.dispatchEvent(new CustomEvent('user-message', {
                        detail: { 
                          message: response, 
                          context: { sessionId: conversationContext?.sessionId } 
                        }
                      }));
                    }}
                  >
                    {response}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          {/* Escape hatches */}
          {currentPrompt.escapeHatches.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Alternative options:</div>
              <div className="space-y-2">
                {currentPrompt.escapeHatches.map((hatch, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{hatch.label}</div>
                      <div className="text-xs text-muted-foreground">{hatch.description}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEscapeHatch(hatch)}
                      className="ml-2 text-xs"
                    >
                      {hatch.type === 'save_draft' && <Save className="h-3 w-3 mr-1" />}
                      {hatch.type === 'skip_optional' && <SkipForward className="h-3 w-3 mr-1" />}
                      Choose
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const getEmotionalBorderColor = () => {
    switch (emotionalState) {
      case 'encouraged': return 'border-l-green-500';
      case 'celebrating': return 'border-l-blue-500';
      case 'frustrated': return 'border-l-yellow-500';
      default: return 'border-l-primary';
    }
  };

  const getEmotionalIconColor = () => {
    switch (emotionalState) {
      case 'encouraged': return 'text-green-500';
      case 'celebrating': return 'text-blue-500';
      case 'frustrated': return 'text-yellow-500';
      default: return 'text-primary';
    }
  };

  if (!isInConversation) {
    return (
      <div className={className}>
        {validationErrors.length > 0 && (
          <Button
            variant="outline"
            onClick={startConversationalRecovery}
            className="w-full flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Get Conversational Help
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {renderConversationalInterface()}
    </div>
  );
};