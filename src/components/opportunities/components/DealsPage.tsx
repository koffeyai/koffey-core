import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Search, Filter, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/hooks/use-toast';
import { useDialogStore } from '@/stores/dialogStore';
import { DeleteConfirmationDialog } from '@/components/common/DeleteConfirmationDialog';
import { PipelineMetricsCards } from './PipelineMetricsCards';
import { ModernDealsView } from './ModernDealsView';
import { usePipelineMetrics } from '../hooks/usePipelineMetrics';
import { useRoleBasedAccess } from '../hooks/useRoleBasedAccess';
import { useCRM } from '@/hooks/useCRM';
import { usePageContextSync } from '@/hooks/usePageContextSync';
import { useDealTasksPreview } from '@/hooks/useDealTasksPreview';

export interface Deal {
  id: string;
  dealName: string;
  amount: number;
  stage: string;
  probability: number;
  closeDate: string;
  account: string;
  nextAction: string;
  // Additional fields from database
  name?: string;
  currency?: string | null;
  close_date?: string | null;
  expected_close_date?: string | null;
  description?: string | null;
  created_at?: string;
  title?: string;
  stakeholders?: string;
  last_activity?: string;
  notes?: string;
  competitor_info?: string;
  timeline?: string;
  user_id?: string;
  account_id?: string | null;
  account_name?: string | null;
  accounts?: { id: string; name: string; domain?: string } | null;
}

interface DealsPageProps {
  onDealClick: (deal: Deal) => void;
  onCoachDeal?: (deal: Deal) => void;
}

const DEAL_STAGES = [
  'prospecting',
  'qualified',
  'proposal',
  'negotiation',
  'closed-won',
  'closed-lost'
];

