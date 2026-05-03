import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { withAPIProtection } from '../_shared/api-protection.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { authenticateRequest, createUnauthorizedResponse, getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { validateOrganizationAccess } from '../_shared/security.ts';

let corsHeaders = getCorsHeaders();

interface EnrichmentRequest {
  website?: string;
  domain?: string;
  organizationId?: string;
}

interface EnrichedWebsiteData {
  companyName?: string;
  company_name?: string;
  industry?: string;
  description?: string;
  phone?: string;
  address?: string;
  foundedYear?: string;
  employeeCount?: string;
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
  contactInfo?: {
    phone?: string;
    address?: string;
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

function normalizeDomain(input: string): string {
  let domain = input.trim().replace(/^(https?:\/\/)/i, '');
  domain = domain.replace(/\/.*$/, '');
  domain = domain.replace(/:\d+$/, '');
  domain = domain.replace(/^www\./i, '');
  return domain.toLowerCase();
}

function extractCompanyName(domain: string): string {
  const root = domain.split('.').filter(Boolean)[0] || domain;
  return root
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

async function scrapeWebsite(domain: string): Promise<Partial<EnrichedWebsiteData>> {
  try {
    const response = await fetch(`https://${domain}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KoffeyEnrichmentBot/1.0)'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const data: Partial<EnrichedWebsiteData> = {};

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      data.companyName = titleMatch[1].replace(/[\|–-].*$/, '').trim();
    }

    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      data.description = descMatch[1].trim();
    }

    const linkedinMatch = html.match(/(?:href=["'])?(?:https?:\/\/)(?:www\.)?linkedin\.com\/company\/([^"'\s/>]+)/i);
    const twitterMatch = html.match(/(?:href=["'])?(?:https?:\/\/)(?:www\.)?(?:twitter|x)\.com\/([^"'\s/>]+)/i);
    const facebookMatch = html.match(/(?:href=["'])?(?:https?:\/\/)(?:www\.)?facebook\.com\/([^"'\s/>]+)/i);
    if (linkedinMatch || twitterMatch || facebookMatch) {
      data.socialMediaLinks = {
        linkedin: linkedinMatch ? `https://www.linkedin.com/company/${linkedinMatch[1]}` : undefined,
        twitter: twitterMatch ? `https://twitter.com/${twitterMatch[1]}` : undefined,
        facebook: facebookMatch ? `https://www.facebook.com/${facebookMatch[1]}` : undefined,
      };
    }

    const phoneMatch = html.match(/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/);
    if (phoneMatch) {
      data.phone = phoneMatch[1];
      data.contactInfo = { phone: phoneMatch[1] };
    }

    return data;
  } catch (error) {
    console.warn('[enrich-website] scrape failed:', error);
    return {};
  }
}

function inferBusinessContext(domain: string): Partial<EnrichedWebsiteData> {
  const lower = domain.toLowerCase();
  const inferred: Partial<EnrichedWebsiteData> = {
    techStack: [],
    competitorAnalysis: [],
    painPoints: [],
    newsHighlights: [],
    keyPersonnel: [],
  };

  if (lower.includes('tech') || lower.includes('soft') || lower.includes('cloud') || lower.includes('ai')) {
    inferred.industry = 'Technology';
    inferred.vertical = 'B2B SaaS';
    inferred.businessModel = 'Subscription';
    inferred.revenueModel = 'Recurring revenue';
    inferred.targetMarket = 'Business teams';
    inferred.valueProposition = 'Software that helps teams move faster with better visibility.';
    inferred.painPoints = ['Tool sprawl', 'Manual workflows', 'Lack of visibility'];
  } else if (lower.includes('health') || lower.includes('care') || lower.includes('med')) {
    inferred.industry = 'Healthcare';
    inferred.targetMarket = 'Healthcare providers and patients';
    inferred.painPoints = ['Compliance overhead', 'Operational efficiency', 'Patient experience'];
  } else if (lower.includes('bank') || lower.includes('finance') || lower.includes('capital')) {
    inferred.industry = 'Financial Services';
    inferred.targetMarket = 'Financial customers and partners';
    inferred.painPoints = ['Trust', 'Compliance', 'Speed of service'];
  } else if (lower.includes('shop') || lower.includes('store') || lower.includes('buy')) {
    inferred.industry = 'Retail';
    inferred.targetMarket = 'Consumers';
    inferred.businessModel = 'Transactional';
    inferred.painPoints = ['Conversion rate', 'Retention', 'Inventory visibility'];
  }

  return inferred;
}

function buildConversationStarters(data: EnrichedWebsiteData): string[] {
  const starters: string[] = [];
  if (data.industry) starters.push(`How are you approaching growth in ${data.industry.toLowerCase()} right now?`);
  if (data.valueProposition) starters.push(`What part of your value proposition resonates most with new customers today?`);
  if (data.painPoints?.length) starters.push(`Are ${data.painPoints[0]?.toLowerCase()} still a priority for the team this quarter?`);
  return starters.slice(0, 3);
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }
  corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json().catch(() => ({})) as EnrichmentRequest;
    const input = body.website || body.domain;
    if (!input) {
      return new Response(JSON.stringify({
        success: false,
        data: {},
        error: 'Website or domain is required'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let userId: string | null = null;
    if (!isInternalServiceCall(req)) {
      const { user } = await authenticateRequest(req);
      userId = user.id;
    }

    const normalizedDomain = normalizeDomain(input);
    const scraped = await scrapeWebsite(normalizedDomain);
    const inferred = inferBusinessContext(normalizedDomain);
    const companyName = scraped.companyName || extractCompanyName(normalizedDomain);

    const result: EnrichedWebsiteData = {
      companyName,
      company_name: companyName,
      industry: scraped.industry || inferred.industry,
      description: scraped.description || inferred.valueProposition,
      phone: scraped.phone,
      address: scraped.address,
      foundedYear: scraped.foundedYear,
      employeeCount: scraped.employeeCount,
      vertical: inferred.vertical,
      businessModel: inferred.businessModel,
      revenueModel: inferred.revenueModel,
      targetMarket: inferred.targetMarket,
      valueProposition: inferred.valueProposition,
      companyStage: inferred.companyStage,
      competitorAnalysis: inferred.competitorAnalysis || [],
      techStack: inferred.techStack || [],
      fundingInfo: inferred.fundingInfo,
      socialMediaLinks: scraped.socialMediaLinks,
      contactInfo: {
        phone: scraped.phone,
        address: scraped.address,
      },
      keyPersonnel: [],
      painPoints: inferred.painPoints || [],
      newsHighlights: [],
      conversationStarters: [],
      enrichmentConfidence: scraped.description || scraped.socialMediaLinks ? 0.8 : 0.45,
    };
    result.conversationStarters = buildConversationStarters(result);

    if (userId) {
      const supabase = getServiceRoleClient();
      let resolvedOrganizationId: string | null = null;

      if (body.organizationId) {
        const hasAccess = await validateOrganizationAccess(supabase, userId, body.organizationId);
        if (hasAccess) {
          resolvedOrganizationId = body.organizationId;
        }
      } else {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        resolvedOrganizationId = membership?.organization_id || null;
      }

      if (resolvedOrganizationId) {
        try {
          await supabase
            .from('company_enrichment_cache')
            .upsert({
              domain: normalizedDomain,
              enrichment_data: result,
              enriched_at: new Date().toISOString(),
              enriched_by: userId,
            })
            .select();
        } catch (cacheError) {
          console.warn('[enrich-website] cache write skipped:', cacheError);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: result,
      source: scraped.companyName ? 'scraped' : 'extracted',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error?.name === 'AuthError') {
      return createUnauthorizedResponse(error.message, req);
    }

    console.error('[enrich-website] handler error:', error);
    return new Response(JSON.stringify({
      success: false,
      data: {},
      error: 'Failed to enrich website data'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(withAPIProtection(handler));
