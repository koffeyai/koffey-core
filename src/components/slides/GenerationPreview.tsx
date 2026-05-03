import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, Sparkles, ArrowLeft, ArrowRight, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { SlideTemplate, TemplateSlotMapping } from '@/types/slides';

interface GenerationPreviewProps {
  template: SlideTemplate;
  accountId: string;
  dealId?: string;
  contactId?: string;
  organizationId: string;
  onBack: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

interface SlotPreview {
  slotName: string;
  mappingType: 'direct' | 'ai_generated' | 'static';
  resolvedValue?: string;
  isAiSlot: boolean;
  aiPrompt?: string;
  dataSource?: string;
  hasValue: boolean;
  isPreviewingAi?: boolean;
  aiPreview?: string;
}

interface ContextData {
  [key: string]: string | number | null;
}

export function GenerationPreview({
  template,
  accountId,
  dealId,
  contactId,
  organizationId,
  onBack,
  onGenerate,
  isGenerating
}: GenerationPreviewProps) {
  const [contextData, setContextData] = useState<ContextData>({});
  const [mappings, setMappings] = useState<TemplateSlotMapping[]>([]);
  const [slotPreviews, setSlotPreviews] = useState<SlotPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewingSlotId, setPreviewingSlotId] = useState<string | null>(null);

  useEffect(() => {
    loadPreviewData();
  }, [template.id, accountId, dealId, contactId]);

