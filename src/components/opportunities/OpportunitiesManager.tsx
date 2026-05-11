import React, { useState, useEffect } from 'react';
import { DealsPage, Deal } from './components/DealsPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCRM } from '@/hooks/useCRM';
import { toast } from 'sonner';
import { DealTasksSection } from '@/components/deals/DealTasksSection';
import { DealNotesSection } from '@/components/deals/DealNotesSection';
import { DealSummarySection } from '@/components/deals/DealSummarySection';
import { DealContactsManager } from '@/components/deals/DealContactsManager';
import { DealSourcesAndFilesSection } from '@/components/deals/DealSourcesAndFilesSection';
import { SimplifiedCoachingPanel } from '@/components/deals/SimplifiedCoachingPanel';
import { ClipboardList, FileText, LayoutDashboard, Archive, Building2, Plus, Sparkles } from 'lucide-react';
import { useSourceDocuments } from '@/hooks/useSourceDocuments';
import { useDealAttachments } from '@/hooks/useDealAttachments';
import { useDialogStore } from '@/stores/dialogStore';
import { supabase } from '@/integrations/supabase/client';
import { DealCoachingResult, DealData } from '@/services/dealCoachingService';
import { openAccountView } from '@/lib/appNavigation';
import {
  PENDING_DEAL_DETAIL_KEY,
  PENDING_DEAL_MAX_AGE_MS,
  buildDealLookupCandidates,
} from '@/lib/dealDetailNavigation';

interface OpportunitiesManagerProps {
  embedded?: boolean;
  hideActions?: boolean;
}

const DEAL_STAGES = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed-won', label: 'Closed Won' },
  { value: 'closed-lost', label: 'Closed Lost' },
];

