import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Calendar, DollarSign, TrendingUp, Users, Clock, Building, FileText } from 'lucide-react';
import { Deal } from './DealsPage';
import { ProbabilitySource } from '@/lib/dealConstants';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { openChatPanelPrompt } from '@/lib/appNavigation';

interface DealWithSource extends Deal {
  probability_source?: ProbabilitySource;
}

interface AccountDetailPageProps {
  deal: DealWithSource;
  onBack: () => void;
}

export function AccountDetailPage({ deal, onBack }: AccountDetailPageProps) {
  const dealName = deal.dealName || deal.name || 'this deal';
  const dealContext = {
    source: 'deal_detail_quick_action',
    dealId: deal.id,
    dealName,
    account: deal.account || deal.account_name || null,
  };

  const normalizeStage = (stage: unknown): string => {
    if (typeof stage !== 'string') return 'prospecting';
    const normalized = stage.trim().toLowerCase();
    return normalized || 'prospecting';
  };

  const getStageColor = (stage: unknown) => {
    switch (normalizeStage(stage)) {
      case 'closed-won': return 'bg-green-100 text-green-800';
      case 'closed-lost': return 'bg-red-100 text-red-800';
      case 'negotiation': return 'bg-yellow-100 text-yellow-800';
      case 'proposal': return 'bg-blue-100 text-blue-800';
      case 'qualified': return 'bg-purple-100 text-purple-800';
      case 'prospecting': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const stageLabel = normalizeStage(deal.stage).replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline
        </Button>
        <div className="h-6 w-px bg-border" />
        <h1 className="text-2xl font-bold">Deal Details</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Deal Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{deal.dealName || deal.name || 'Untitled Deal'}</CardTitle>
                  <p className="text-muted-foreground mt-1">
                    {deal.account || 'No account specified'}
                  </p>
                </div>
                <Badge className={getStageColor(deal.stage)}>
                  {stageLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="font-semibold">{formatCurrency(deal.amount, deal.currency || null)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Probability</p>
                    <p className="font-semibold flex items-center">
                      {deal.probability ? `${deal.probability}%` : '-'}
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
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Close Date</p>
                    <p className="font-semibold">{formatDate(deal.closeDate || null)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-semibold">{formatDate(deal.created_at || null)}</p>
                  </div>
                </div>
              </div>

              {deal.description && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Description
                  </h3>
                  <p className="text-muted-foreground">{deal.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Details */}
          {(deal.stakeholders || deal.timeline || deal.competitor_info) && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {deal.stakeholders && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Stakeholders
                    </h4>
                    <p className="text-muted-foreground">{deal.stakeholders}</p>
                  </div>
                )}

                {deal.timeline && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Timeline
                    </h4>
                    <p className="text-muted-foreground">{deal.timeline}</p>
                  </div>
                )}

                {deal.competitor_info && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Competitive Information
                    </h4>
                    <p className="text-muted-foreground">{deal.competitor_info}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => openChatPanelPrompt(
                  `Help me update the stage for ${dealName}. Current stage: ${stageLabel}. Ask for any missing information before changing the opportunity.`,
                  { ...dealContext, action: 'update_stage' }
                )}
              >
                Update Stage
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => openChatPanelPrompt(
                  `Schedule a follow-up for ${dealName}. Use the opportunity context and ask for timing or contact details if they are missing.`,
                  { ...dealContext, action: 'schedule_follow_up' }
                )}
              >
                Schedule Follow-up
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => openChatPanelPrompt(
                  `Add a note to ${dealName}. Ask me for the note content, then categorize it into the right opportunity context.`,
                  { ...dealContext, action: 'add_note' }
                )}
              >
                Add Note
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => openChatPanelPrompt(
                  `Draft a proposal follow-up for ${dealName}. Include known deal context, amount ${formatCurrency(deal.amount, deal.currency || null)}, and ask for any missing buyer-specific details.`,
                  { ...dealContext, action: 'send_proposal' }
                )}
              >
                Send Proposal
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {deal.last_activity ? (
                <p className="text-sm text-muted-foreground">{deal.last_activity}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {deal.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{deal.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Next Action */}
          {deal.nextAction && (
            <Card>
              <CardHeader>
                <CardTitle>Next Action</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{deal.nextAction}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
