import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CompanyData {
  name?: string;
  domain: string;
  industry?: string;
  size?: string;
  description?: string;
  headquarters?: string;
  founded?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  phone?: string;
  email?: string;
  revenue?: string;
  employees?: string;
  logoUrl?: string;
  tags?: string[];
}

interface EnrichmentResult {
  success: boolean;
  data?: CompanyData;
  source?: string;
  error?: string;
}

export function useCompanyEnrichment() {
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState<CompanyData | null>(null);
  const { toast } = useToast();

  const enrichCompany = useCallback(async (input: string): Promise<CompanyData | null> => {
    // Check if input looks like a domain/URL
    const domainPattern = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)/;
    const match = input.match(domainPattern);
    
    if (!match) {
      return null; // Not a domain, skip enrichment
    }

    setIsEnriching(true);
    
    try {
      // Extract domain from input
      const domain = match[0];
      
      // Get user context
      const { data: { user } } = await supabase.auth.getUser();
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();

      // Call enrichment function
      const { data, error } = await supabase.functions.invoke<EnrichmentResult>('enrich-company', {
        body: {
          domain,
          userId: user?.id,
          organizationId: orgMember?.organization_id
        }
      });

      if (error) throw error;

      if (data?.success && data.data) {
        setEnrichedData(data.data);
        
        // Show success toast with preview of enriched data
        const fieldsEnriched = Object.keys(data.data).filter(k => 
          data.data![k as keyof CompanyData] && k !== 'domain'
        ).length;
        
        toast({
          title: "Company data enriched!",
          description: `Found ${fieldsEnriched} fields from ${data.source === 'scraped' ? 'website' : 'domain'}`,
        });
        
        return data.data;
      }
      
      return null;
      
    } catch (error) {
      console.error('Enrichment error:', error);
      toast({
        title: "Enrichment failed",
        description: "Could not retrieve company information",
        variant: "destructive"
      });
      return null;
      
    } finally {
      setIsEnriching(false);
    }
  }, [toast]);

  const clearEnrichedData = useCallback(() => {
    setEnrichedData(null);
  }, []);

  return {
    enrichCompany,
    enrichedData,
    isEnriching,
    clearEnrichedData
  };
}