  async function loadPreviewData() {
    setIsLoading(true);
    try {
      // Fetch mappings
      const { data: mappingsData } = await supabase
        .from('template_slot_mappings')
        .select('*')
        .eq('template_id', template.id)
        .order('slide_index', { ascending: true })
        .order('display_order', { ascending: true });

      const fetchedMappings = (mappingsData || []) as unknown as TemplateSlotMapping[];
      setMappings(fetchedMappings);

      // Fetch context data
      const context: ContextData = {};

      // Fetch account
      const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (account) {
        context['account.name'] = account.name;
        context['account.industry'] = account.industry;
        context['account.website'] = account.website;
        context['account.domain'] = account.domain;
        context['account.phone'] = account.phone;
        context['account.address'] = account.address;
        context['account.description'] = account.description;
      }

      // Fetch deal if provided
      if (dealId) {
        const { data: deal } = await supabase
          .from('deals')
          .select('*')
          .eq('id', dealId)
          .single();

        if (deal) {
          context['deal.name'] = deal.name;
          context['deal.amount'] = deal.amount;
          context['deal.stage'] = deal.stage;
          context['deal.probability'] = deal.probability;
          context['deal.expected_close_date'] = deal.expected_close_date;
          context['deal.description'] = deal.description;
          context['deal.key_use_case'] = deal.key_use_case;
          context['deal.products_positioned'] = deal.products_positioned?.join(', ') || null;
        }
      }

      // Fetch contact if provided
      if (contactId) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', contactId)
          .single();

        if (contact) {
          context['contact.full_name'] = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
          context['contact.first_name'] = contact.first_name;
          context['contact.last_name'] = contact.last_name;
          context['contact.email'] = contact.email;
          context['contact.phone'] = contact.phone;
          context['contact.title'] = contact.title || contact.position;
          context['contact.company'] = contact.company;
          context['contact.linkedin_url'] = contact.linkedin_url;
        }
      }

      // Add computed values
      context['computed.today'] = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      context['computed.quarter'] = `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

      setContextData(context);

      // Build slot previews
      const previews: SlotPreview[] = fetchedMappings.map((mapping) => {
        const isAiSlot = mapping.mapping_type === 'ai_generated';
        let resolvedValue: string | undefined;
        let hasValue = true;

        if (mapping.mapping_type === 'direct' && mapping.data_source) {
          resolvedValue = String(context[mapping.data_source] || '');
          hasValue = !!resolvedValue;
        } else if (mapping.mapping_type === 'static') {
          resolvedValue = mapping.fallback_value || '';
          hasValue = !!resolvedValue;
        } else if (isAiSlot) {
          resolvedValue = undefined; // Will be generated
          hasValue = true;
        }

        return {
          slotName: mapping.slot_name,
          mappingType: mapping.mapping_type as 'direct' | 'ai_generated' | 'static',
          resolvedValue,
          isAiSlot,
          aiPrompt: mapping.ai_prompt,
          dataSource: mapping.data_source,
          hasValue
        };
      });

      setSlotPreviews(previews);
    } catch (error) {
      console.error('Error loading preview data:', error);
      toast.error('Failed to load preview data');
    } finally {
      setIsLoading(false);
    }
  }

  async function previewAiOutput(slotName: string, aiPrompt: string) {
    setPreviewingSlotId(slotName);
    
    try {
      // Interpolate prompt with context
      const interpolatedPrompt = aiPrompt.replace(/\{([^}]+)\}/g, (match, key) => {
        return String(contextData[key] || match);
      });

      const { data, error } = await supabase.functions.invoke('unified-chat', {
        body: {
          message: interpolatedPrompt,
          organizationId,
          conversationId: null,
          mode: 'quick'
        }
      });

      if (error) throw error;

      setSlotPreviews(prev => prev.map(slot => 
        slot.slotName === slotName 
          ? { ...slot, aiPreview: data?.response || 'Preview generated' }
          : slot
      ));
    } catch (error) {
      console.error('Error previewing AI output:', error);
      toast.error('Failed to preview AI output');
    } finally {
      setPreviewingSlotId(null);
    }
  }

  const directSlots = slotPreviews.filter(s => s.mappingType === 'direct');
  const aiSlots = slotPreviews.filter(s => s.mappingType === 'ai_generated');
  const staticSlots = slotPreviews.filter(s => s.mappingType === 'static');
  const missingSlots = slotPreviews.filter(s => !s.hasValue && !s.isAiSlot);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Preview: {template.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{template.slide_count || 0} slides</Badge>
            <Badge variant="outline">{mappings.length} slots</Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          For: {contextData['account.name']}
          {dealId && contextData['deal.name'] && ` → ${contextData['deal.name']}`}
          {contactId && contextData['contact.full_name'] && ` → ${contextData['contact.full_name']}`}
          {contextData['contact.title'] && ` (${contextData['contact.title']})`}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Data to be injected */}
        {directSlots.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">Data to be injected:</h3>
            <div className="space-y-2">
              {directSlots.map(slot => (
                <div key={slot.slotName} className="flex items-start gap-3 text-sm">
                  {slot.hasValue ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="font-medium">{slot.slotName}:</span>{' '}
                    {slot.hasValue ? (
                      <span className="text-muted-foreground">{slot.resolvedValue}</span>
                    ) : (
                      <span className="text-amber-500">Not found</span>
                    )}
                  </div>
                  {!slot.hasValue && (
                    <Button variant="outline" size="sm" className="h-6 text-xs">
                      <Upload className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI-Generated Content */}
        {aiSlots.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI-Generated Content:
            </h3>
            <div className="space-y-3">
              {aiSlots.map(slot => (
                <div key={slot.slotName} className="border rounded-lg p-3 space-y-2 bg-purple-500/5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{slot.slotName}</span>
                    <Badge variant="secondary" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    Prompt: "{slot.aiPrompt?.replace(/\{([^}]+)\}/g, (match, key) => 
                      String(contextData[key] || match)
                    )}"
                  </p>
                  {slot.aiPreview ? (
                    <div className="bg-background rounded p-2 text-sm border">
                      {slot.aiPreview}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => slot.aiPrompt && previewAiOutput(slot.slotName, slot.aiPrompt)}
                      disabled={previewingSlotId === slot.slotName}
                      className="text-xs h-7"
                    >
                      {previewingSlotId === slot.slotName ? (
                        <>Generating preview...</>
                      ) : (
                        <>Preview AI Output</>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Static Values */}
        {staticSlots.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">Static Values:</h3>
            <div className="space-y-2">
              {staticSlots.map(slot => (
                <div key={slot.slotName} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{slot.slotName}:</span>{' '}
                    <span className="text-muted-foreground">{slot.resolvedValue || '(empty)'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Data Warning */}
        {missingSlots.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-sm font-medium mb-2">
              <AlertCircle className="h-4 w-4" />
              {missingSlots.length} slot{missingSlots.length !== 1 ? 's' : ''} missing data
            </div>
            <p className="text-xs text-muted-foreground">
              Missing slots will use fallback values if configured, or be left empty.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack} disabled={isGenerating}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              'Generating...'
            ) : (
              <>
                Generate Presentation
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