export function DealsPage({ onDealClick, onCoachDeal }: DealsPageProps) {
  const { user } = useAuth();
  const { userRole } = useRoleBasedAccess();

  const normalizeStage = useCallback((stage: unknown): string => {
    if (typeof stage !== 'string') return 'prospecting';
    const normalized = stage.trim().toLowerCase()
      .replace('qualification', 'qualified')    // backend extraction uses 'qualification'
      .replace('closed_won', 'closed-won')      // DB uses underscore, frontend uses hyphen
      .replace('closed_lost', 'closed-lost');
    return DEAL_STAGES.includes(normalized as (typeof DEAL_STAGES)[number])
      ? normalized
      : 'prospecting';
  }, []);
  
  // Use unified CRM hook for data and mutations (syncs with store + emits analytics events)
  const { 
    entities: rawDeals, 
    loading: isLoading,
    createEntity,
    updateEntity,
    deleteEntity,
    bulkOperations,
    refresh: refreshDeals,
    isCreating,
    isUpdating,
    isDeleting,
    isBulkDeleting
  } = useCRM<any>('deals');

  // Transform deals to match component interface
  const deals = useMemo(
    () =>
      rawDeals.map((deal) => ({
        ...deal,
        id: deal.id,
        dealName: deal.name || deal.dealName || '',
        amount: Number(deal.amount) || 0,
        stage: normalizeStage(deal.stage),
        probability: Number(deal.probability) || 0,
        closeDate: deal.close_date || deal.expected_close_date || '',
        account: deal.accounts?.name || deal.account_name || '',
        account_name: deal.accounts?.name || deal.account_name || null,
        nextAction: deal.nextAction || '',
      })) as Deal[],
    [normalizeStage, rawDeals]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [closeBeforeFilter, setCloseBeforeFilter] = useState('');
  const [selectedDeals, setSelectedDeals] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [dealPendingDelete, setDealPendingDelete] = useState<Deal | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const { openCoachingDialog } = useDialogStore();
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    currency: 'USD',
    stage: 'prospecting',
    probability: '',
    close_date: '',
    expected_close_date: '',
    description: '',
    stakeholders: '',
    last_activity: '',
    notes: '',
    competitor_info: '',
    timeline: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const dealData = {
      name: formData.name,
      amount: formData.amount ? parseFloat(formData.amount) : null,
      currency: formData.currency,
      stage: formData.stage,
      probability: formData.probability ? parseInt(formData.probability) : null,
      close_date: formData.close_date || null,
      expected_close_date: formData.expected_close_date || null,
      description: formData.description || null,
    };

    try {
      if (editingDeal) {
        await updateEntity(editingDeal.id, dealData);
        toast({ title: 'Success', description: 'Deal updated successfully' });
      } else {
        await createEntity(dealData);
        toast({ title: 'Success', description: 'Deal created successfully' });
      }
      resetForm();
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || `Failed to ${editingDeal ? 'update' : 'create'} deal`, 
        variant: 'destructive' 
      });
    }
  };

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setFormData({
      name: deal.name || deal.dealName || '',
      amount: deal.amount?.toString() || '',
      currency: deal.currency || 'USD',
      stage: normalizeStage(deal.stage),
      probability: deal.probability?.toString() || '',
      close_date: deal.close_date || deal.closeDate || '',
      expected_close_date: deal.expected_close_date || '',
      description: deal.description || '',
      stakeholders: deal.stakeholders || '',
      last_activity: deal.last_activity || '',
      notes: deal.notes || '',
      competitor_info: deal.competitor_info || '',
      timeline: deal.timeline || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!dealPendingDelete) return;

    try {
      await deleteEntity(dealPendingDelete.id);
      toast({ title: 'Success', description: 'Deal deleted successfully' });
      setSelectedDeals(prev => prev.filter(id => id !== dealPendingDelete.id));
      setDealPendingDelete(null);
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete deal', 
        variant: 'destructive' 
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDeals.length === 0) return;

    try {
      await bulkOperations.delete(selectedDeals);
      setSelectedDeals([]);
      setIsBulkDeleteOpen(false);
    } catch {
      // Error toast is handled by useCRM.
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      currency: 'USD',
      stage: 'prospecting',
      probability: '',
      close_date: '',
      expected_close_date: '',
      description: '',
      stakeholders: '',
      last_activity: '',
      notes: '',
      competitor_info: '',
      timeline: ''
    });
    setEditingDeal(null);
    setIsDialogOpen(false);
  };

  const handleCoachDeal = (deal: Deal) => {
    if (onCoachDeal) {
      onCoachDeal(deal);
      return;
    }
    openCoachingDialog(deal);
  };

  const filteredDeals = deals.filter(deal => {
    const name = deal.dealName || deal.name || '';
    const stage = typeof deal.stage === 'string' ? deal.stage : '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stage.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = stageFilter === 'all' || stage === stageFilter;
    const minAmount = minAmountFilter ? Number(minAmountFilter) : null;
    const matchesMinAmount = minAmount === null || Number(deal.amount || 0) >= minAmount;
    const closeBefore = closeBeforeFilter ? new Date(closeBeforeFilter).getTime() : null;
    const dealCloseTime = deal.closeDate ? new Date(deal.closeDate).getTime() : null;
    const matchesCloseBefore = closeBefore === null || (dealCloseTime !== null && dealCloseTime <= closeBefore);
    return matchesSearch && matchesStage && matchesMinAmount && matchesCloseBefore;
  });

  const clearAdvancedFilters = () => {
    setMinAmountFilter('');
    setCloseBeforeFilter('');
  };

  const advancedFilterCount = [minAmountFilter, closeBeforeFilter].filter(Boolean).length;

  // Sync visible deals to ChatContext for AI page-awareness (debounced)
  const getDealName = useCallback((deal: Deal) => deal.dealName || deal.name || 'Untitled Deal', []);
  usePageContextSync({
    entityType: 'deals',
    entities: filteredDeals,
    getEntityName: getDealName,
    searchTerm,
  });

  const metrics = usePipelineMetrics(deals, selectedDeals);

  // Fetch next steps preview for visible deals
  const dealIds = useMemo(() => filteredDeals.map(d => d.id), [filteredDeals]);
  const { tasksByDeal } = useDealTasksPreview(dealIds);

  const handleDealSelect = (dealId: string, selected: boolean) => {
    setSelectedDeals(prev => 
      selected 
        ? (prev.includes(dealId) ? prev : [...prev, dealId])
        : prev.filter(id => id !== dealId)
    );
  };

  const handleSelectAll = () => {
    if (selectedDeals.length === filteredDeals.length) {
      setSelectedDeals([]);
    } else {
      setSelectedDeals(filteredDeals.map(deal => deal.id));
    }
  };

  // Currency formatting now uses shared utility - keeping unused function for backwards compat
  // import { formatCurrency } from '@/lib/formatters' if needed elsewhere

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'closed-won': return 'text-green-600';
      case 'closed-lost': return 'text-red-600';
      case 'negotiation': return 'text-yellow-600';
      case 'proposal': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const selectedDealRecords = deals.filter(deal => selectedDeals.includes(deal.id));
  const bulkDeleteEntityName = selectedDeals.length === 1
    ? selectedDealRecords[0]?.dealName || selectedDealRecords[0]?.name || 'Selected deal'
    : `${selectedDeals.length} selected deals`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Sales Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            {userRole.isManager 
              ? 'Manage your team\'s sales opportunities and track performance' 
              : 'Track your deals and hit your sales targets'
            }
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDeal ? 'Edit Deal' : 'Add New Deal'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Deal Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Acme Corp - Enterprise License"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tip: Don't include dates here — use the Close Date field instead
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="1"
                    placeholder="Enter amount in dollars"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
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
                        <SelectItem key={stage} value={stage}>
                          {stage.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="close_date">Expected Close Date</Label>
                <Input
                  id="close_date"
                  type="date"
                  value={formData.close_date}
                  onChange={(e) => setFormData({ ...formData, close_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit">{editingDeal ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Metrics */}
      <PipelineMetricsCards
        quotaAttainment={metrics.quotaAttainment}
        expectedEarnings={metrics.expectedEarnings}
        totalPipelineValue={metrics.totalPipelineValue}
        activeDealsCount={metrics.activeDealsCount}
        selectedDealsValue={metrics.selectedDealsValue}
        selectedCount={selectedDeals.length}
      />

      {/* Search and Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search deals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {DEAL_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stage.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default">
              <MoreHorizontal className="h-4 w-4 mr-2" />
              More Filters{advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium leading-none">Advanced filters</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Narrow the pipeline without leaving this view.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-amount-filter">Minimum amount</Label>
                <Input
                  id="min-amount-filter"
                  type="number"
                  min="0"
                  placeholder="e.g. 10000"
                  value={minAmountFilter}
                  onChange={(event) => setMinAmountFilter(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="close-before-filter">Closing before</Label>
                <Input
                  id="close-before-filter"
                  type="date"
                  value={closeBeforeFilter}
                  onChange={(event) => setCloseBeforeFilter(event.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearAdvancedFilters} disabled={advancedFilterCount === 0}>
                  Clear filters
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Deals List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-foreground">
              Deals ({filteredDeals.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
            >
              {selectedDeals.length === filteredDeals.length && filteredDeals.length > 0
                ? 'Deselect All'
                : 'Select All'
              }
            </Button>
          </div>
          {selectedDeals.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedDeals.length} deal{selectedDeals.length === 1 ? '' : 's'} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBulkDeleteOpen(true)}
                disabled={isBulkDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete selected
              </Button>
            </div>
          )}
        </div>

        <ModernDealsView
          deals={filteredDeals}
          selectedDeals={selectedDeals}
          onDealClick={onDealClick}
          onDealSelect={handleDealSelect}
          onEdit={handleEdit}
          onDelete={(dealId) => {
            const deal = deals.find((item) => item.id === dealId) || null;
            setDealPendingDelete(deal);
          }}
          onCoachDeal={handleCoachDeal}
          dealTasks={tasksByDeal}
        />
      </div>

      <DeleteConfirmationDialog
        open={!!dealPendingDelete}
        onOpenChange={(open) => !open && setDealPendingDelete(null)}
        onConfirm={handleDelete}
        title="Delete Deal"
        description="This will permanently delete the opportunity and record the operation in the audit log. Use stage changes for close-won or close-lost outcomes."
        entityName={dealPendingDelete?.dealName || dealPendingDelete?.name || ''}
        entityType="deal"
        requireConfirmation
      />

      <DeleteConfirmationDialog
        open={isBulkDeleteOpen}
        onOpenChange={setIsBulkDeleteOpen}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedDeals.length} deal${selectedDeals.length === 1 ? '' : 's'}`}
        description={`This will permanently delete ${selectedDeals.length} selected deal${selectedDeals.length === 1 ? '' : 's'} and record the operation in the audit log. Use stage changes for close-won or close-lost outcomes.`}
        entityName={bulkDeleteEntityName}
        entityType="deal"
        requireConfirmation
        confirmLabel={`Delete ${selectedDeals.length} deal${selectedDeals.length === 1 ? '' : 's'}`}
      />
    </div>
  );
}
