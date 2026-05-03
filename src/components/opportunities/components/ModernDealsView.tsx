import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, Trash2, Building2, Calendar, Percent, AlertTriangle, Presentation } from 'lucide-react';
import { Deal } from './DealsPage';
import { useAtRiskDeals, AtRiskDeal } from '@/hooks/useAtRiskDeals';
import { DealNextStepsPreview } from '@/components/deals/DealNextStepsPreview';
import { DealTaskPreview, DealTasksData } from '@/hooks/useDealTasksPreview';
import { formatCurrency } from '@/lib/formatters';
import { ProbabilitySource } from '@/lib/dealConstants';
import { openAccountView, openSlideStudio } from '@/lib/appNavigation';

// Extended Deal type to include probability_source and account_id from spread
interface DealWithSource extends Deal {
  probability_source?: ProbabilitySource;
  account_id?: string;
}

interface ModernDealsViewProps {
  deals: DealWithSource[];
  selectedDeals: string[];
  onDealClick: (deal: DealWithSource) => void;
  onDealSelect: (dealId: string, selected: boolean) => void;
  onEdit: (deal: DealWithSource) => void;
  onDelete: (dealId: string) => void;
  onCoachDeal: (deal: DealWithSource) => void;
  dealTasks?: Record<string, DealTasksData>;
}

// Risk indicator component
function RiskIndicator({ risk }: { risk: AtRiskDeal }) {
  const colorClasses = {
    critical: 'text-red-500 bg-red-500/10',
    high: 'text-orange-500 bg-orange-500/10',
    medium: 'text-yellow-500 bg-yellow-500/10',
    low: 'text-blue-400 bg-blue-400/10'
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses[risk.riskLevel]}`}>
            <AlertTriangle className="h-3 w-3" />
            <span className="capitalize">{risk.riskLevel}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-semibold">Risk Score: {risk.riskScore}/100</div>
            <ul className="text-xs space-y-1">
              {risk.factors.map((factor, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 ${
                    factor.severity === 'high' ? 'bg-red-500' : 
                    factor.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-400'
                  }`} />
                  {factor.description}
                </li>
              ))}
            </ul>
            <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
              💡 {risk.suggestedAction}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ModernDealsView({
  deals,
  selectedDeals,
  onDealClick,
  onDealSelect,
  onEdit,
  onDelete,
  onCoachDeal,
  dealTasks,
}: ModernDealsViewProps) {
  const { getRiskForDeal } = useAtRiskDeals();

  const normalizeStage = (stage: unknown): string => {
    if (typeof stage !== 'string') return 'prospecting';
    const normalized = stage.trim().toLowerCase();
    return normalized || 'prospecting';
  };

  const getStageColor = (stage: unknown) => {
    switch (normalizeStage(stage)) {
      case 'closed-won': 
        return 'bg-green-100 text-green-800 border-green-200';
      case 'closed-lost': 
        return 'bg-red-100 text-red-800 border-red-200';
      case 'negotiation': 
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'proposal': 
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'qualified': 
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'prospecting': 
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default: 
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    // Parse YYYY-MM-DD as local date (not UTC) to avoid timezone shift
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const parsed = match
      ? new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
      : new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStageName = (stage: unknown) => {
    return normalizeStage(stage).replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (deals.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No deals found</p>
          <p className="text-sm">Start by creating your first deal to see it here.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {deals.map((deal) => {
        const dealId = deal.id || '';
        const isSelected = selectedDeals.includes(dealId);
        const dealName = deal.dealName || deal.name || 'Untitled Deal';
        const dealRisk = getRiskForDeal(dealId);
        
        return (
          <Card 
            key={dealId} 
            onClick={() => onDealClick(deal)}
            className={`transition-all duration-200 hover:shadow-lg hover:border-primary/30 cursor-pointer group ${
              isSelected ? 'ring-2 ring-primary shadow-md' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onDealSelect(dealId, checked as boolean)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
                
                {/* Main Deal Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors capitalize">
                        {dealName}
                      </h3>
                      {deal.account && (
                        <p className="text-sm text-muted-foreground flex items-center mt-1">
                          <Building2 className="h-3 w-3 mr-1" />
                          {deal.account_id ? (
                            <span
                              className="hover:text-primary hover:underline cursor-pointer transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAccountView();
                              }}
                            >
                              {deal.account}
                            </span>
                          ) : (
                            deal.account
                          )}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right ml-4">
                      <div className="text-lg font-bold text-foreground">
                        {formatCurrency(deal.amount, deal.currency)}
                      </div>
                      {deal.probability !== null && deal.probability !== undefined && (
                        <div className="text-sm text-muted-foreground flex items-center justify-end">
                          <Percent className="h-3 w-3 mr-1" />
                          {deal.probability}%
                          {deal.probability_source === 'manual' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-amber-500 font-bold ml-0.5 cursor-help">*</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Manually set</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getStageColor(deal.stage)}>
                        {getStageName(deal.stage)}
                      </Badge>
                      
                      {/* Risk Indicator */}
                      {dealRisk && <RiskIndicator risk={dealRisk} />}
                      
                      {deal.closeDate && (
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDate(deal.closeDate)}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          openSlideStudio({ accountId: deal.account_id, dealId, dealName });
                        }}
                        className="gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Create Presentation"
                      >
                        <Presentation className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline text-xs font-medium">Slides</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onCoachDeal(deal)}
                        className="gap-1.5 bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 border border-purple-500/20"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                        <span className="hidden sm:inline text-xs font-medium">Analyze</span>
                        <span className="hidden lg:inline text-xs font-medium"> with AI</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(dealId)}
                        title="Delete Deal"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {deal.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {deal.description}
                    </p>
                  )}

                  {/* Next Steps Preview */}
                  {dealTasks?.[dealId]?.tasks?.length > 0 && (
                    <DealNextStepsPreview
                      tasks={dealTasks[dealId].tasks}
                      totalCount={dealTasks[dealId].totalCount}
                      onClick={() => onDealClick(deal)}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
