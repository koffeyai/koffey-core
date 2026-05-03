import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateRequest, AuthError, getServiceRoleClient, isInternalServiceCall, requireOrgMembership } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { getTraceId } from '../_shared/request-controls.ts';

let corsHeaders = getCorsHeaders();

interface EnrichmentRequest {
  companyName: string;
  organizationId: string;
}

/**
 * Web Enrichment Orchestrator
 * SECURITY: Requires authentication to prevent abuse of external API calls.
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
  const traceId = getTraceId(req, 'enrich');
	try {
    const { companyName, organizationId, userId: bodyUserId }: EnrichmentRequest & { userId?: string } = await req.json();
    const supabase = getServiceRoleClient();
    let userId: string | undefined;

    // ====== SECURITY: Authenticate the request ======
    // Accept internal service calls (from unified-chat using service role key)
    // OR authenticated user requests (from frontend using JWT)
    if (!isInternalServiceCall(req)) {
      try {
        const auth = await authenticateRequest(req);
        userId = auth.userId;
      } catch (authError) {
        if (authError instanceof AuthError) {
          return new Response(
            JSON.stringify({ error: 'Authentication required', message: authError.message }),
            { status: authError.statusCode, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        throw authError;
      }
    } else {
      console.log('✅ Internal service call authenticated via service role key');
      userId = bodyUserId;
    }

    if (!userId || !organizationId) {
      return new Response(
        JSON.stringify({ success: false, confidence: 0, error: 'userId and organizationId are required', traceId }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    await requireOrgMembership(supabase, userId, organizationId);
    console.log('🔍 Web Enrichment Orchestrator:', { companyName, organizationId });

    const domain = await findCompanyDomain(companyName);
    
    if (!domain) {
      return new Response(
        JSON.stringify({ success: false, confidence: 0, error: `Could not find website for "${companyName}". Please provide the company website URL.` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('✅ Found domain:', domain);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const enrichResponse = await fetch(`${supabaseUrl}/functions/v1/enrich-website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({ website: domain, organizationId, userId })
    });

    if (!enrichResponse.ok) throw new Error('Website enrichment failed');

    const enrichData = await enrichResponse.json();
    
    if (!enrichData.success) {
      return new Response(
        JSON.stringify({ success: false, confidence: 0.3, error: `Found ${domain} but could not extract company information.` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const confidence = calculateConfidence(enrichData.data, companyName);

    return new Response(
      JSON.stringify({ success: true, confidence, data: { ...enrichData.data, domain } }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('Web enrichment orchestrator error:', error);
    if (error instanceof AuthError) {
      return new Response(
        JSON.stringify({ success: false, confidence: 0, error: error.message, traceId }),
        { status: error.statusCode, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, confidence: 0, error: 'Internal server error', traceId }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

async function findCompanyDomain(companyName: string): Promise<string | null> {
  const cleanName = companyName.toLowerCase().replace(/\s+(corp|corporation|inc|llc|ltd|co|company|group|solutions|technologies|systems)\.?$/i, '').trim().replace(/\s+/g, '');
  const commonPatterns = [`${cleanName}.com`, `${cleanName}.co`, `${cleanName}.io`];
  for (const domain of commonPatterns) {
    if (await checkDomainExists(domain)) return domain;
  }
  try {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(companyName + ' official website')}&format=json`, { headers: { 'User-Agent': 'RevOps-CRM/1.0' } });
    if (response.ok) {
      const data = await response.json();
      if (data.AbstractURL) return new URL(data.AbstractURL).hostname.replace(/^www\./, '');
      if (data.RelatedTopics?.[0]?.FirstURL) return new URL(data.RelatedTopics[0].FirstURL).hostname.replace(/^www\./, '');
    }
  } catch (error) { console.error('DuckDuckGo search failed:', error); }
  return null;
}

async function checkDomainExists(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`https://${domain}`, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': 'RevOps-CRM/1.0' } });
    clearTimeout(timeoutId);
    return response.ok || response.status === 403;
  } catch { return false; }
}

function calculateConfidence(data: any, companyName: string): number {
  let score = 0;
  if (data.companyName) {
    const s1 = data.companyName.toLowerCase(), s2 = companyName.toLowerCase();
    score += (s1 === s2 ? 1 : (s1.includes(s2) || s2.includes(s1) ? 0.7 : 0.3)) * 30;
  } else score += 10;
  if (data.industry) score += 15;
  if (data.description) score += 15;
  if (data.phone) score += 10;
  if (data.address) score += 10;
  if (data.socialMediaLinks?.linkedin) score += 10;
  if (data.valueProposition) score += 10;
  return Math.min(Math.round(score) / 100, 1.0);
}

serve(handler);
