/**
 * Company Enrichment Service - Enriches company data from various sources
 */

import { supabase } from '@/integrations/supabase/client';

export interface CompanyData {
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
  website?: string;
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  techStack?: string[];
  companySize?: string;
  foundedYear?: number;
  revenue?: string;
  location?: string;
  contactInfo?: {
    phone?: string;
    address?: string;
  };
  businessModel?: string;
  revenueModel?: string;
  valueProposition?: string;
  painPoints?: string[];
  conversationStarters?: string[];
}

export interface EnrichmentResult {
  success: boolean;
  data?: CompanyData;
  confidence: number;
  sources: string[];
  error?: string;
}

export class CompanyEnrichmentService {
  private static instance: CompanyEnrichmentService;

  private constructor() {}

  static getInstance(): CompanyEnrichmentService {
    if (!CompanyEnrichmentService.instance) {
      CompanyEnrichmentService.instance = new CompanyEnrichmentService();
    }
    return CompanyEnrichmentService.instance;
  }

  /**
   * Enrich company data using website and other sources
   */
  async enrichCompany(companyIdentifier: string): Promise<EnrichmentResult> {
    try {
      // Determine if identifier is domain or company name
      const isDomain = this.isDomainFormat(companyIdentifier);
      const website = isDomain ? companyIdentifier : await this.findCompanyWebsite(companyIdentifier);

      if (!website) {
        return {
          success: false,
          confidence: 0,
          sources: [],
          error: 'Could not determine company website'
        };
      }

      // Use the enrich-website edge function for data extraction
      const { data, error } = await supabase.functions.invoke('enrich-website', {
        body: { website }
      });

      if (error) {
        console.error('Website enrichment error:', error);
        return {
          success: false,
          confidence: 0,
          sources: [],
          error: error.message || 'Failed to enrich website data'
        };
      }

      // Transform the response to our CompanyData format
      const enrichedData: CompanyData = {
        name: data.companyName || companyIdentifier,
        domain: website,
        industry: data.industry,
        description: data.description,
        website: website,
        socialLinks: data.socialMediaLinks,
        techStack: data.techStack || [],
        businessModel: data.businessModel,
        revenueModel: data.revenueModel,
        valueProposition: data.valueProposition,
        painPoints: data.painPoints || [],
        conversationStarters: data.conversationStarters || [],
        contactInfo: data.contactInfo
      };

      return {
        success: true,
        data: enrichedData,
        confidence: 0.8, // Base confidence from website scraping
        sources: ['website_scraping']
      };

    } catch (error) {
      console.error('Company enrichment error:', error);
      return {
        success: false,
        confidence: 0,
        sources: [],
        error: error instanceof Error ? error.message : 'Unknown enrichment error'
      };
    }
  }

  /**
   * Enrich contact data with company information
   */
  async enrichContactWithCompany(contactId: string, organizationId: string): Promise<boolean> {
    try {
      // Get contact data
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .single();

      if (contactError || !contact) {
        console.error('Error fetching contact:', contactError);
        return false;
      }

      // Extract company domain from email if available
      let companyDomain = null;
      if (contact.email) {
        const emailDomain = contact.email.split('@')[1];
        if (emailDomain && !this.isPersonalEmailDomain(emailDomain)) {
          companyDomain = emailDomain;
        }
      }

      // Use company name or domain for enrichment
      const identifier = companyDomain || contact.company;
      if (!identifier) {
        return false;
      }

      // Enrich company data
      const enrichmentResult = await this.enrichCompany(identifier);
      
      if (!enrichmentResult.success || !enrichmentResult.data) {
        return false;
      }

      // Update contact with enriched data
      const existingDataSources = contact.data_sources || {};
      const updateData: any = {
        enriched_at: new Date().toISOString(),
        enrichment_confidence: enrichmentResult.confidence,
        data_sources: {
          ...(typeof existingDataSources === 'object' ? existingDataSources : {}),
          company_enrichment: {
            sources: enrichmentResult.sources,
            enriched_at: new Date().toISOString(),
            confidence: enrichmentResult.confidence
          }
        }
      };

      // Only update if we don't have company data already
      if (!contact.company && enrichmentResult.data.name) {
        updateData.company = enrichmentResult.data.name;
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', contactId)
        .eq('organization_id', organizationId);

      if (updateError) {
        console.error('Error updating contact:', updateError);
        return false;
      }

      return true;

    } catch (error) {
      console.error('Contact enrichment error:', error);
      return false;
    }
  }

  /**
   * Batch enrich multiple companies
   */
  async enrichCompanies(identifiers: string[]): Promise<Map<string, EnrichmentResult>> {
    const results = new Map<string, EnrichmentResult>();
    
    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < identifiers.length; i += batchSize) {
      const batch = identifiers.slice(i, i + batchSize);
      const batchPromises = batch.map(id => this.enrichCompany(id));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batch.forEach((id, index) => {
        const result = batchResults[index];
        if (result.status === 'fulfilled') {
          results.set(id, result.value);
        } else {
          results.set(id, {
            success: false,
            confidence: 0,
            sources: [],
            error: result.reason?.message || 'Failed to enrich'
          });
        }
      });
      
      // Add delay between batches
      if (i + batchSize < identifiers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Helper: Check if string is domain format
   */
  private isDomainFormat(str: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    return domainRegex.test(str);
  }

  /**
   * Helper: Find company website from name (basic implementation)
   */
  private async findCompanyWebsite(companyName: string): Promise<string | null> {
    // Basic domain guessing - in production, you'd use a service like Clearbit
    const cleanName = companyName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '')
      .replace(/(inc|corp|llc|ltd|company|co)$/g, '');
    
    // Try common domain patterns
    const patterns = [
      `${cleanName}.com`,
      `${cleanName}.io`,
      `${cleanName}.net`,
      `www.${cleanName}.com`
    ];

    // For now, return the first pattern - in production, you'd validate these
    return patterns[0];
  }

  /**
   * Helper: Check if email domain is personal (Gmail, Yahoo, etc.)
   */
  private isPersonalEmailDomain(domain: string): boolean {
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'icloud.com', 'aol.com', 'protonmail.com', 'yandex.com'
    ];
    return personalDomains.includes(domain.toLowerCase());
  }
}