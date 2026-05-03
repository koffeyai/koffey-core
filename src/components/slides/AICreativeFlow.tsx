import React, { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles, 
  Search, 
  FileText, 
  Presentation, 
  BarChart3, 
  Users,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Check,
  Loader2,
  X,
  Building2,
  Briefcase,
  Clock,
  ChevronsUpDown,
  ChevronDown,
  AlertCircle,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCRM } from '@/hooks/useCRM';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { formatDistanceToNow } from 'date-fns';
import { 
  SlideTemplateType, 
  TEMPLATE_TYPE_LABELS, 
  SlidePersonalizationLevel,
  RECOMMENDED_TEMPLATES_BY_STAGE,
  DealStage
} from '@/types/slides';

interface AICreativeFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAccountId?: string;
  initialDealId?: string;
  initialContactId?: string;
}

interface EntityOption {
  type: 'account' | 'deal';
  id: string;
  name: string;
  accountId?: string;
  accountName?: string;
  stage?: string;
  lastActivity?: Date;
  amount?: number;
}

interface GeneratedSlide {
  index: number;
  type: string;
  layout: string;
  elements: Array<{
    type: string;
    role: string;
    content?: string;
    style?: string;
  }>;
}

interface GenerationResult {
  success: boolean;
  presentationId: string;
  downloadUrl: string;
  slideCount: number;
  generationTimeMs: number;
  slides: GeneratedSlide[];
  speakerNotes: Record<number, string>;
}

const PRESENTATION_TYPES: Array<{
  type: SlideTemplateType;
  icon: React.ReactNode;
  description: string;
}> = [
  { type: 'discovery', icon: <Search className="h-5 w-5" />, description: 'Intro & qualification' },
  { type: 'proposal', icon: <FileText className="h-5 w-5" />, description: 'Solution & pricing' },
  { type: 'qbr', icon: <BarChart3 className="h-5 w-5" />, description: 'Review & metrics' },
  { type: 'executive_summary', icon: <Users className="h-5 w-5" />, description: 'High-level overview' },
  { type: 'custom', icon: <Sparkles className="h-5 w-5" />, description: 'Custom content' },
];

// Normalize stage strings to our DealStage type
const normalizeStage = (stage?: string): DealStage | null => {
  if (!stage) return null;
  
  const normalized = stage.toLowerCase().replace(/[-\s]/g, '_');
  
  const stageMap: Record<string, DealStage> = {
    'prospecting': 'qualification',
    'qualified': 'qualification',
    'qualification': 'qualification',
    'discovery': 'discovery',
    'demo': 'discovery',
    'proposal': 'proposal',
    'quote': 'proposal',
    'pricing': 'proposal',
    'negotiation': 'negotiation',
    'contracting': 'negotiation',
    'closed_won': 'closed_won',
    'closed-won': 'closed_won',
    'won': 'closed_won',
    'closed_lost': 'closed_lost',
    'closed-lost': 'closed_lost',
    'lost': 'closed_lost'
  };
  
  return stageMap[normalized] || null;
};

// Auto-infer presentation type based on entity selection
const useSlideInference = (selectedEntity: EntityOption | null) => {
  return useMemo(() => {
    if (!selectedEntity) return null;
    
    const { type, stage, id, accountId } = selectedEntity;
    
    // If it's a deal, use stage-based inference
    if (type === 'deal' && stage) {
      const normalizedStage = normalizeStage(stage);
      
      if (normalizedStage) {
        const recommendedTypes = RECOMMENDED_TEMPLATES_BY_STAGE[normalizedStage];
        
        if (recommendedTypes && recommendedTypes.length > 0) {
          return {
            presentationType: recommendedTypes[0],
            confidence: 'high' as const,
            reasoning: `${stage} stage → ${TEMPLATE_TYPE_LABELS[recommendedTypes[0]]}`,
            accountId: accountId || '',
            dealId: id,
            personalizationLevel: 'deal' as SlidePersonalizationLevel
          };
        }
      }
      
      // Fallback for unknown stages
      return {
        presentationType: 'proposal' as SlideTemplateType,
        confidence: 'medium' as const,
        reasoning: 'Proposal deck for active deals',
        accountId: accountId || '',
        dealId: id,
        personalizationLevel: 'deal' as SlidePersonalizationLevel
      };
    }
    
    // Account-only selection defaults to discovery
    if (type === 'account') {
      return {
        presentationType: 'discovery' as SlideTemplateType,
        confidence: 'medium' as const,
        reasoning: 'Discovery deck for new engagement',
        accountId: id,
        personalizationLevel: 'account' as SlidePersonalizationLevel
      };
    }
    
    return null;
  }, [selectedEntity]);
};

