import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Zap, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RateLimitIndicatorProps {
  current: number;
  max: number;
  willHitLimit?: boolean;
  timeToLimit?: number;
  suggestion?: string;
  onRequestBypass?: () => void;
  className?: string;
}

export const RateLimitIndicator: React.FC<RateLimitIndicatorProps> = ({
  current,
  max,
  willHitLimit,
  timeToLimit,
  suggestion,
  onRequestBypass,
  className
}) => {
  const percentage = (current / max) * 100;
  
  // Only show when approaching limits
  if (percentage < 70) return null;

  const isWarning = percentage > 90;
  const isCritical = percentage >= 100;

  const getIcon = () => {
    if (isCritical) return AlertTriangle;
    if (isWarning) return Clock;
    return Zap;
  };

  const getVariant = () => {
    if (isCritical) return 'destructive';
    if (isWarning) return 'default';
    return 'default';
  };

  const getMessage = () => {
    if (isCritical) {
      return `Rate limit reached! ${max - current} actions remaining`;
    }
    if (isWarning) {
      return `Slow down! ${max - current} actions remaining`;
    }
    return "You're moving fast! Consider batching operations";
  };

  const Icon = getIcon();

  return (
    <Alert 
      variant={getVariant()}
      className={cn(
        "transition-all duration-300",
        isWarning && "border-warning bg-warning/10",
        isCritical && "border-destructive bg-destructive/10",
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">{getMessage()}</span>
            <Badge variant="outline" className="text-xs">
              {current}/{max}
            </Badge>
          </div>
          
          <Progress 
            value={percentage} 
            className="h-2 mb-2" 
          />
          
          {willHitLimit && timeToLimit && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <Clock className="h-3 w-3" />
              Limit in {Math.round(timeToLimit)}s at current pace
            </div>
          )}
          
          {suggestion && (
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <Sparkles className="h-3 w-3" />
              {suggestion}
            </div>
          )}
        </div>
        
        {isCritical && onRequestBypass && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRequestBypass}
            className="ml-4 shrink-0"
          >
            Request Bypass
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

// Usage indicator for bulk operations
export const BatchModeIndicator: React.FC<{
  selectedCount: number;
  threshold: number;
  onToggleBatchMode?: () => void;
  isBatchMode?: boolean;
}> = ({ selectedCount, threshold, onToggleBatchMode, isBatchMode }) => {
  if (selectedCount < threshold) return null;

  return (
    <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <Zap className="h-4 w-4 text-blue-600" />
      <AlertDescription className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Batch mode recommended for {selectedCount} items
          </span>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            Process all items at once for better performance
          </p>
        </div>
        
        {onToggleBatchMode && (
          <Button
            size="sm"
            variant={isBatchMode ? "default" : "outline"}
            onClick={onToggleBatchMode}
            className="ml-4 shrink-0"
          >
            {isBatchMode ? "Batch Mode On" : "Use Batch Mode"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};