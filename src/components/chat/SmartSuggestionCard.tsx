import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb, CheckSquare, MessageSquare, FileEdit } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SmartSuggestion {
  id: string;
  label: string;
  description?: string;
  action: () => void;
  icon?: React.ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
}

interface SmartSuggestionCardProps {
  title: string;
  message: string;
  suggestions: SmartSuggestion[];
  variant?: 'info' | 'warning' | 'question';
}

const variantConfig = {
  info: {
    icon: Lightbulb,
    iconColor: 'text-blue-600 dark:text-blue-400',
    bgGradient: 'from-blue-500/10 to-cyan-500/10',
    borderColor: 'border-blue-500/30'
  },
  warning: {
    icon: Lightbulb,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgGradient: 'from-amber-500/10 to-orange-500/10',
    borderColor: 'border-amber-500/30'
  },
  question: {
    icon: MessageSquare,
    iconColor: 'text-purple-600 dark:text-purple-400',
    bgGradient: 'from-purple-500/10 to-pink-500/10',
    borderColor: 'border-purple-500/30'
  }
};

const defaultIcons: Record<string, any> = {
  create: CheckSquare,
  tell: MessageSquare,
  fill: FileEdit
};

export const SmartSuggestionCard: React.FC<SmartSuggestionCardProps> = ({
  title,
  message,
  suggestions,
  variant = 'info'
}) => {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  const getDefaultIcon = (label: string) => {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('create')) return <CheckSquare className="h-4 w-4 mr-2" />;
    if (lowerLabel.includes('tell') || lowerLabel.includes('provide')) return <MessageSquare className="h-4 w-4 mr-2" />;
    if (lowerLabel.includes('fill') || lowerLabel.includes('form')) return <FileEdit className="h-4 w-4 mr-2" />;
    return null;
  };

  return (
    <Card className={cn(
      "border bg-gradient-to-br",
      config.bgGradient,
      config.borderColor,
      "animate-in slide-in-from-bottom-3 duration-300"
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn(
            "p-2 rounded-lg bg-background/50",
            config.iconColor
          )}>
            <IconComponent className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-foreground mb-1">{title}</h4>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        {/* Suggestions */}
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.id}
              variant={suggestion.variant || 'outline'}
              className="w-full justify-start text-left h-auto py-3 px-4"
              onClick={suggestion.action}
            >
              <div className="flex items-start gap-2 w-full">
                {suggestion.icon || getDefaultIcon(suggestion.label)}
                <div className="flex-1 min-w-0">
                  <span className="font-medium block">{suggestion.label}</span>
                  {suggestion.description && (
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      {suggestion.description}
                    </span>
                  )}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
