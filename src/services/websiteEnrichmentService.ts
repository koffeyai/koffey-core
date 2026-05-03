import { supabase } from "@/integrations/supabase/client";

export interface EnrichedWebsiteData {
  companyName?: string;
  industry?: string;
  description?: string;
  phone?: string;
  address?: string;
  foundedYear?: string;
  employeeCount?: string;
  // Enhanced business intelligence
  vertical?: string;
  businessModel?: string;
  revenueModel?: string;
  targetMarket?: string;
  valueProposition?: string;
  companyStage?: string;
  competitorAnalysis?: string[];
  techStack?: string[];
  fundingInfo?: string;
  socialMediaLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  keyPersonnel?: Array<{
    name: string;
    title: string;
    linkedinUrl?: string;
  }>;
  painPoints?: string[];
  newsHighlights?: string[];
  conversationStarters?: string[];
  enrichmentConfidence?: number;
}

export interface WebsiteEnrichmentResult {
  success: boolean;
  data: EnrichedWebsiteData;
  error?: string;
  source?: string;
}

export class WebsiteEnrichmentService {
  private static cache = new Map<string, { data: WebsiteEnrichmentResult; timestamp: number }>();
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Enriches account data by fetching information from the provided website
   */
  static async enrichFromWebsite(website: string): Promise<WebsiteEnrichmentResult> {
    try {
      // Normalize URL for caching
      const normalizedUrl = this.normalizeUrl(website);
      
      // Check cache first
      const cached = this.cache.get(normalizedUrl);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('Using cached website data for:', normalizedUrl);
        return cached.data;
      }

      console.log('Fetching fresh website data for:', normalizedUrl);

      // Call the edge function to enrich website data
      const { data, error } = await supabase.functions.invoke('enrich-website', {
        body: { website: normalizedUrl }
      });

      if (error) {
        console.error('Error calling enrich-website function:', error);
        return {
          success: false,
          data: {},
          error: error.message || 'Failed to enrich website data'
        };
      }

      const result: WebsiteEnrichmentResult = data;

      // Cache successful results
      if (result.success) {
        this.cache.set(normalizedUrl, {
          data: result,
          timestamp: Date.now()
        });
      }

      return result;

    } catch (error) {
      console.error('Error in WebsiteEnrichmentService:', error);
      return {
        success: false,
        data: {},
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Merges enriched data with existing form data, preserving user input
   */
  static mergeWithFormData(
    formData: any, 
    enrichedData: EnrichedWebsiteData
  ): { merged: any; applied: string[] } {
    const merged = { ...formData };
    const applied: string[] = [];

    // Mapping from enriched data to form fields
    const fieldMappings = {
      companyName: 'name',
      industry: 'industry',
      description: 'description',
      phone: 'phone',
      address: 'address'
    };

    // Only apply enriched data if the form field is empty
    for (const [enrichedKey, formKey] of Object.entries(fieldMappings)) {
      if (enrichedData[enrichedKey as keyof EnrichedWebsiteData] && !merged[formKey]) {
        merged[formKey] = enrichedData[enrichedKey as keyof EnrichedWebsiteData];
        applied.push(formKey);
      }
    }

    return { merged, applied };
  }

  /**
   * Normalizes URL for consistent caching and processing
   */
  private static normalizeUrl(url: string): string {
    try {
      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      const urlObj = new URL(url);
      // Remove www. for consistency
      urlObj.hostname = urlObj.hostname.replace(/^www\./, '');
      // Remove trailing slash
      return urlObj.toString().replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  /**
   * Validates if a URL looks like a valid website
   */
  static isValidWebsiteUrl(url: string): boolean {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      const urlObj = new URL(normalizedUrl);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Clears the cache (useful for testing or memory management)
   */
  static clearCache(): void {
    this.cache.clear();
  }
}