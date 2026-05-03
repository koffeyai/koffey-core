import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp, DollarSign, CheckCircle2, Layers } from 'lucide-react';

interface PipelineMetricsCardsProps {
  quotaAttainment: {
    current: number;
    target: number;
    percentage: number;
  };
  expectedEarnings: number;
  totalPipelineValue: number;
  activeDealsCount: number;
  selectedDealsValue: number;
  selectedCount: number;
}

export function PipelineMetricsCards({
  quotaAttainment,
  expectedEarnings,
  totalPipelineValue,
  activeDealsCount,
  selectedDealsValue,
  selectedCount,
}: PipelineMetricsCardsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCompactCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return formatCurrency(amount);
  };

  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      {/* Quota Attainment */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Quota Attainment</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {quotaAttainment.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current</span>
              <span className="font-semibold">{formatCompactCurrency(quotaAttainment.current)}</span>
            </div>
            <Progress value={quotaAttainment.percentage} className="h-2" />
            <div className="text-xs text-muted-foreground text-center">
              Target: {formatCompactCurrency(quotaAttainment.target)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expected Earnings */}
      <Card className="bg-gradient-to-br from-accent/5 to-accent/10 border-accent/20">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Expected Earnings</span>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {formatCompactCurrency(expectedEarnings)}
          </div>
          <div className="text-xs text-muted-foreground">
            Weighted by probability
          </div>
        </CardContent>
      </Card>

      {/* Total Pipeline */}
      <Card className="bg-gradient-to-br from-secondary/5 to-secondary/10 border-secondary/20">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <DollarSign className="h-4 w-4 text-secondary" />
            <span className="text-sm font-medium text-foreground">Total Pipeline</span>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {formatCompactCurrency(totalPipelineValue)}
          </div>
          <div className="text-xs text-muted-foreground">
            {activeDealsCount} active deals
          </div>
        </CardContent>
      </Card>

      {/* Selected Deals */}
      <Card className="bg-gradient-to-br from-vibrant-cyan/5 to-vibrant-cyan/10 border-vibrant-cyan/20">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-vibrant-cyan" />
            <span className="text-sm font-medium text-foreground">Selected</span>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {selectedCount}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatCompactCurrency(selectedDealsValue)} value
          </div>
        </CardContent>
      </Card>

      {/* Active Deals */}
      <Card className="bg-gradient-to-br from-soft-rose/5 to-soft-rose/10 border-soft-rose/20">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <Layers className="h-4 w-4 text-soft-rose" />
            <span className="text-sm font-medium text-foreground">Active Deals</span>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {activeDealsCount}
          </div>
          <div className="text-xs text-muted-foreground">
            In pipeline
          </div>
        </CardContent>
      </Card>
    </div>
  );
}