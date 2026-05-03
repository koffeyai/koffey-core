import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  DollarSign, Calendar as CalendarIcon, TrendingUp, Building2, 
  Target, Percent, FileText, AlertCircle, CheckCircle2, Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { parseDateOnlyAsLocalDate } from '@/lib/formatters';
import { AccountCombobox } from './AccountCombobox';
import { useDialogStore } from '@/stores/dialogStore';
import { DEAL_STAGES, getDefaultProbability, ProbabilitySource } from '@/lib/dealConstants';

interface Deal {
  id?: string;
  name?: string;
  amount?: number;
  currency?: string;
  stage?: string;
  probability?: number;
  probability_source?: ProbabilitySource;
  close_date?: string;
  expected_close_date?: string;
  description?: string;
  account_id?: string;
  contact_id?: string;
  account_name?: string;
  contact_name?: string;
}

interface DealDialogProps {
  deal?: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (deal: Partial<Deal>) => Promise<void>;
  showValidation?: boolean;
}

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)', symbol: '$' },
  { value: 'EUR', label: 'EUR (€)', symbol: '€' },
  { value: 'GBP', label: 'GBP (£)', symbol: '£' },
  { value: 'CAD', label: 'CAD (C$)', symbol: 'C$' },
  { value: 'AUD', label: 'AUD (A$)', symbol: 'A$' }
];

