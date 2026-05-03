import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Telescope, Target, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZoomOption {
  label: string;
  value: 'tactical' | 'strategic';
}

interface ZoomDecisionCardProps {
  dealName: string;
  accountContext?: {
    wonDeals: number;
    wonValue: number;
    totalDeals?: number;
    winRate?: number;
  };
  options: ZoomOption[];
  onSelect: (zoomLevel: 'tactical' | 'strategic') => void;
  disabled?: boolean;
}

export const ZoomDecisionCard: React.FC<ZoomDecisionCardProps> = ({
  dealName,
  accountContext,
  options,
  onSelect,
  disabled
}) => {
  return (
    <Card className="bg-muted/50 border-primary/20">
      <CardContent className="p-4">
        {/* Account context summary */}
        {accountContext && (
          <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>{accountContext.wonDeals} won</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">
                ${accountContext.wonValue.toLocaleString()}
              </span>
              <span>total value</span>
            </div>
            {accountContext.winRate !== undefined && accountContext.winRate > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-primary font-medium">{accountContext.winRate}%</span>
                <span>win rate</span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          {options.map((option) => (
            <Button
              key={option.value}
              variant={option.value === 'strategic' ? 'default' : 'outline'}
              className={cn(
                "flex-1 gap-2",
                option.value === 'strategic' && "bg-primary"
              )}
              onClick={() => onSelect(option.value)}
              disabled={disabled}
            >
              {option.value === 'tactical' ? (
                <Target className="h-4 w-4" />
              ) : (
                <Telescope className="h-4 w-4" />
              )}
              {option.label}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-3 text-center">
          {options.find(o => o.value === 'strategic') 
            ? 'Strategic analysis includes past deals, win patterns, and relationship history'
            : 'Choose an analysis depth'}
        </p>
      </CardContent>
    </Card>
  );
};

export default ZoomDecisionCard;
