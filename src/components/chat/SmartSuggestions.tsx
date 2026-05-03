/**
 * Smart Suggestions - Context-aware suggestions for chat interactions
 * Now enhanced with behavioral insights for personalization
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, Users, Calendar, FileText, Zap } from 'lucide-react';
import { useConversationMemory } from '@/hooks/useConversationMemory';
import { useUserBehaviorInsights } from '@/hooks/useUserBehaviorInsights';
import { cn } from '@/lib/utils';

interface Suggestion {
  id: string;
  type: 'action' | 'question' | 'insight' | 'followup';
  text: string;
  description?: string;
  confidence: number;
  icon?: React.ReactNode;
  category: string;
}

interface SmartSuggestionsProps {
  sessionId?: string;
  onSuggestionClick: (suggestion: Suggestion) => void;
  className?: string;
}

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({
  sessionId,
  onSuggestionClick,
  className
}) => {
  const { context, getRelevantEntities, getConversationSummary } = useConversationMemory(sessionId);
  const { insights, currentSuggestion, getPersonalizedSuggestions, workingPatterns } = useUserBehaviorInsights();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    generateSuggestions();
  }, [context, currentSuggestion, workingPatterns]);

  const generateSuggestions = () => {
    const summary = getConversationSummary();
    const relevantEntities = getRelevantEntities(3);
    const newSuggestions: Suggestion[] = [];

    // Stage-based suggestions
    switch (context.conversationStage) {
      case 'greeting':
        newSuggestions.push(
          {
            id: 'welcome-crm-overview',
            type: 'question',
            text: 'Show me my CRM dashboard overview',
            description: 'Get a quick overview of your CRM data',
            confidence: 0.9,
            icon: <TrendingUp className="h-4 w-4" />,
            category: 'Overview'
          },
          {
            id: 'welcome-recent-activity',
            type: 'question',
            text: 'What happened in my CRM today?',
            description: 'View recent activities and updates',
            confidence: 0.8,
            icon: <Calendar className="h-4 w-4" />,
            category: 'Activity'
          }
        );
        break;

      case 'discovery':
        if (relevantEntities.length > 0) {
          const entity = relevantEntities[0];
          newSuggestions.push({
            id: `explore-${entity.entityId}`,
            type: 'action',
            text: `Tell me more about ${entity.entityName}`,
            description: `Get detailed information about this ${entity.entityType}`,
            confidence: 0.85,
            icon: <FileText className="h-4 w-4" />,
            category: 'Details'
          });
        }
        break;

      case 'action':
        newSuggestions.push(
          {
            id: 'create-follow-up',
            type: 'action',
            text: 'Create a follow-up task',
            description: 'Set a reminder for this conversation',
            confidence: 0.8,
            icon: <Calendar className="h-4 w-4" />,
            category: 'Task'
          }
        );
        break;
    }

    // Intent-based suggestions
    switch (context.userIntent) {
      case 'search':
        newSuggestions.push({
          id: 'refine-search',
          type: 'question',
          text: 'Show me similar records',
          description: 'Find related contacts, deals, or accounts',
          confidence: 0.7,
          icon: <Users className="h-4 w-4" />,
          category: 'Search'
        });
        break;

      case 'create':
        newSuggestions.push({
          id: 'create-related',
          type: 'action',
          text: 'Create related records',
          description: 'Add connected contacts, deals, or tasks',
          confidence: 0.75,
          icon: <FileText className="h-4 w-4" />,
          category: 'Create'
        });
        break;
    }

    // Entity-based suggestions
    relevantEntities.forEach(entity => {
      if (entity.entityType === 'contacts') {
        newSuggestions.push({
          id: `contact-deals-${entity.entityId}`,
          type: 'question',
          text: `What deals are associated with ${entity.entityName}?`,
          description: 'View all deals for this contact',
          confidence: 0.8,
          icon: <TrendingUp className="h-4 w-4" />,
          category: 'Deals'
        });
      }

      if (entity.entityType === 'deals') {
        newSuggestions.push({
          id: `deal-activities-${entity.entityId}`,
          type: 'question',
          text: `Show recent activities for ${entity.entityName}`,
          description: 'View timeline and activities',
          confidence: 0.8,
          icon: <Calendar className="h-4 w-4" />,
          category: 'Activity'
        });
      }
    });

    // General helpful suggestions
    if (newSuggestions.length < 3) {
      newSuggestions.push(
        {
          id: 'data-quality',
          type: 'insight',
          text: 'Analyze my data quality',
          description: 'Get insights on CRM data completeness',
          confidence: 0.6,
          icon: <Lightbulb className="h-4 w-4" />,
          category: 'Insights'
        },
        {
          id: 'pipeline-analysis',
          type: 'insight',
          text: 'Show my sales pipeline analysis',
          description: 'View pipeline trends and forecasts',
          confidence: 0.6,
          icon: <TrendingUp className="h-4 w-4" />,
          category: 'Analytics'
        }
      );
    }

    // Add behavioral suggestion if available
    if (currentSuggestion) {
      newSuggestions.push({
        id: 'behavior-tip',
        type: 'insight',
        text: currentSuggestion,
        description: 'Based on your usage patterns',
        confidence: 0.85,
        icon: <Zap className="h-4 w-4" />,
        category: 'Tip'
      });
    }

    // Personalize suggestions using behavioral data
    const personalizedSuggestions = getPersonalizedSuggestions(
      newSuggestions.map(s => ({ id: s.id, text: s.text, weight: s.confidence }))
    );

    // Reorder based on personalization
    const reorderedSuggestions = personalizedSuggestions.map(ps => {
      return newSuggestions.find(s => s.id === ps.id)!;
    }).filter(Boolean);

    // Sort by confidence and limit
    const sortedSuggestions = reorderedSuggestions
      .slice(0, 4);

    setSuggestions(sortedSuggestions);
  };

  const getSuggestionTypeColor = (type: Suggestion['type']) => {
    switch (type) {
      case 'action':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'question':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'insight':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'followup':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card className={cn("border-l-4 border-l-primary/20", className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">Smart Suggestions</span>
        </div>

        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.id}
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start h-auto p-3 text-left",
                getSuggestionTypeColor(suggestion.type)
              )}
              onClick={() => onSuggestionClick(suggestion)}
            >
              <div className="flex items-start gap-2 w-full">
                {suggestion.icon && (
                  <div className="flex-shrink-0 mt-0.5">
                    {suggestion.icon}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium">{suggestion.text}</p>
                    <Badge variant="secondary" className="text-xs">
                      {suggestion.category}
                    </Badge>
                  </div>
                  {suggestion.description && (
                    <p className="text-xs opacity-75">{suggestion.description}</p>
                  )}
                </div>
              </div>
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Based on conversation context
          </span>
          <Badge variant="outline" className="text-xs">
            {suggestions.length} suggestions
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};