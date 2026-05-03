import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ScoutpadBarProps {
  letter: string;
  name: string;
  score: number;
  evidence?: string[];
  gaps?: string[];
  impact?: string;
  expanded?: boolean;
  onToggle?: () => void;
}

export function ScoutpadBar({ 
  letter, 
  name, 
  score, 
  evidence = [], 
  gaps = [], 
  impact,
  expanded = false,
  onToggle
}: ScoutpadBarProps) {
  const percentage = (score / 10) * 100;
  const isCritical = score < 5;
  const isWarning = score >= 5 && score < 7;
  const isGood = score >= 7;

  const getBarColor = () => {
    if (isCritical) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (isWarning) return 'bg-gradient-to-r from-amber-500 to-yellow-500';
    return 'bg-gradient-to-r from-emerald-500 to-green-500';
  };

  const getTextColor = () => {
    if (isCritical) return 'text-red-500';
    if (isWarning) return 'text-amber-500';
    return 'text-emerald-500';
  };

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
          {/* Letter badge */}
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center font-bold text-sm',
            isCritical ? 'bg-red-500/10 text-red-500' :
            isWarning ? 'bg-amber-500/10 text-amber-500' :
            'bg-emerald-500/10 text-emerald-500'
          )}>
            {letter}
          </div>

          {/* Name and bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground truncate">{name}</span>
              <div className="flex items-center gap-2">
                {isCritical && (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={cn('text-sm font-bold', getTextColor())}>
                  {score}/10
                </span>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn('h-full rounded-full transition-all duration-500', getBarColor())}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Expand indicator */}
          <div className="text-muted-foreground group-hover:text-foreground transition-colors">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-11 pl-3 pr-3 pb-3 space-y-2 border-l-2 border-muted">
          {evidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-emerald-600 mb-1">Evidence</p>
              <ul className="space-y-0.5">
                {evidence.map((item, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {gaps.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-600 mb-1">Gaps</p>
              <ul className="space-y-0.5">
                {gaps.map((item, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5">!</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {impact && (
            <p className="text-xs text-muted-foreground italic border-t border-muted pt-2 mt-2">
              {impact}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
