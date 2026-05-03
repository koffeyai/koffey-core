import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface EnrichBatchRequest {
  contactIds: string[];
  organizationId: string;
  trigger: 'extraction' | 'manual' | 'bulk';
}

/**
 * Enrich Contacts Batch
 *
 * Server-side edge function called internally (fire-and-forget) by unified-chat
 * after batch save creates new contacts from extraction.
 *
 * Enrichment strategy:
 * - Free tier: email domain parsing → enrich-website (scrape company site)
 * - Paid tier (BYOK): org-configured providers (Clay, Apollo, Clearbit, etc.) take priority
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // SECURITY: Only allow internal service calls
    if (!isInternalServiceCall(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — internal service calls only' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { contactIds, organizationId, trigger }: EnrichBatchRequest = await req.json();
    console.log(`[enrich-contacts-batch] Starting enrichment for ${contactIds.length} contacts (trigger: ${trigger})`);

    if (!contactIds?.length || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Missing contactIds or organizationId' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = getServiceRoleClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Check if org has paid enrichment providers configured
    const { data: providerConfigs } = await supabase
      .from('enrichment_provider_configs')
      .select('id, provider_definition_id, credentials, is_active, enrichment_provider_definitions(provider_key, api_config, response_mapping)')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    const hasPaidProviders = providerConfigs && providerConfigs.length > 0;
    console.log(`[enrich-contacts-batch] Org has ${hasPaidProviders ? providerConfigs!.length : 0} active paid providers`);

    const results: { contactId: string; success: boolean; provider: string; error?: string }[] = [];

    for (const contactId of contactIds) {
      try {
        const enrichResult = await enrichSingleContact(
          supabase, supabaseUrl, serviceRoleKey, contactId, organizationId, hasPaidProviders ? providerConfigs! : []
        );
        results.push(enrichResult);
      } catch (err: any) {
        console.error(`[enrich-contacts-batch] Failed to enrich contact ${contactId}:`, err.message);
        results.push({ contactId, success: false, provider: 'none', error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[enrich-contacts-batch] Completed: ${successCount}/${contactIds.length} enriched`);

    return new Response(
      JSON.stringify({ success: true, results, summary: { total: contactIds.length, enriched: successCount } }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('[enrich-contacts-batch] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

async function enrichSingleContact(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  contactId: string,
  organizationId: string,
  paidProviders: any[]
): Promise<{ contactId: string; success: boolean; provider: string; error?: string }> {
  // 1. Load contact record
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('id, email, full_name, company, title, account_id, enriched_at')
    .eq('id', contactId)
    .single();

  if (fetchError || !contact) {
    return { contactId, success: false, provider: 'none', error: 'Contact not found' };
  }

  // Skip if recently enriched (within 7 days)
  if (contact.enriched_at) {
    const daysSince = (Date.now() - new Date(contact.enriched_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) {
      return { contactId, success: true, provider: 'cached' };
    }
  }

  const updates: Record<string, any> = {};
  let enrichedBy = 'none';

  // 2. Try paid providers first (if configured)
  if (paidProviders.length > 0 && contact.email) {
    for (const config of paidProviders) {
      try {
        const providerDef = config.enrichment_provider_definitions;
        if (!providerDef?.api_config) continue;

        const providerResult = await callPaidProvider(
          providerDef.api_config,
          config.credentials,
          providerDef.response_mapping,
          contact.email
        );

        if (providerResult) {
          if (providerResult.title && !contact.title) updates.title = providerResult.title;
          if (providerResult.company && !contact.company) updates.company = providerResult.company;
          if (providerResult.phone) updates.phone = providerResult.phone;
          enrichedBy = providerDef.provider_key;
          break; // Use first successful provider
        }
      } catch (err: any) {
        console.warn(`[enrich-contacts-batch] Paid provider failed for ${contactId}:`, err.message);
      }
    }
  }

  // 3. Free tier fallback: email domain parsing
  if (enrichedBy === 'none' && contact.email) {
    const domain = contact.email.split('@')[1];
    if (domain && !isPublicEmailDomain(domain)) {
      // Infer company from domain
      if (!contact.company) {
        const companyName = domainToCompanyName(domain);
        if (companyName) {
          updates.company = companyName;
        }
      }

      // Try enrich-website for the domain
      try {
        const enrichResponse = await fetch(`${supabaseUrl}/functions/v1/enrich-website`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ website: domain }),
        });

        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json();
          if (enrichData.success && enrichData.data) {
            if (enrichData.data.industry && !updates.company) {
              updates.company = enrichData.data.company_name || updates.company;
            }
            enrichedBy = 'enrich-website';
          }
        }
      } catch (err: any) {
        console.warn(`[enrich-contacts-batch] enrich-website failed for ${domain}:`, err.message);
      }

      if (enrichedBy === 'none') {
        enrichedBy = 'email-domain';
      }
    }
  }

  // 4. Update contact with enriched data
  if (Object.keys(updates).length > 0 || enrichedBy !== 'none') {
    updates.enriched_at = new Date().toISOString();
    updates.enrichment_provider = enrichedBy;
    updates.enrichment_confidence = enrichedBy === 'none' ? 'low' : enrichedBy === 'email-domain' ? 'low' : 'medium';

    const { error: updateError } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contactId);

    if (updateError) {
      console.error(`[enrich-contacts-batch] Failed to update contact ${contactId}:`, updateError.message);
    }
  }

  // 5. If contact has an account, check if account needs enrichment too
  if (contact.account_id) {
    try {
      const { data: account } = await supabase
        .from('accounts')
        .select('id, domain, industry, description')
        .eq('id', contact.account_id)
        .single();

      if (account && !account.industry && !account.description) {
        const accountDomain = account.domain || (contact.email ? contact.email.split('@')[1] : null);
        if (accountDomain && !isPublicEmailDomain(accountDomain)) {
          const enrichResponse = await fetch(`${supabaseUrl}/functions/v1/enrich-website`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ website: accountDomain }),
          });

          if (enrichResponse.ok) {
            const enrichData = await enrichResponse.json();
            if (enrichData.success && enrichData.data) {
              const accountUpdates: Record<string, any> = {};
              if (enrichData.data.industry) accountUpdates.industry = enrichData.data.industry;
              if (enrichData.data.description) accountUpdates.description = enrichData.data.description;
              if (enrichData.data.company_name && !account.domain) accountUpdates.domain = accountDomain;

              if (Object.keys(accountUpdates).length > 0) {
                await supabase.from('accounts').update(accountUpdates).eq('id', contact.account_id);
                console.log(`[enrich-contacts-batch] Also enriched account ${contact.account_id}`);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[enrich-contacts-batch] Account enrichment failed:`, err.message);
    }
  }

  // 6. Log enrichment
  try {
    await supabase.from('enrichment_logs').insert({
      organization_id: organizationId,
      contact_id: contactId,
      provider_key: enrichedBy,
      lookup_value: contact.email || contact.full_name,
      success: enrichedBy !== 'none',
      response_data: updates,
    });
  } catch (err: any) {
    console.warn(`[enrich-contacts-batch] Failed to log enrichment:`, err.message);
  }

  return { contactId, success: enrichedBy !== 'none', provider: enrichedBy };
}

async function callPaidProvider(
  apiConfig: any,
  credentials: any,
  responseMapping: any,
  email: string
): Promise<Record<string, any> | null> {
  if (!apiConfig?.endpoint || !credentials?.api_key) return null;

  const url = apiConfig.endpoint.replace('{{email}}', encodeURIComponent(email));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Apply auth header based on config
  if (apiConfig.auth_type === 'bearer') {
    headers['Authorization'] = `Bearer ${credentials.api_key}`;
  } else if (apiConfig.auth_type === 'header') {
    headers[apiConfig.auth_header_name || 'X-Api-Key'] = credentials.api_key;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();

    // Map response using responseMapping
    const mapped: Record<string, any> = {};
    if (responseMapping) {
      for (const [field, path] of Object.entries(responseMapping)) {
        const value = getNestedValue(data, path as string);
        if (value) mapped[field] = value;
      }
    }

    return Object.keys(mapped).length > 0 ? mapped : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function isPublicEmailDomain(domain: string): boolean {
  const publicDomains = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
    'live.com', 'msn.com', 'me.com', 'mac.com', 'fastmail.com',
  ]);
  return publicDomains.has(domain.toLowerCase());
}

function domainToCompanyName(domain: string): string | null {
  // Strip common TLDs and format
  const parts = domain.split('.');
  if (parts.length < 2) return null;
  const name = parts[0];
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

serve(handler);
