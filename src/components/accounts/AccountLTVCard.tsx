import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  TrendingUp, DollarSign, Calendar, AlertTriangle,
  ArrowUpRight, Heart, Activity, Info
} from 'lucide-react';
import type { AccountLTV } from '@/types/product-catalog';

interface AccountLTVCardProps {
  account: {
    id: string;
    name: string;
  } & Partial<AccountLTV>;
  compact?: boolean;
}

const LTV_SEGMENT_CONFIG = {
  high: { label: 'High Value', color: 'bg-green-100 text-green-800', bgColor: 'bg-green-50' },
  medium: { label: 'Medium Value', color: 'bg-blue-100 text-blue-800', bgColor: 'bg-blue-50' },
  low: { label: 'Low Value', color: 'bg-gray-100 text-gray-800', bgColor: 'bg-gray-50' },
  churned: { label: 'Churned', color: 'bg-red-100 text-red-800', bgColor: 'bg-red-50' },
};

export const AccountLTVCard: React.FC<AccountLTVCardProps> = ({ account, compact = false }) => {
  const formatCurrency = (amount: number | null | undefined) =>
    amount != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
      : '-';

  const formatDate = (dateStr: string | null | undefined) =>
    dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-';

  const segmentConfig = account.ltv_segment
    ? LTV_SEGMENT_CONFIG[account.ltv_segment as keyof typeof LTV_SEGMENT_CONFIG]
    : null;

  const healthScore = account.health_score ?? 0;
  const churnRisk = account.churn_risk_score ?? 0;
  const confidencePercent = (account.ltv_confidence ?? 0) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Predicted LTV</span>
            {segmentConfig && (
              <Badge className={segmentConfig.color} variant="secondary">
                {segmentConfig.label}
              </Badge>
            )}
          </div>
          <div className="text-xl font-bold mt-1">
            {formatCurrency(account.ltv_predicted)}
          </div>
        </div>
        {account.expansion_potential && account.expansion_potential > 0 && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Expansion</div>
            <div className="text-sm font-medium text-green-600 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              {formatCurrency(account.expansion_potential)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Lifetime Value
          </CardTitle>
          {segmentConfig && (
            <Badge className={segmentConfig.color}>{segmentConfig.label}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main LTV Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Current LTV</div>
            <div className="text-2xl font-bold">{formatCurrency(account.ltv_calculated)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              Predicted LTV
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>3-year projected value based on</p>
                    <p>current revenue patterns</p>
                    <p className="mt-1 text-xs opacity-75">
                      Confidence: {confidencePercent.toFixed(0)}%
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(account.ltv_predicted)}
            </div>
          </div>
        </div>

        {/* Revenue Metrics */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <div className="text-xs text-muted-foreground">Total Revenue</div>
            <div className="font-semibold">{formatCurrency(account.total_revenue)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">ARR</div>
            <div className="font-semibold">{formatCurrency(account.arr)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MRR</div>
            <div className="font-semibold">{formatCurrency(account.mrr)}</div>
          </div>
        </div>

        {/* Health & Risk Indicators */}
        <div className="space-y-3 pt-2 border-t">
          {/* Health Score */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Heart className="h-3 w-3" />
                Health Score
              </span>
              <span className="text-sm font-medium">{healthScore}/100</span>
            </div>
            <Progress
              value={healthScore}
              className="h-2"
            />
          </div>

          {/* Churn Risk */}
          {churnRisk > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Churn Risk
                </span>
                <span className={`text-sm font-medium ${churnRisk > 0.5 ? 'text-red-600' : churnRisk > 0.25 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {(churnRisk * 100).toFixed(0)}%
                </span>
              </div>
              <Progress
                value={churnRisk * 100}
                className={`h-2 ${churnRisk > 0.5 ? '[&>div]:bg-red-500' : churnRisk > 0.25 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'}`}
              />
            </div>
          )}
        </div>

        {/* Expansion Potential */}
        {account.expansion_potential && account.expansion_potential > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-green-600" />
              Expansion Potential
            </span>
            <span className="font-semibold text-green-600">
              {formatCurrency(account.expansion_potential)}
            </span>
          </div>
        )}

        {/* Customer Timeline */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Customer since {formatDate(account.customer_since)}
          </span>
          {account.ltv_last_calculated_at && (
            <span>
              Updated {formatDate(account.ltv_last_calculated_at)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Compact inline display for lists/tables
export const AccountLTVBadge: React.FC<{ account: Partial<AccountLTV> }> = ({ account }) => {
  const formatCurrency = (amount: number | null | undefined) =>
    amount != null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
      : '-';

  const segmentConfig = account.ltv_segment
    ? LTV_SEGMENT_CONFIG[account.ltv_segment as keyof typeof LTV_SEGMENT_CONFIG]
    : null;

  if (!account.ltv_predicted && !account.ltv_calculated) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {segmentConfig && (
              <Badge variant="secondary" className={`${segmentConfig.color} text-xs`}>
                {formatCurrency(account.ltv_predicted || account.ltv_calculated)}
              </Badge>
            )}
            {account.churn_risk_score && account.churn_risk_score > 0.5 && (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <div>Predicted LTV: {formatCurrency(account.ltv_predicted)}</div>
            <div>Current LTV: {formatCurrency(account.ltv_calculated)}</div>
            {account.expansion_potential && account.expansion_potential > 0 && (
              <div className="text-green-400">
                Expansion: +{formatCurrency(account.expansion_potential)}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
