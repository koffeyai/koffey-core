import React, { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Building, Globe, Phone, MapPin, FileText,
  DollarSign, TrendingUp, Calendar, Hash, Sparkles, Users,
  Cpu, Target, Lightbulb, Newspaper, MessageSquare, ExternalLink
} from 'lucide-react';
import { AccountWithDeals } from '@/hooks/useAccountsWithDeals';
import { queueDealDetailOpen } from '@/lib/dealDetailNavigation';

interface AccountDetailViewProps {
  account: AccountWithDeals;
  onBack: () => void;
}

interface DealRow {
  id: string;
  name: string;
  stage: string | null;
  amount: number | null;
  currency: string | null;
  probability: number | null;
  close_date: string | null;
  created_at: string;
}

const formatCurrency = (amount: number | null, currency?: string | null) => {
  if (!amount) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const stageColors: Record<string, string> = {
  prospecting: 'bg-muted text-muted-foreground',
  qualification: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  proposal: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  negotiation: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'closed-won': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'closed-lost': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const AccountDetailView: React.FC<AccountDetailViewProps> = ({ account, onBack }) => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const sd = account.scraped_data as Record<string, any> | null;

  const openOpportunity = useCallback((deal: DealRow) => {
    queueDealDetailOpen({
      dealId: deal.id,
      dealName: deal.name,
    });
  }, []);

  const handleOpportunityKeyDown = useCallback((event: React.KeyboardEvent, deal: DealRow) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openOpportunity(deal);
    }
  }, [openOpportunity]);

  // Fetch deals for this account
  const { data: deals, isLoading: dealsLoading } = useQuery<DealRow[]>({
    queryKey: ['account-deals', account.id, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, name, stage, amount, currency, probability, close_date, created_at')
        .eq('account_id', account.id)
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DealRow[];
    },
    enabled: !!organizationId,
  });

  const stats = useMemo(() => {
    if (!deals) return { total: 0, openValue: 0, wonValue: 0, avgProbability: 0 };
    const open = deals.filter(d => d.stage !== 'closed-won' && d.stage !== 'closed-lost');
    const won = deals.filter(d => d.stage === 'closed-won');
    const openValue = open.reduce((s, d) => s + (d.amount || 0), 0);
    const wonValue = won.reduce((s, d) => s + (d.amount || 0), 0);
    const probabilities = open.filter(d => d.probability != null).map(d => d.probability!);
    const avgProbability = probabilities.length > 0
      ? Math.round(probabilities.reduce((a, b) => a + b, 0) / probabilities.length)
      : 0;
    return { total: deals.length, openValue, wonValue, avgProbability };
  }, [deals]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Button>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{account.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="font-mono text-xs">
                <Hash className="h-3 w-3 mr-1" />
                {account.account_number}
              </Badge>
              {account.industry && <span>• {account.industry}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Info + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {account.website && (
              <div className="flex items-start gap-2">
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <a
                  href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {account.website.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </div>
            )}
            {account.phone && (
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <a href={`tel:${account.phone}`} className="hover:text-primary">{account.phone}</a>
              </div>
            )}
            {account.address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{account.address}</span>
              </div>
            )}
            {account.description && (
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-muted-foreground">{account.description}</p>
              </div>
            )}
            {sd?.employeeCount && (
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{sd.employeeCount} employees</span>
              </div>
            )}
            {sd?.foundedYear && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Founded {sd.foundedYear}</span>
              </div>
            )}
            {!account.website && !account.phone && !account.address && !account.description && !sd && (
              <p className="text-muted-foreground italic">No additional information recorded.</p>
            )}
            {account.enriched_at && (
              <p className="text-[11px] text-muted-foreground/50 pt-2 border-t border-border">
                Enriched {new Date(account.enriched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Opportunities</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{formatCurrency(stats.openValue)}</p>
              <p className="text-xs text-muted-foreground">Open Pipeline</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <DollarSign className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
              <p className="text-2xl font-bold">{formatCurrency(stats.wonValue)}</p>
              <p className="text-xs text-muted-foreground">Won Revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Calendar className="h-5 w-5 mx-auto text-orange-500 mb-1" />
              <p className="text-2xl font-bold">{stats.avgProbability}%</p>
              <p className="text-xs text-muted-foreground">Avg Probability</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Company Intelligence (from enrichment) */}
      {sd && Object.keys(sd).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Business Overview */}
          {(sd.businessModel || sd.revenueModel || sd.targetMarket || sd.valueProposition || sd.vertical || sd.companyStage || sd.fundingInfo) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Business Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {sd.vertical && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vertical</span>
                    <p className="text-foreground mt-0.5">{sd.vertical}</p>
                  </div>
                )}
                {sd.businessModel && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Business Model</span>
                    <p className="text-foreground mt-0.5">{sd.businessModel}</p>
                  </div>
                )}
                {sd.revenueModel && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revenue Model</span>
                    <p className="text-foreground mt-0.5">{sd.revenueModel}</p>
                  </div>
                )}
                {sd.targetMarket && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Market</span>
                    <p className="text-foreground mt-0.5">{sd.targetMarket}</p>
                  </div>
                )}
                {sd.valueProposition && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Value Proposition</span>
                    <p className="text-foreground mt-0.5">{sd.valueProposition}</p>
                  </div>
                )}
                {sd.companyStage && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stage</span>
                    <p className="text-foreground mt-0.5">{sd.companyStage}</p>
                  </div>
                )}
                {sd.fundingInfo && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Funding</span>
                    <p className="text-foreground mt-0.5">{sd.fundingInfo}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tech Stack & Competitors */}
          {(sd.techStack?.length > 0 || sd.competitorAnalysis?.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  Tech & Competitive Intel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {sd.techStack?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tech Stack</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {sd.techStack.map((tech: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{tech}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {sd.competitorAnalysis?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Competitors</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {sd.competitorAnalysis.map((comp: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{comp}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Key Personnel */}
          {sd.keyPersonnel?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Key Personnel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {sd.keyPersonnel.map((person: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="font-medium text-foreground">{person.name}</span>
                    <span className="text-xs text-muted-foreground">{person.title || person.role}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pain Points & Conversation Starters */}
          {(sd.painPoints?.length > 0 || sd.conversationStarters?.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Sales Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {sd.painPoints?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pain Points</span>
                    <ul className="mt-1 space-y-1">
                      {sd.painPoints.map((point: string, i: number) => (
                        <li key={i} className="text-muted-foreground flex items-start gap-1.5">
                          <Target className="h-3 w-3 mt-0.5 text-red-400 shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {sd.conversationStarters?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conversation Starters</span>
                    <ul className="mt-1 space-y-1">
                      {sd.conversationStarters.map((starter: string, i: number) => (
                        <li key={i} className="text-muted-foreground flex items-start gap-1.5">
                          <MessageSquare className="h-3 w-3 mt-0.5 text-blue-400 shrink-0" />
                          {starter}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* News Highlights */}
          {sd.newsHighlights?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Newspaper className="h-4 w-4 text-primary" />
                  Recent News
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {sd.newsHighlights.map((news: string, i: number) => (
                  <p key={i} className="text-muted-foreground">{news}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Opportunities Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Opportunities ({deals?.length || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dealsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : deals && deals.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden md:table-cell text-center">Probability</TableHead>
                  <TableHead className="hidden md:table-cell">Close Date</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="w-[96px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open opportunity ${deal.name}`}
                    onClick={() => openOpportunity(deal)}
                    onKeyDown={(event) => handleOpportunityKeyDown(event, deal)}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <TableCell className="font-medium">{deal.name}</TableCell>
                    <TableCell>
                      <Badge className={stageColors[deal.stage || ''] || 'bg-muted text-muted-foreground'}>
                        {(deal.stage || 'unknown').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(deal.amount, deal.currency)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center">
                      {deal.probability != null ? (
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-12 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, deal.probability)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{deal.probability}%</span>
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(deal.close_date)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(deal.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          openOpportunity(deal);
                        }}
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No opportunities linked to this account yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