export const DealDialog: React.FC<DealDialogProps> = ({
  deal,
  open,
  onOpenChange,
  onSave,
  showValidation = true
}) => {
  const parseSafeDate = (value?: string | null): Date | undefined => {
    return parseDateOnlyAsLocalDate(value) || undefined;
  };

  const { toast } = useToast();
  const { openAccountDialog, openCoachingDialog } = useDialogStore();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [hasManuallyEditedProbability, setHasManuallyEditedProbability] = useState(false);
  const [formData, setFormData] = useState<Partial<Deal>>({
    name: '',
    amount: 0,
    currency: 'USD',
    stage: 'prospecting',
    probability: 10,
    probability_source: 'stage_default',
    close_date: '',
    expected_close_date: '',
    description: '',
    account_id: '',
    contact_id: '',
    account_name: '',
    contact_name: ''
  });

  useEffect(() => {
    setHasManuallyEditedProbability(false);
    if (deal) {
      const dealStage = deal.stage || 'prospecting';
      setFormData({
        name: deal.name || '',
        amount: deal.amount || 0,
        currency: deal.currency || 'USD',
        stage: dealStage,
        probability: deal.probability ?? getDefaultProbability(dealStage),
        probability_source: deal.probability_source ?? 'stage_default',
        close_date: deal.close_date || deal.expected_close_date || '',
        expected_close_date: deal.expected_close_date || '',
        description: deal.description || '',
        account_id: deal.account_id || '',
        account_name: deal.account_name || '',
        contact_id: deal.contact_id || '',
        contact_name: deal.contact_name || ''
      });
      
      setSelectedDate(parseSafeDate(deal.close_date || deal.expected_close_date));
    } else {
      setFormData({
        name: '',
        amount: 0,
        currency: 'USD',
        stage: 'prospecting',
        probability: getDefaultProbability('prospecting'),
        probability_source: 'stage_default',
        close_date: '',
        expected_close_date: '',
        description: '',
        account_id: '',
        account_name: '',
        contact_id: '',
        contact_name: ''
      });
      setSelectedDate(undefined);
    }
    setValidationErrors({});
  }, [deal, open]);

  // Only auto-update probability on stage change if user hasn't manually edited
  // and the source is still stage_default (preserves existing manual overrides)
  useEffect(() => {
    if (hasManuallyEditedProbability) return;
    if (formData.probability_source === 'manual') return;
    
    const defaultProb = getDefaultProbability(formData.stage || 'prospecting');
    if (formData.probability !== defaultProb) {
      setFormData(prev => ({ 
        ...prev, 
        probability: defaultProb,
        probability_source: 'stage_default'
      }));
    }
  }, [formData.stage, hasManuallyEditedProbability, formData.probability_source]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.name || formData.name.trim().length < 3) {
      errors.name = 'Deal name is required and should be at least 3 characters.';
    }
    
    if (!formData.account_id) {
      errors.account_id = 'Please select or create an account for this deal.';
    }
    
    if (!formData.amount || formData.amount <= 0) {
      errors.amount = 'Deal amount must be greater than 0.';
    }
    
    if (formData.amount && formData.amount > 10000000) {
      errors.amount = 'Deal amount seems unusually large. Please verify.';
    }
    
    if (formData.probability !== undefined && (formData.probability < 0 || formData.probability > 100)) {
      errors.probability = 'Probability must be between 0 and 100.';
    }
    
    if (formData.stage === 'closed-won' && formData.probability !== 100) {
      errors.probability = 'Closed Won deals should have 100% probability.';
    }
    
    if (formData.stage === 'closed-lost' && formData.probability !== 0) {
      errors.probability = 'Closed Lost deals should have 0% probability.';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof Deal, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      const formattedDate = format(date, 'yyyy-MM-dd');
      handleInputChange('close_date', formattedDate);
      handleInputChange('expected_close_date', formattedDate);
    }
  };

  const handleStageChange = (stage: string) => {
    handleInputChange('stage', stage);
    // If source is still stage_default, update probability to match new stage
    if (formData.probability_source === 'stage_default' && !hasManuallyEditedProbability) {
      const defaultProb = getDefaultProbability(stage);
      setFormData(prev => ({ 
        ...prev, 
        stage,
        probability: defaultProb,
        probability_source: 'stage_default'
      }));
    }
  };

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: formData.currency || 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (showValidation && !validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the form errors below.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const dealData = {
        name: formData.name,
        amount: Number(formData.amount),
        ...(formData.currency && { currency: formData.currency }),
        ...(formData.stage && { stage: formData.stage }),
        ...(formData.probability !== undefined && { probability: Number(formData.probability) }),
        ...(formData.probability_source && { probability_source: formData.probability_source }),
        ...(formData.close_date && { close_date: formData.close_date }),
        ...(formData.expected_close_date && { expected_close_date: formData.expected_close_date }),
        ...(formData.description && { description: formData.description }),
        ...(formData.account_id && { account_id: formData.account_id }),
        ...(formData.contact_id && { contact_id: formData.contact_id })
      };

      await onSave(dealData);
      
      toast({
        title: "Success",
        description: `Deal ${deal ? 'updated' : 'created'} successfully.`,
        variant: "default"
      });
      
      onOpenChange(false);
    } catch (error: any) {
      console.error('Deal save error:', error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${deal ? 'update' : 'create'} deal.`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWithAI = useCallback(() => {
    if (!deal?.id) {
      toast({
        title: 'Save Deal First',
        description: 'Create this deal first, then run SCOUTPAD analysis.',
        variant: 'default'
      });
      return;
    }

    openCoachingDialog({
      id: deal.id,
      name: formData.name || deal.name,
      dealName: formData.name || deal.name,
      amount: Number(formData.amount) || deal.amount || 0,
      stage: formData.stage || deal.stage || 'prospecting',
      probability: typeof formData.probability === 'number' ? formData.probability : deal.probability,
      expected_close_date: formData.expected_close_date || formData.close_date || deal.expected_close_date,
      close_date: formData.close_date || deal.close_date,
      description: formData.description || deal.description,
      notes: formData.description || deal.description,
      account_id: formData.account_id || deal.account_id,
      account_name: formData.account_name || deal.account_name,
    });
  }, [deal, formData, openCoachingDialog, toast]);

  const selectedCurrency = CURRENCIES.find(c => c.value === formData.currency);
  const currentStage = DEAL_STAGES.find(s => s.value === formData.stage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {deal ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                Edit Deal
              </>
            ) : (
              <>
                <TrendingUp className="h-5 w-5 text-green-600" />
                Create Deal
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {validationErrors.general && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{validationErrors.general}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Deal Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4" />
                Deal Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="TechCorp Enterprise License Deal"
                className={validationErrors.name ? 'border-destructive' : ''}
                required
              />
              {validationErrors.name && (
                <p className="text-sm text-destructive">{validationErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4" />
                Account/Company <span className="text-destructive">*</span>
              </Label>
              <AccountCombobox
                value={formData.account_id || null}
                displayValue={formData.account_name || ''}
                onChange={(accountId, accountName) => {
                  handleInputChange('account_id', accountId);
                  handleInputChange('account_name', accountName);
                }}
                onCreateNew={(searchTerm) => {
                  openAccountDialog(undefined, searchTerm, (newAccountId, newAccountName) => {
                    handleInputChange('account_id', newAccountId);
                    handleInputChange('account_name', newAccountName);
                  });
                }}
                error={validationErrors.account_id}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount" className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4" />
                  Amount <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount || ''}
                    onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                    placeholder="50000"
                    className={`pl-8 ${validationErrors.amount ? 'border-destructive' : ''}`}
                    required
                  />
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                    {selectedCurrency?.symbol}
                  </span>
                </div>
                {formData.amount && formData.amount > 0 && (
                  <p className="text-sm text-green-600">{formatAmount(formData.amount)}</p>
                )}
                {validationErrors.amount && (
                  <p className="text-sm text-destructive">{validationErrors.amount}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-sm font-medium">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => handleInputChange('currency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="close_date" className="flex items-center gap-2 text-sm font-medium">
                  <CalendarIcon className="h-4 w-4" />
                  Expected Close Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Sales Progress</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stage" className="text-sm font-medium">Deal Stage</Label>
                <Select
                  value={formData.stage}
                  onValueChange={handleStageChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{stage.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {stage.probability}%
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentStage && (
                  <p className="text-sm text-muted-foreground">
                    Current stage: {currentStage.label}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="probability" className="flex items-center gap-2 text-sm font-medium">
                  <Percent className="h-4 w-4" />
                  Win Probability (%)
                  {formData.probability_source === 'manual' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-amber-500 font-bold cursor-help">*</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Manually set (stage default: {getDefaultProbability(formData.stage || 'prospecting')}%)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </Label>
                <Input
                  id="probability"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.probability || ''}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value) || 0;
                    setHasManuallyEditedProbability(true);
                    setFormData(prev => ({
                      ...prev,
                      probability: newValue,
                      probability_source: 'manual'
                    }));
                  }}
                  className={validationErrors.probability ? 'border-destructive' : ''}
                />
                {formData.probability_source === 'manual' && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={() => {
                      const defaultProb = getDefaultProbability(formData.stage || 'prospecting');
                      setFormData(prev => ({
                        ...prev,
                        probability: defaultProb,
                        probability_source: 'stage_default'
                      }));
                      setHasManuallyEditedProbability(false);
                    }}
                  >
                    Reset to stage default ({getDefaultProbability(formData.stage || 'prospecting')}%)
                  </Button>
                )}
                {validationErrors.probability && (
                  <p className="text-sm text-destructive">{validationErrors.probability}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Additional Details</h3>
            
            <div className="space-y-2">
              <Label htmlFor="description" className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of the deal, products/services involved, and key details..."
                rows={3}
              />
            </div>
          </div>

          {/* Read-only Contract Terms for existing closed-won deals */}
          {deal?.id && deal?.stage === 'closed-won' && <ContractTermsDisplay dealId={deal.id} />}

          <div className="flex flex-col-reverse gap-3 pt-4 border-t sm:flex-row sm:items-center sm:justify-between">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAnalyzeWithAI}
                      disabled={loading || !deal?.id}
                      className="w-full sm:w-auto"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analyze with AI
                    </Button>
                  </div>
                </TooltipTrigger>
                {!deal?.id && (
                  <TooltipContent>
                    <p>Create the deal first to run SCOUTPAD analysis.</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="min-w-[120px]"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                    Saving...
                  </div>
                ) : (
                  deal ? 'Update Deal' : 'Create Deal'
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Read-only contract terms component for closed-won deals
const ContractTermsDisplay: React.FC<{ dealId: string }> = ({ dealId }) => {
  const [terms, setTerms] = useState<any>(null);

  useEffect(() => {
    (supabase as any)
      .from('deal_terms')
      .select('*')
      .eq('deal_id', dealId)
      .maybeSingle()
      .then(({ data }: any) => setTerms(data));
  }, [dealId]);

  if (!terms) return null;

  return (
    <div className="space-y-3 rounded-md border p-4 bg-muted/50">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <CalendarIcon className="h-4 w-4" />
        Contract Terms
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><span className="text-muted-foreground">Type:</span> {terms.contract_type}</div>
        <div><span className="text-muted-foreground">Auto-renew:</span> {terms.auto_renew ? 'Yes' : 'No'}</div>
        {terms.contract_start_date && (
          <div><span className="text-muted-foreground">Start:</span> {terms.contract_start_date}</div>
        )}
        {terms.contract_end_date && (
          <div><span className="text-muted-foreground">End:</span> {terms.contract_end_date}</div>
        )}
        <div><span className="text-muted-foreground">Renewal notice:</span> {terms.renewal_notice_days}d</div>
        <div><span className="text-muted-foreground">QBR every:</span> {terms.qbr_frequency_months}mo</div>
        {terms.next_qbr_date && (
          <div><span className="text-muted-foreground">Next QBR:</span> {terms.next_qbr_date}</div>
        )}
        <div><span className="text-muted-foreground">Status:</span> {terms.renewal_status}</div>
      </div>
    </div>
  );
};