export const AICreativeFlow: React.FC<AICreativeFlowProps> = ({
  open,
  onOpenChange,
  initialAccountId,
  initialDealId,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { organizationId, loading: orgLoading } = useOrganizationAccess();
  const queryClient = useQueryClient();

  // Fetch CRM data with loading states
  const { entities: accounts, loading: accountsLoading } = useCRM<any>('accounts');
  const { entities: deals, loading: dealsLoading } = useCRM<any>('deals');
  const { entities: activities } = useCRM<any>('activities');
  
  const isDataLoading = orgLoading || accountsLoading || dealsLoading;

  // UI state
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null);
  const [entityPopoverOpen, setEntityPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [presentationTypeOverride, setPresentationTypeOverride] = useState<SlideTemplateType | null>(null);
  
  // Generation state
  const [step, setStep] = useState<'input' | 'generating' | 'preview'>('input');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto-inference
  const inference = useSlideInference(selectedEntity);
  const effectivePresentationType = presentationTypeOverride || inference?.presentationType || 'proposal';

  // Build unified entity options with recency
  const entityOptions = useMemo(() => {
    const activityByAccount = new Map<string, Date>();
    const activityByDeal = new Map<string, Date>();
    
    // Build activity recency maps
    activities.forEach((activity: any) => {
      const date = new Date(activity.activity_date || activity.created_at);
      if (activity.account_id) {
        const existing = activityByAccount.get(activity.account_id);
        if (!existing || date > existing) {
          activityByAccount.set(activity.account_id, date);
        }
      }
      if (activity.deal_id) {
        const existing = activityByDeal.get(activity.deal_id);
        if (!existing || date > existing) {
          activityByDeal.set(activity.deal_id, date);
        }
      }
    });

    // Build deal options
    const dealOptions: EntityOption[] = deals.map((deal: any) => ({
      type: 'deal' as const,
      id: deal.id,
      name: deal.name,
      accountId: deal.account_id,
      accountName: accounts.find((a: any) => a.id === deal.account_id)?.name,
      stage: deal.stage,
      lastActivity: activityByDeal.get(deal.id) || new Date(deal.updated_at),
      amount: deal.amount
    }));

    // Build account options (excluding those with active deals shown)
    const accountsWithDeals = new Set(deals.map((d: any) => d.account_id));
    const accountOptions: EntityOption[] = accounts
      .filter((account: any) => !accountsWithDeals.has(account.id))
      .map((account: any) => ({
        type: 'account' as const,
        id: account.id,
        name: account.name,
        lastActivity: activityByAccount.get(account.id) || new Date(account.updated_at)
      }));

    // Combine and sort by recency
    const all = [...dealOptions, ...accountOptions].sort((a, b) => {
      const aTime = a.lastActivity?.getTime() || 0;
      const bTime = b.lastActivity?.getTime() || 0;
      return bTime - aTime;
    });

    // Filter by search if present
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      return all.filter(opt => 
        opt.name.toLowerCase().includes(lower) ||
        opt.accountName?.toLowerCase().includes(lower)
      );
    }

    return all;
  }, [accounts, deals, activities, searchQuery]);

  // Split into recent and others
  const { recentEntities, otherEntities } = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    return {
      recentEntities: entityOptions.filter(opt => opt.lastActivity && opt.lastActivity.getTime() > weekAgo).slice(0, 5),
      otherEntities: entityOptions.filter(opt => !opt.lastActivity || opt.lastActivity.getTime() <= weekAgo).slice(0, 10)
    };
  }, [entityOptions]);

  // Handle entity selection
  const handleSelectEntity = useCallback((entity: EntityOption) => {
    setSelectedEntity(entity);
    setEntityPopoverOpen(false);
    setSearchQuery('');
    setPresentationTypeOverride(null); // Reset override when entity changes
  }, []);

  // Generation mutation with retry logic
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user?.id || !inference) {
        throw new Error('Please select an account or deal first');
      }

      setStep('generating');
      setGenerationProgress(5);
      setProgressMessage('Creating presentation record...');

      // Progress simulation with realistic messages
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev >= 90) return prev;
          const increment = Math.random() * 12;
          const newProgress = Math.min(prev + increment, 90);
          
          if (newProgress < 20) setProgressMessage('Creating presentation record...');
          else if (newProgress < 35) setProgressMessage('Gathering account data...');
          else if (newProgress < 55) setProgressMessage('Generating slide content with AI...');
          else if (newProgress < 75) setProgressMessage('Building presentation structure...');
          else setProgressMessage('Uploading to storage...');
          
          return newProgress;
        });
      }, 600);

      try {
        const { data, error } = await supabase.functions.invoke('generate-ai-slides', {
          body: {
            organizationId,
            userId: user.id,
            presentationType: effectivePresentationType,
            customInstructions: customInstructions || undefined,
            personalizationLevel: inference.personalizationLevel,
            accountId: inference.accountId,
            dealId: inference.dealId,
          }
        });

        clearInterval(progressInterval);

        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Generation failed');

        setGenerationProgress(100);
        setProgressMessage('Complete!');
        
        return data as GenerationResult;
      } catch (err) {
        clearInterval(progressInterval);
        throw err;
      }
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 8000),
    onSuccess: (data) => {
      setResult(data);
      setStep('preview');
      queryClient.invalidateQueries({ queryKey: ['generated-presentations'] });
      toast({
        title: 'Presentation created!',
        description: `${data.slideCount} slides generated successfully`,
      });
    },
    onError: (error: Error & { presentationId?: string }) => {
      console.error('[AICreativeFlow] Generation error:', error);
      
      const isNetworkError = error.message.includes('fetch') || error.message.includes('network');
      const isTimeoutError = error.message.includes('timeout');
      
      toast({
        title: 'Generation Failed',
        description: isNetworkError 
          ? 'Network issue - check your connection and try again'
          : isTimeoutError
          ? 'Request timed out - please try again'
          : error.message || 'Something went wrong',
        variant: 'destructive',
        action: (
          <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()}>
            Retry
          </Button>
        )
      });
      
      setStep('input');
      setGenerationProgress(0);
      setProgressMessage('');
    }
  });

  // Reset state on close
  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      setSelectedEntity(null);
      setCustomInstructions('');
      setPresentationTypeOverride(null);
      setShowAdvanced(false);
      setStep('input');
      setResult(null);
      setCurrentSlide(0);
      setGenerationProgress(0);
    }, 300);
  }, [onOpenChange]);

  // Loading state render
  if (isDataLoading && open) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create with AI
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading your CRM data...</p>
            <div className="space-y-2 w-full max-w-xs">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Organization guard
  if (!organizationId && open) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create with AI
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium">Organization Required</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please select an organization to create presentations.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Empty state - no accounts
  if (accounts.length === 0 && !isDataLoading && open) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create with AI
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium">No accounts yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first account to create personalized presentations
              </p>
            </div>
            <Button onClick={() => {
              handleClose();
              window.dispatchEvent(new CustomEvent('open-add-account'));
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Generating step render
  const renderGeneratingStep = () => (
    <div className="space-y-6 py-8">
      <div className="text-center">
        <Sparkles className="h-12 w-12 mx-auto text-primary animate-pulse" />
        <h2 className="text-xl font-semibold mt-4">Generating your presentation...</h2>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <Progress value={generationProgress} className="h-2" />
        <p className="text-center text-muted-foreground">{progressMessage}</p>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {generationProgress > 10 ? <Check className="h-4 w-4 text-green-500" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            <span className={generationProgress > 10 ? 'text-foreground' : 'text-muted-foreground'}>
              Gathered context
            </span>
          </div>
          <div className="flex items-center gap-2">
            {generationProgress > 40 ? <Check className="h-4 w-4 text-green-500" /> : generationProgress > 10 ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4" />}
            <span className={generationProgress > 40 ? 'text-foreground' : 'text-muted-foreground'}>
              Analyzed data
            </span>
          </div>
          <div className="flex items-center gap-2">
            {generationProgress > 70 ? <Check className="h-4 w-4 text-green-500" /> : generationProgress > 40 ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4" />}
            <span className={generationProgress > 70 ? 'text-foreground' : 'text-muted-foreground'}>
              Generated content
            </span>
          </div>
          <div className="flex items-center gap-2">
            {generationProgress === 100 ? <Check className="h-4 w-4 text-green-500" /> : generationProgress > 70 ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-4 w-4" />}
            <span className={generationProgress === 100 ? 'text-foreground' : 'text-muted-foreground'}>
              Created slides
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // Preview step render
  const renderPreviewStep = () => {
    if (!result) return null;
    const currentSlideData = result.slides[currentSlide];
    const selectedAccount = accounts.find((a: any) => a.id === inference?.accountId);

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold">Presentation Ready!</h2>
          <p className="text-muted-foreground mt-1">
            {selectedAccount?.name} {TEMPLATE_TYPE_LABELS[effectivePresentationType]} - {result.slideCount} slides
          </p>
        </div>

        {/* Slide Preview */}
        <Card className="overflow-hidden">
          <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/10 relative flex items-center justify-center p-8">
            {currentSlideData && (
              <div className="text-center max-w-lg">
                {currentSlideData.elements.map((el, idx) => (
                  <div key={idx} className="mb-2">
                    {el.style === 'heading1' && (
                      <h1 className="text-2xl font-bold">{el.content}</h1>
                    )}
                    {el.style === 'heading2' && (
                      <h2 className="text-xl font-semibold">{el.content}</h2>
                    )}
                    {el.style === 'subtitle' && (
                      <p className="text-lg text-muted-foreground">{el.content}</p>
                    )}
                    {el.style === 'body' && (
                      <p className="text-sm">{el.content}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Slide Navigation */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            disabled={currentSlide === 0}
            onClick={() => setCurrentSlide(prev => prev - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex gap-1">
            {result.slides.slice(0, 10).map((_, idx) => (
              <button
                key={idx}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentSlide ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                onClick={() => setCurrentSlide(idx)}
              />
            ))}
            {result.slides.length > 10 && (
              <span className="text-xs text-muted-foreground ml-1">+{result.slides.length - 10}</span>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            disabled={currentSlide === result.slides.length - 1}
            onClick={() => setCurrentSlide(prev => prev + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Slide {currentSlide + 1} of {result.slides.length}
        </p>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={() => window.open(result.downloadUrl, '_blank')}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="outline" onClick={() => {
            setStep('input');
            setResult(null);
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Create Another
          </Button>
        </div>
      </div>
    );
  };

  // Main input step render
  const renderInputStep = () => (
    <div className="space-y-6">
      {/* Contextual Entity Search */}
      <div className="space-y-2">
        <Label>Who's this for?</Label>
        <Popover open={entityPopoverOpen} onOpenChange={setEntityPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={entityPopoverOpen}
              className="w-full justify-between h-12 text-left font-normal"
            >
              {selectedEntity ? (
                <div className="flex items-center gap-2 truncate">
                  {selectedEntity.type === 'deal' ? (
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{selectedEntity.name}</span>
                  {selectedEntity.accountName && (
                    <span className="text-muted-foreground truncate">
                      at {selectedEntity.accountName}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search accounts or deals...
                </span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0 bg-popover" align="start">
            <Command>
              <CommandInput 
                placeholder="Search accounts or deals..." 
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>No matches found.</CommandEmpty>
                
                {recentEntities.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentEntities.map(option => (
                      <CommandItem
                        key={`${option.type}-${option.id}`}
                        value={`${option.type}-${option.id}-${option.name}`}
                        onSelect={() => handleSelectEntity(option)}
                        className="flex items-center gap-3 py-3"
                      >
                        {option.type === 'deal' ? (
                          <Briefcase className="h-4 w-4 text-blue-500 shrink-0" />
                        ) : (
                          <Building2 className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{option.name}</p>
                          {option.accountName && (
                            <p className="text-xs text-muted-foreground truncate">
                              {option.accountName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {option.stage && (
                            <Badge variant="secondary" className="text-xs">
                              {option.stage}
                            </Badge>
                          )}
                          {option.lastActivity && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(option.lastActivity, { addSuffix: false })}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                
                {otherEntities.length > 0 && (
                  <CommandGroup heading={recentEntities.length > 0 ? "All" : "Accounts & Deals"}>
                    {otherEntities.map(option => (
                      <CommandItem
                        key={`${option.type}-${option.id}`}
                        value={`${option.type}-${option.id}-${option.name}`}
                        onSelect={() => handleSelectEntity(option)}
                        className="flex items-center gap-3 py-2"
                      >
                        {option.type === 'deal' ? (
                          <Briefcase className="h-4 w-4 text-blue-500 shrink-0" />
                        ) : (
                          <Building2 className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{option.name}</p>
                          {option.accountName && (
                            <p className="text-xs text-muted-foreground truncate">
                              {option.accountName}
                            </p>
                          )}
                        </div>
                        {option.stage && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {option.stage}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Auto-inferred settings */}
      {inference && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-medium">
                  {TEMPLATE_TYPE_LABELS[effectivePresentationType]}
                </Badge>
                {inference.confidence === 'high' && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Recommended
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs"
              >
                {showAdvanced ? 'Hide options' : 'Customize'}
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground mt-2">
              {inference.reasoning}
            </p>

            {/* Collapsed advanced options */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleContent className="pt-4 space-y-4">
                {/* Presentation type override */}
                <div className="space-y-2">
                  <Label className="text-xs">Presentation Type</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESENTATION_TYPES.map(({ type, icon }) => (
                      <Button
                        key={type}
                        variant={effectivePresentationType === type ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setPresentationTypeOverride(type)}
                        className="h-auto py-2"
                      >
                        {icon}
                        <span className="ml-1">{TEMPLATE_TYPE_LABELS[type]}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Custom instructions */}
                <div className="space-y-2">
                  <Label className="text-xs">Special Instructions (optional)</Label>
                  <Textarea
                    placeholder="e.g., Focus on ROI, include competitor comparison..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Generate button */}
      <Button 
        className="w-full h-12"
        disabled={!inference || generateMutation.isPending}
        onClick={() => generateMutation.mutate()}
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Presentation
          </>
        )}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create with AI
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {step === 'input' && renderInputStep()}
          {step === 'generating' && renderGeneratingStep()}
          {step === 'preview' && renderPreviewStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AICreativeFlow;
