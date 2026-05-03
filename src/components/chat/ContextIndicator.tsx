/**
 * Context Indicator - Shows active conversation context to users
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, MessageCircle, Building2, HandCoins, Users } from 'lucide-react';

interface ContextIndicatorProps {
  context: {
    activeEntities: Array<{
      entityType: string;
      entityId: string;
      entityName: string;
      relevance: number;
    }>;
    currentStage: string;
    recentTopics: string;
    hasContext: boolean;
    canUsePronouns: boolean;
  };
  onClearContext?: () => void;
  onEntityClick?: (entity: any) => void;
}

const getEntityIcon = (type: string) => {
  switch (type) {
    case 'accounts':
      return <Building2 className="w-3 h-3" />;
    case 'deals':
      return <HandCoins className="w-3 h-3" />;
    case 'contacts':
      return <Users className="w-3 h-3" />;
    default:
      return <MessageCircle className="w-3 h-3" />;
  }
};

const getEntityTypeLabel = (type: string) => {
  switch (type) {
    case 'accounts':
      return 'Company';
    case 'deals':
      return 'Deal';
    case 'contacts':
      return 'Contact';
    default:
      return type;
  }
};

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  context,
  onClearContext,
  onEntityClick
}) => {
  if (!context.hasContext) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 border-b">
      <span className="text-sm text-muted-foreground">Discussing:</span>
      
      {context.activeEntities.map((entity, index) => (
        <Badge
          key={`${entity.entityType}-${entity.entityId}`}
          variant="secondary"
          className="flex items-center gap-1 cursor-pointer hover:bg-secondary/80"
          onClick={() => onEntityClick?.(entity)}
        >
          {getEntityIcon(entity.entityType)}
          <span className="text-xs">
            {getEntityTypeLabel(entity.entityType)}: {entity.entityName}
          </span>
        </Badge>
      ))}
      
      {context.recentTopics && (
        <Badge variant="outline" className="text-xs">
          {context.recentTopics}
        </Badge>
      )}
      
      {context.canUsePronouns && (
        <Badge variant="outline" className="text-xs text-green-600">
          Can use "it", "them", "that"
        </Badge>
      )}
      
      {onClearContext && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={onClearContext}
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
};