export default function OpportunitiesManager({ 
  embedded = false, 
  hideActions = false 
}: OpportunitiesManagerProps) {
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCoachingOpen, setIsCoachingOpen] = useState(false);
  const [coachingDeal, setCoachingDeal] = useState<DealData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Form state for editing
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    stage: 'prospecting',
    probability: '',
    close_date: '',
    description: '',
    key_use_case: '',
    products_positioned: [] as string[],
  });

  const { updateEntity } = useCRM<any>('deals');
  const { documents: sourceDocuments } = useSourceDocuments({ dealId: selectedDeal?.id || null });
  const { attachments } = useDealAttachments(selectedDeal?.id || null);
  const sourcesAndFilesCount = sourceDocuments.length + attachments.length;

  // Populate form when deal is selected
  useEffect(() => {
    if (selectedDeal) {
      setFormData({
        name: selectedDeal.name || selectedDeal.dealName || '',
        amount: selectedDeal.amount?.toString() || '',
        stage: selectedDeal.stage || 'prospecting',
        probability: selectedDeal.probability?.toString() || '',
        close_date: selectedDeal.close_date || selectedDeal.closeDate || '',
        description: selectedDeal.description || '',
        key_use_case: (selectedDeal as any).key_use_case || '',
        products_positioned: (selectedDeal as any).products_positioned || [],
      });
      setActiveTab('overview');
    }
  }, [selectedDeal]);

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsDetailOpen(true);
  };

  const openDealDetail = (deal: Deal) => {
    if (!deal) return;
    setSelectedDeal(deal);
    setActiveTab('overview');
    setIsDetailOpen(true);
  };

  const fetchDealForDetail = async (dealId?: string, dealName?: string): Promise<Deal | null> => {
    if (!dealId && !dealName) return null;
    try {
      if (dealId) {
        const { data, error } = await supabase
          .from('deals')
          .select('*, accounts(id, name, domain)')
          .eq('id', dealId)
          .maybeSingle();
        if (!error && data) {
          return {
            ...data,
            close_date: (data as any).close_date || (data as any).expected_close_date || '',
            account_name: (data as any).account_name || (data as any).accounts?.name || '',
          } as any;
        }
      }

      if (dealName) {
        for (const candidate of buildDealLookupCandidates(dealName)) {
          const { data, error } = await supabase
            .from('deals')
            .select('*, accounts(id, name, domain)')
            .ilike('name', `%${candidate}%`)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (!error && Array.isArray(data) && data.length > 0) {
            const row = data[0] as any;
            return {
              ...row,
              close_date: row.close_date || row.expected_close_date || '',
              account_name: row.account_name || row.accounts?.name || '',
            } as any;
          }
        }
      }
    } catch (err) {
      console.error('[OpportunitiesManager] Failed to fetch deal for detail open:', err);
    }
    return null;
  };

  useEffect(() => {
    const openFromPayload = async (detail?: { deal?: Deal; dealId?: string; dealName?: string }) => {
      const directDeal = detail?.deal;
      if (directDeal?.id) {
        openDealDetail(directDeal);
        return;
      }

      const fetched = await fetchDealForDetail(detail?.dealId, detail?.dealName);
      if (fetched) openDealDetail(fetched);
    };

    // Consume pending payload from sessionStorage (set by App-level handler).
    const pendingRaw = sessionStorage.getItem(PENDING_DEAL_DETAIL_KEY);
    if (pendingRaw) {
      try {
        const parsed = JSON.parse(pendingRaw) as { ts?: number; deal?: Deal; dealId?: string; dealName?: string };
        if (parsed?.ts && (Date.now() - parsed.ts) <= PENDING_DEAL_MAX_AGE_MS) {
          if (parsed.deal) {
            openDealDetail(parsed.deal);
          } else if (parsed.dealId || parsed.dealName) {
            void openFromPayload({ dealId: parsed.dealId, dealName: parsed.dealName });
          }
        }
      } catch (err) {
        console.warn('[OpportunitiesManager] Invalid pending deal payload:', err);
      } finally {
        sessionStorage.removeItem(PENDING_DEAL_DETAIL_KEY);
      }
    }

    const handleOpenDetail = (event: Event) => {
      const detail = (event as CustomEvent).detail as { deal?: Deal; dealId?: string; dealName?: string } | undefined;
      void openFromPayload(detail);
    };

    window.addEventListener('open-opportunity-deal-detail', handleOpenDetail);
    return () => {
      window.removeEventListener('open-opportunity-deal-detail', handleOpenDetail);
    };
  }, []);

  const handleSave = async () => {
    if (!selectedDeal) return;
    
    setIsSaving(true);
    try {
      await updateEntity(selectedDeal.id, {
        name: formData.name,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        stage: formData.stage,
        probability: formData.probability ? parseInt(formData.probability) : null,
        close_date: formData.close_date || null,
        description: formData.description || null,
        key_use_case: formData.key_use_case || null,
        products_positioned: formData.products_positioned.length > 0 ? formData.products_positioned : null,
      });
      toast.success('Deal updated successfully');
      setIsDetailOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update deal');
    } finally {
      setIsSaving(false);
    }
  };

  const toCoachingDeal = (deal: Deal, overrides?: typeof formData): DealData => {
    const amount = overrides?.amount ? Number(overrides.amount) : Number(deal.amount || 0);
    const probability = overrides?.probability ? Number(overrides.probability) : Number(deal.probability || 0);
    const accountName =
      (deal as any)?.accounts?.name ||
      (deal as any)?.account_name ||
      (deal as any)?.account?.name ||
      deal.account ||
      '';

    return {
      id: deal.id,
      organizationId: (deal as any)?.organization_id || (deal as any)?.organizationId,
      name: overrides?.name || deal.name || deal.dealName || 'Untitled Deal',
      dealSize: Number.isFinite(amount) ? amount : 0,
      stage: overrides?.stage || deal.stage || 'prospecting',
      probability: Number.isFinite(probability) ? probability : undefined,
      closeDate: overrides?.close_date || deal.close_date || deal.closeDate || '',
      description: overrides?.description || deal.description || undefined,
      notes: overrides?.description || deal.description || deal.notes || undefined,
      accountName: accountName || undefined,
      stakeholders: deal.stakeholders || undefined,
      lastActivity: deal.last_activity || undefined,
      competitorInfo: deal.competitor_info || undefined,
      timeline: deal.timeline || undefined,
    };
  };

  const openScoutpadAnalysis = (deal: Deal, overrides?: typeof formData) => {
    if (!deal?.id) {
      toast.error('Save this deal first, then run SCOUTPAD analysis.');
      return;
    }

    setCoachingDeal(toCoachingDeal(deal, overrides));
    setIsDetailOpen(false);
    setIsCoachingOpen(true);
  };

  const handleAnalyzeWithAI = () => {
    if (selectedDeal) openScoutpadAnalysis(selectedDeal, formData);
  };

  // Mock key contacts - in production, fetch from contacts linked to deal
  const keyContacts = (selectedDeal as any)?.contact_id 
    ? [{ name: 'Contact Name', role: 'Role' }] 
    : [];

  return (
    <>
      <DealsPage onDealClick={handleDealClick} onCoachDeal={(deal) => openScoutpadAnalysis(deal)} />
      
      {/* Deal Edit Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-xl">
              {selectedDeal?.name || 'Edit Deal'}
            </DialogTitle>
            {(() => {
              const accountName = (selectedDeal as any)?.accounts?.name || (selectedDeal as any)?.account_name || (selectedDeal as any)?.account?.name;
              const accountId = (selectedDeal as any)?.account_id;
              if (accountId && accountName) {
                return (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    <Building2 className="h-3.5 w-3.5" />
                    <span
                      className="hover:text-primary hover:underline cursor-pointer transition-colors"
                      onClick={() => {
                        setIsDetailOpen(false);
                        openAccountView();
                      }}
                    >
                      {accountName}
                    </span>
                  </p>
                );
              }
              // No linked account — offer to create one
              return (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {accountName ? (
                    <>
                      <span>{accountName}</span>
                      <span className="text-muted-foreground/50">·</span>
                    </>
                  ) : null}
                  <span
                    className="text-primary hover:underline cursor-pointer transition-colors inline-flex items-center gap-0.5"
                    onClick={() => {
                      const { openAccountDialog } = useDialogStore.getState();
                      openAccountDialog(undefined, accountName || '', (newAccountId, newAccountName) => {
                        // Link the new account to this deal
                        updateEntity(selectedDeal!.id, { account_id: newAccountId, account_name: newAccountName })
                          .then(() => {
                            toast.success(`Linked to ${newAccountName}`);
                            // Update local state so the header refreshes
                            setSelectedDeal(prev => prev ? { ...prev, account_id: newAccountId, account_name: newAccountName } as any : null);
                          })
                          .catch(() => toast.error('Failed to link account'));
                      });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    {accountName ? 'Create Account' : 'Add Account'}
                  </span>
                </p>
              );
            })()}
          </DialogHeader>
          
          {selectedDeal && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-6 border-b border-border">
                <TabsList className="h-10 p-0 bg-transparent gap-4">
                  <TabsTrigger 
                    value="overview" 
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3"
                  >
                    <LayoutDashboard className="h-4 w-4 mr-1.5" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger 
                    value="summary"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    Summary
                  </TabsTrigger>
                  <TabsTrigger 
                    value="next-steps"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3"
                  >
                    <ClipboardList className="h-4 w-4 mr-1.5" />
                    Next Steps
                  </TabsTrigger>
                  <TabsTrigger 
                    value="notes"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    Notes
                  </TabsTrigger>
                  <TabsTrigger
                    value="sources-files"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3"
                  >
                    <Archive className="h-4 w-4 mr-1.5" />
                    Sources & Files
                    {sourcesAndFilesCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {sourcesAndFilesCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6">
                  <TabsContent value="overview" className="mt-0 space-y-4">
                    <div>
                      <Label htmlFor="name">Deal Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter deal name"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="amount">Amount ($)</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label htmlFor="probability">Probability (%)</Label>
                        <Input
                          id="probability"
                          type="number"
                          min="0"
                          max="100"
                          value={formData.probability}
                          onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="stage">Stage</Label>
                        <Select value={formData.stage} onValueChange={(value) => setFormData({ ...formData, stage: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEAL_STAGES.map((stage) => (
                              <SelectItem key={stage.value} value={stage.value}>
                                {stage.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="close_date">Close Date</Label>
                        <Input
                          id="close_date"
                          type="date"
                          value={formData.close_date}
                          onChange={(e) => setFormData({ ...formData, close_date: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Add notes about this deal..."
                        rows={3}
                      />
                    </div>

                    {/* Stakeholders Section */}
                    <div className="pt-4 border-t border-border">
                      <DealContactsManager
                        dealId={selectedDeal.id}
                        accountId={(selectedDeal as any).account_id}
                        accountName={(selectedDeal as any).accounts?.name || (selectedDeal as any).account_name || (selectedDeal as any).account?.name}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="summary" className="mt-0">
                    <DealSummarySection
                      keyUseCase={formData.key_use_case}
                      productsPositioned={formData.products_positioned}
                      onKeyUseCaseChange={(value) => setFormData({ ...formData, key_use_case: value })}
                      onProductsChange={(products) => setFormData({ ...formData, products_positioned: products })}
                    />
                  </TabsContent>

                  <TabsContent value="next-steps" className="mt-0">
                    <DealTasksSection dealId={selectedDeal.id} />
                  </TabsContent>

                  <TabsContent value="notes" className="mt-0">
                    <DealNotesSection dealId={selectedDeal.id} />
                  </TabsContent>

                  <TabsContent value="sources-files" className="mt-0">
                    <DealSourcesAndFilesSection dealId={selectedDeal.id} />
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          )}

          <DialogFooter className="px-6 py-4 border-t border-border flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={handleAnalyzeWithAI}
              disabled={!selectedDeal?.id}
              className="w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Analyze with AI
            </Button>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCoachingOpen}
        onOpenChange={(open) => {
          setIsCoachingOpen(open);
          if (!open) setCoachingDeal(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {coachingDeal?.name || 'Deal'} - SCOUTPAD Analysis
            </DialogTitle>
          </DialogHeader>
          {coachingDeal && (
            <SimplifiedCoachingPanel
              deal={coachingDeal}
              dealId={coachingDeal.id}
              onCoachingUpdate={(_coaching: DealCoachingResult) => undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
