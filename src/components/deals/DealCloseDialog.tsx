import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Trophy, HeartCrack, ChevronDown, FileText, Calendar,
  RefreshCw, BarChart3, Loader2, Puzzle, Plus, X, AlertTriangle
} from 'lucide-react';
import { useDialogStore } from '@/stores/dialogStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';
import { useCRM } from '@/hooks/useCRM';
import type { ProductFeature, DealFeatureGap } from '@/types/product-catalog';

interface SelectedFeatureGap {
  feature_id: string | null;
  feature_name: string;
  impact_level: 'critical' | 'high' | 'medium' | 'low';
  was_dealbreaker: boolean;
  prospect_feedback: string;
}

const WIN_REASONS = ['Best Product Fit', 'Price/Value', 'Relationship', 'Champion Advocacy', 'Timing', 'Other'];
const LOSS_REASONS = ['Price Too High', 'Went With Competitor', 'No Budget', 'Champion Left', 'Bad Timing', 'Went Dark', 'Other'];
const CONTRACT_TYPES = [
  { value: 'one_time', label: 'One-Time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'multi_year', label: 'Multi-Year' },
  { value: 'custom', label: 'Custom' },
];

const DURATION_MAP: Record<string, number> = {
  monthly: 1,
  annual: 12,
  multi_year: 24,
};

export const DealCloseDialog: React.FC = () => {
  const {
    closeDialogOpen,
    closingDeal,
    closeTargetStage,
    pendingDealUpdates,
    closeCloseDialog,
  } = useDialogStore();

  const { updateEntity } = useCRM('deals');

  const [loading, setLoading] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [scheduleLossReview, setScheduleLossReview] = useState(false);

  // Feature gaps (for lost deals)
  const [showFeatureGaps, setShowFeatureGaps] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState<ProductFeature[]>([]);
  const [selectedFeatureGaps, setSelectedFeatureGaps] = useState<SelectedFeatureGap[]>([]);
  const [customFeatureName, setCustomFeatureName] = useState('');

  // Contract terms
  const [showTerms, setShowTerms] = useState(false);
  const [contractType, setContractType] = useState('one_time');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewalNoticeDays, setRenewalNoticeDays] = useState(90);
  const [qbrFrequency, setQbrFrequency] = useState(3);

  const isWon = closeTargetStage === 'closed-won';

  // Fetch available features when dialog opens
  useEffect(() => {
    if (closeDialogOpen && closingDeal?.organization_id) {
      fetchAvailableFeatures();
    }
  }, [closeDialogOpen, closingDeal?.organization_id]);

  const fetchAvailableFeatures = async () => {
    if (!closingDeal?.organization_id) return;
    try {
      const { data } = await supabase
        .from('product_features')
        .select('*')
        .eq('organization_id', closingDeal.organization_id)
        .in('status', ['available', 'beta', 'coming_soon'])
        .order('name');
      setAvailableFeatures((data || []) as unknown as ProductFeature[]);
    } catch (err) {
      console.error('Failed to fetch features:', err);
    }
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (closeDialogOpen) {
      setCloseReason('');
      setCloseNotes('');
      setCompetitorName('');
      setScheduleLossReview(false);
      setShowFeatureGaps(false);
      setSelectedFeatureGaps([]);
      setCustomFeatureName('');
      setShowTerms(false);
      setContractType('one_time');
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setEndDate('');
      setAutoRenew(false);
      setRenewalNoticeDays(90);
      setQbrFrequency(3);
    }
  }, [closeDialogOpen]);

  // Auto-calc end date when contract type or start date changes
  useEffect(() => {
    const months = DURATION_MAP[contractType];
    if (months && startDate) {
      setEndDate(format(addMonths(new Date(startDate), months), 'yyyy-MM-dd'));
    }
  }, [contractType, startDate]);

  const handleSubmit = async () => {
    if (!closingDeal || !closeTargetStage) return;
    setLoading(true);

    try {
      // 1. Update the deal with stage + close data
      const dealUpdates: any = {
        ...pendingDealUpdates,
        stage: closeTargetStage,
        close_reason: closeReason || null,
        close_notes: closeNotes || null,
      };

      if (!isWon && competitorName) {
        dealUpdates.competitor_name = competitorName;
      }

      await updateEntity(closingDeal.id, dealUpdates);

      // 2. Insert deal_terms if contract terms provided (won deals only)
      if (isWon && showTerms && contractType !== 'one_time') {
        const firstQbrDate = startDate
          ? format(addMonths(new Date(startDate), qbrFrequency), 'yyyy-MM-dd')
          : null;

        const { error: termsError } = await (supabase as any)
          .from('deal_terms')
          .insert({
            deal_id: closingDeal.id,
            organization_id: closingDeal.organization_id,
            contract_type: contractType,
            contract_start_date: startDate || null,
            contract_end_date: endDate || null,
            contract_duration_months: DURATION_MAP[contractType] || null,
            auto_renew: autoRenew,
            renewal_notice_days: renewalNoticeDays,
            renewal_status: 'not_due',
            renewal_owner_id: closingDeal.user_id,
            qbr_frequency_months: qbrFrequency,
            next_qbr_date: firstQbrDate,
          });

        if (termsError) {
          console.error('Failed to insert deal_terms:', termsError);
          // Non-blocking — deal is already updated
        }
      }

      // 3. Auto-create commission record for won deals
      if (isWon && closingDeal.amount > 0) {
        await createCommissionRecord(closingDeal);
      }

      // 4. Schedule loss review if requested
      if (!isWon && scheduleLossReview) {
        await (supabase as any)
          .from('suggested_actions')
          .insert({
            organization_id: closingDeal.organization_id,
            deal_id: closingDeal.id,
            action_type: 'loss_review',
            title: `Loss Review: ${closingDeal.name}`,
            description: `Schedule a loss review to understand why ${closingDeal.name} was lost. Reason: ${closeReason || 'Not specified'}.`,
            priority: 'medium',
            dedup_key: `loss_review:${closingDeal.id}`,
            confidence: 1.0,
            status: 'active',
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          });
      }

      // 5. Save feature gaps for product insights
      if (!isWon && selectedFeatureGaps.length > 0) {
        await saveFeatureGaps();
      }

      closeCloseDialog();
    } catch (error: any) {
      console.error('Deal close error:', error);
      toast.error(error.message || 'Failed to close deal');
    } finally {
      setLoading(false);
    }
  };

  const createCommissionRecord = async (deal: typeof closingDeal) => {
    if (!deal) return;

    try {
      // Look up active compensation assignment
      const { data: assignment } = await (supabase as any)
        .from('user_compensation_assignments')
        .select('*, compensation_plan:compensation_plans(*)')
        .eq('user_id', deal.user_id)
        .eq('organization_id', deal.organization_id)
        .is('end_date', null)
        .limit(1)
        .maybeSingle();

      if (!assignment?.compensation_plan) {
        console.log('No active compensation plan found for user');
        return;
      }

      const plan = assignment.compensation_plan;
      let rate = plan.base_commission_rate || 0.05;

      // Apply tiered rates if available
      const tiers = Array.isArray(plan.tiers) ? plan.tiers : [];
      for (const tier of tiers.sort((a: any, b: any) => (b.threshold || 0) - (a.threshold || 0))) {
        if (deal.amount >= (tier.threshold || 0)) {
          rate = tier.rate || rate;
          break;
        }
      }

      const commissionEarned = deal.amount * rate;

      const { error: commError } = await (supabase as any)
        .from('commission_records')
        .insert({
          user_id: deal.user_id,
          deal_id: deal.id,
          organization_id: deal.organization_id,
          deal_amount: deal.amount,
          commission_rate: rate,
          commission_earned: commissionEarned,
          status: 'pending',
        });

      if (commError) {
        console.error('Failed to create commission record:', commError);
      } else {
        toast.success(`Commission: $${commissionEarned.toLocaleString()} pending approval`);
      }
    } catch (err) {
      console.error('Commission calculation error:', err);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

  // Feature gap helpers
  const addFeatureGap = (feature: ProductFeature | null, customName?: string) => {
    const name = feature?.name || customName || '';
    if (!name || selectedFeatureGaps.some(g => g.feature_name === name)) return;

    setSelectedFeatureGaps([
      ...selectedFeatureGaps,
      {
        feature_id: feature?.id || null,
        feature_name: name,
        impact_level: 'medium',
        was_dealbreaker: false,
        prospect_feedback: '',
      },
    ]);
    setCustomFeatureName('');
  };

  const removeFeatureGap = (featureName: string) => {
    setSelectedFeatureGaps(selectedFeatureGaps.filter(g => g.feature_name !== featureName));
  };

  const updateFeatureGap = (featureName: string, updates: Partial<SelectedFeatureGap>) => {
    setSelectedFeatureGaps(
      selectedFeatureGaps.map(g =>
        g.feature_name === featureName ? { ...g, ...updates } : g
      )
    );
  };

  const saveFeatureGaps = async () => {
    if (!closingDeal || selectedFeatureGaps.length === 0) return;

    const gapsToInsert = selectedFeatureGaps.map(gap => ({
      organization_id: closingDeal.organization_id,
      deal_id: closingDeal.id,
      feature_id: gap.feature_id,
      feature_name: gap.feature_name,
      impact_level: gap.impact_level,
      was_dealbreaker: gap.was_dealbreaker,
      prospect_feedback: gap.prospect_feedback || null,
      attributed_amount: gap.was_dealbreaker
        ? closingDeal.amount
        : closingDeal.amount / selectedFeatureGaps.length,
    }));

    const { error } = await supabase
      .from('deal_feature_gaps')
      .insert(gapsToInsert);

    if (error) {
      console.error('Failed to save feature gaps:', error);
      // Non-blocking - deal is already updated
    } else {
      toast.success(`Captured ${selectedFeatureGaps.length} feature gap(s) for product insights`);
    }
  };

  if (!closingDeal || !closeTargetStage) return null;

  return (
    <Dialog open={closeDialogOpen} onOpenChange={(open) => !open && closeCloseDialog()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {isWon ? (
              <>
                <Trophy className="h-5 w-5 text-yellow-500" />
                Close Deal — Won! 🎉
              </>
            ) : (
              <>
                <HeartCrack className="h-5 w-5 text-muted-foreground" />
                Close Deal — Lost
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isWon
              ? `${closingDeal.name} — ${formatCurrency(closingDeal.amount)}`
              : `${closingDeal.name}${closingDeal.account_name ? ` · ${closingDeal.account_name}` : ''}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Reason chips */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{isWon ? 'Win Reason' : 'Loss Reason'}</Label>
            <div className="flex flex-wrap gap-2">
              {(isWon ? WIN_REASONS : LOSS_REASONS).map((reason) => (
                <Badge
                  key={reason}
                  variant={closeReason === reason ? 'default' : 'outline'}
                  className="cursor-pointer transition-colors hover:bg-accent"
                  onClick={() => setCloseReason(closeReason === reason ? '' : reason)}
                >
                  {reason}
                </Badge>
              ))}
            </div>
          </div>

          {/* Competitor name (loss only, conditional) */}
          {!isWon && closeReason === 'Went With Competitor' && (
            <div className="space-y-2">
              <Label htmlFor="competitor" className="text-sm font-medium">Competitor Name</Label>
              <Input
                id="competitor"
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
                placeholder="Who did they go with?"
              />
            </div>
          )}

          {/* Close notes */}
          <div className="space-y-2">
            <Label htmlFor="close-notes" className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Notes
            </Label>
            <Textarea
              id="close-notes"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder={isWon ? 'What made this deal successful?' : 'What can we learn from this?'}
              rows={3}
            />
          </div>

          {/* Contract Terms (won only) */}
          {isWon && (
            <Collapsible open={showTerms} onOpenChange={setShowTerms}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto font-medium text-sm">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Contract Terms
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showTerms ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3 px-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Contract Type</Label>
                    <Select value={contractType} onValueChange={setContractType}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TYPES.map((ct) => (
                          <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {contractType !== 'one_time' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">End Date</Label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Renewal Notice (days)</Label>
                        <Input
                          type="number"
                          value={renewalNoticeDays}
                          onChange={(e) => setRenewalNoticeDays(parseInt(e.target.value) || 90)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-3">
                        <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
                        <Label className="text-xs flex items-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Auto-Renew
                        </Label>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          <BarChart3 className="h-3.5 w-3.5" />
                          QBR Every (months)
                        </Label>
                        <Input
                          type="number"
                          value={qbrFrequency}
                          onChange={(e) => setQbrFrequency(parseInt(e.target.value) || 3)}
                          min={1}
                          max={12}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Feature Gaps (loss only) */}
          {!isWon && (
            <Collapsible open={showFeatureGaps} onOpenChange={setShowFeatureGaps}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto font-medium text-sm">
                  <span className="flex items-center gap-2">
                    <Puzzle className="h-4 w-4" />
                    Missing Features / Product Gaps
                    {selectedFeatureGaps.length > 0 && (
                      <Badge variant="secondary" className="ml-2">{selectedFeatureGaps.length}</Badge>
                    )}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showFeatureGaps ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3 px-1">
                <p className="text-xs text-muted-foreground">
                  Track which missing features contributed to this loss to help prioritize the product roadmap.
                </p>

                {/* Add from existing features */}
                {availableFeatures.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Add from catalog</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableFeatures
                        .filter(f => !selectedFeatureGaps.some(g => g.feature_id === f.id))
                        .slice(0, 10)
                        .map((feature) => (
                          <Badge
                            key={feature.id}
                            variant="outline"
                            className="cursor-pointer hover:bg-accent text-xs"
                            onClick={() => addFeatureGap(feature)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {feature.name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                {/* Add custom feature */}
                <div className="flex gap-2">
                  <Input
                    value={customFeatureName}
                    onChange={(e) => setCustomFeatureName(e.target.value)}
                    placeholder="Add custom feature request..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customFeatureName.trim()) {
                        e.preventDefault();
                        addFeatureGap(null, customFeatureName.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => customFeatureName.trim() && addFeatureGap(null, customFeatureName.trim())}
                    disabled={!customFeatureName.trim()}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Selected feature gaps */}
                {selectedFeatureGaps.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    {selectedFeatureGaps.map((gap) => (
                      <div key={gap.feature_name} className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{gap.feature_name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFeatureGap(gap.feature_name)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-3">
                          <Select
                            value={gap.impact_level}
                            onValueChange={(v) => updateFeatureGap(gap.feature_name, { impact_level: v as SelectedFeatureGap['impact_level'] })}
                          >
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="critical">Critical</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`dealbreaker-${gap.feature_name}`}
                              checked={gap.was_dealbreaker}
                              onCheckedChange={(v) => updateFeatureGap(gap.feature_name, { was_dealbreaker: v === true })}
                            />
                            <Label htmlFor={`dealbreaker-${gap.feature_name}`} className="text-xs cursor-pointer flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-orange-500" />
                              Dealbreaker
                            </Label>
                          </div>
                        </div>
                        <Input
                          value={gap.prospect_feedback}
                          onChange={(e) => updateFeatureGap(gap.feature_name, { prospect_feedback: e.target.value })}
                          placeholder="What did they say about this? (optional)"
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Loss review checkbox */}
          {!isWon && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="loss-review"
                checked={scheduleLossReview}
                onCheckedChange={(v) => setScheduleLossReview(v === true)}
              />
              <Label htmlFor="loss-review" className="text-sm cursor-pointer">
                Schedule a loss review
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeCloseDialog} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            variant={isWon ? 'default' : 'secondary'}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isWon ? 'Close the Deal 🏆' : 'Mark as Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
