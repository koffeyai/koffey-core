import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { withAPIProtection } from '../_shared/api-protection.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { authenticateRequest, createUnauthorizedResponse } from '../_shared/auth.ts';
import { createSecureErrorResponse, validateOrganizationAccess } from '../_shared/security.ts';

let corsHeaders = getCorsHeaders();

interface EnrichmentRequest {
  domain: string;
  userId?: string;
  organizationId?: string;
}

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

/**
 * Extract company name from domain
 */
function extractCompanyName(domain: string): string {
  // Remove common TLDs and www
  let name = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\.(com|org|net|io|co|biz|info|edu|gov|mil)(\.[a-z]{2})?$/i, '');
  
  // Handle subdomains
  const parts = name.split('.');
  name = parts[parts.length - 1] || name;
  
  // Capitalize first letter of each word
  return name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Clean and normalize domain
 */
function normalizeDomain(input: string): string {
  // Remove protocol if present
  let domain = input.replace(/^(https?:\/\/)/, '');
  
  // Remove trailing slash
  domain = domain.replace(/\/$/, '');
  
  // Remove path if present
  domain = domain.split('/')[0];
  
  // Remove port if present
  domain = domain.split(':')[0];
  
  // Add www if not present and not a subdomain
  if (!domain.startsWith('www.') && domain.split('.').length === 2) {
    domain = 'www.' + domain;
  }
  
  return domain.toLowerCase();
}

/**
 * Scrape website for company information
 */
async function scrapeWebsite(domain: string): Promise<Partial<CompanyData>> {
  try {
    const url = `https://${domain}`;
    
    // Fetch the website HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CompanyEnrichmentBot/1.0)'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract data using regex patterns (basic scraping)
    const data: Partial<CompanyData> = {};
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      data.name = titleMatch[1]
        .replace(/[\|–-].*$/, '') // Remove separators and everything after
        .trim();
    }
    
    // Extract meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      data.description = descMatch[1].trim();
    }
    
    // Extract Open Graph image (often company logo)
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      data.logoUrl = ogImageMatch[1];
    }
    
    // Extract social media links
    const linkedinMatch = html.match(/(?:href=["'])?(?:https?:\/\/)(?:www\.)?linkedin\.com\/company\/([^"'\s/>]+)/i);
    if (linkedinMatch) {
      data.linkedin = `https://www.linkedin.com/company/${linkedinMatch[1]}`;
    }
    
    const twitterMatch = html.match(/(?:href=["'])?(?:https?:\/\/)(?:www\.)?twitter\.com\/([^"'\s/>]+)/i);
    if (twitterMatch) {
      data.twitter = `https://twitter.com/${twitterMatch[1]}`;
    }
    
    const facebookMatch = html.match(/(?:href=["'])?(?:https?:\/\/)(?:www\.)?facebook\.com\/([^"'\s/>]+)/i);
    if (facebookMatch) {
      data.facebook = `https://www.facebook.com/${facebookMatch[1]}`;
    }
    
    // Extract email
    const emailMatch = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      data.email = emailMatch[1];
    }
    
    // Extract phone number (US format)
    const phoneMatch = html.match(/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/);
    if (phoneMatch) {
      data.phone = phoneMatch[1];
    }
    
    return data;
    
  } catch (error) {
    console.error('Error scraping website:', error);
    return {};
  }
}

/**
 * Try to enrich using public APIs (fallback)
 */
async function enrichFromAPIs(domain: string): Promise<Partial<CompanyData>> {
  const enrichedData: Partial<CompanyData> = {};
  
  // You could add calls to:
  // - Clearbit API
  // - FullContact API
  // - Hunter.io API
  // - Company enrichment services
  
  // For now, we'll use a simple heuristic based on domain patterns
  const domainLower = domain.toLowerCase();
  
  // Technology companies
  if (domainLower.includes('tech') || domainLower.includes('soft') || domainLower.includes('cloud')) {
    enrichedData.industry = 'Technology';
    enrichedData.tags = ['B2B', 'Software'];
  }
  // Retail
  else if (domainLower.includes('shop') || domainLower.includes('store') || domainLower.includes('buy')) {
    enrichedData.industry = 'Retail';
    enrichedData.tags = ['B2C', 'E-commerce'];
  }
  // Finance
  else if (domainLower.includes('bank') || domainLower.includes('finance') || domainLower.includes('capital')) {
    enrichedData.industry = 'Financial Services';
    enrichedData.tags = ['B2B', 'Finance'];
  }
  // Healthcare
  else if (domainLower.includes('health') || domainLower.includes('med') || domainLower.includes('care')) {
    enrichedData.industry = 'Healthcare';
    enrichedData.tags = ['Healthcare'];
  }
  
  return enrichedData;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }
  corsHeaders = getCorsHeaders(req);

  try {
    const { user } = await authenticateRequest(req);
    const { domain, organizationId } = await req.json() as EnrichmentRequest;
    
    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Domain is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Normalize the domain
    const normalizedDomain = normalizeDomain(domain);
    
    // Start with basic data
    const companyData: CompanyData = {
      domain: normalizedDomain,
      name: extractCompanyName(normalizedDomain)
    };
    
    // Try to scrape the website
    const scrapedData = await scrapeWebsite(normalizedDomain);
    Object.assign(companyData, scrapedData);
    
    // Enrich with API data
    const apiData = await enrichFromAPIs(normalizedDomain);
    Object.assign(companyData, apiData);
    
    // If we have a name from scraping, use it; otherwise use extracted name
    if (!companyData.name && scrapedData.name) {
      companyData.name = scrapedData.name;
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let resolvedOrganizationId: string | null = null;
    if (organizationId) {
      const hasAccess = await validateOrganizationAccess(supabase, user.id, organizationId);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized organization context' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      resolvedOrganizationId = organizationId;
    } else {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      resolvedOrganizationId = membership?.organization_id || null;
    }

    // Store enrichment result if we have user + org context
    if (resolvedOrganizationId) {
      // Best-effort cache write; this should never break the enrichment response.
      try {
        await supabase
          .from('company_enrichment_cache')
          .upsert({
            domain: normalizedDomain,
            enrichment_data: companyData,
            enriched_at: new Date().toISOString(),
            enriched_by: user.id
          })
          .select();
      } catch (cacheError) {
        console.warn('[enrich-company] cache write skipped:', cacheError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        data: companyData,
        source: scrapedData.name ? 'scraped' : 'extracted'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    if (error?.name === 'AuthError') {
      return createUnauthorizedResponse(error.message, req);
    }
    return createSecureErrorResponse(error, 'Failed to enrich company data', 500, req);
  }
};

serve(withAPIProtection(handler));
