import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { WebsiteEnrichmentService, EnrichedWebsiteData } from '@/services/websiteEnrichmentService';

export interface EnrichmentState {
  isEnriching: boolean;
  isShowingPreview: boolean;
  enrichedData: EnrichedWebsiteData | null;
  stage: 'analyzing' | 'extracting' | 'processing' | 'complete';
}

export const useWebsiteEnrichment = () => {
  const { toast } = useToast();
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState>({
    isEnriching: false,
    isShowingPreview: false,
    enrichedData: null,
    stage: 'analyzing'
  });

  const enrichFromWebsite = useCallback(async (website: string, companyName?: string) => {
    if (!WebsiteEnrichmentService.isValidWebsiteUrl(website)) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid website URL",
        variant: "destructive"
      });
      return null;
    }

    setEnrichmentState({
      isEnriching: true,
      isShowingPreview: false,
      enrichedData: null,
      stage: 'analyzing'
    });

    try {
      // Simulate progressive enrichment stages
      setTimeout(() => {
        setEnrichmentState(prev => ({ ...prev, stage: 'extracting' }));
      }, 1000);

      setTimeout(() => {
        setEnrichmentState(prev => ({ ...prev, stage: 'processing' }));
      }, 2000);

      const result = await WebsiteEnrichmentService.enrichFromWebsite(website);

      if (result.success && Object.keys(result.data).length > 0) {
        setEnrichmentState({
          isEnriching: false,
          isShowingPreview: true,
          enrichedData: result.data,
          stage: 'complete'
        });

        toast({
          title: "🎯 Enrichment Complete!",
          description: `Found comprehensive sales intelligence for ${companyName || 'the company'}. Review and apply the data below.`,
          duration: 4000
        });

        return result.data;
      } else {
        throw new Error(result.error || 'No data found');
      }
    } catch (error) {
      console.error('Enrichment failed:', error);
      setEnrichmentState({
        isEnriching: false,
        isShowingPreview: false,
        enrichedData: null,
        stage: 'analyzing'
      });

      toast({
        title: "Enrichment Failed",
        description: error instanceof Error ? error.message : "Failed to enrich website data",
        variant: "destructive"
      });

      return null;
    }
  }, [toast]);

  const applyEnrichedData = useCallback((formData: any, onUpdate: (data: any) => void) => {
    if (!enrichmentState.enrichedData) return;

    const { merged, applied } = WebsiteEnrichmentService.mergeWithFormData(
      formData, 
      enrichmentState.enrichedData
    );

    onUpdate(merged);

    setEnrichmentState(prev => ({
      ...prev,
      isShowingPreview: false
    }));

    toast({
      title: "Data Applied Successfully",
      description: `Updated ${applied.length} fields with enriched data`,
      duration: 3000
    });
  }, [enrichmentState.enrichedData, toast]);

  const dismissEnrichment = useCallback(() => {
    setEnrichmentState({
      isEnriching: false,
      isShowingPreview: false,
      enrichedData: null,
      stage: 'analyzing'
    });
  }, []);

  return {
    enrichmentState,
    enrichFromWebsite,
    applyEnrichedData,
    dismissEnrichment
  };
};