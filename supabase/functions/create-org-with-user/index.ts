import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  authenticateRequest,
  AuthError,
  createUnauthorizedResponse,
  getServiceRoleClient,
} from '../_shared/auth.ts';

let corsHeaders = getCorsHeaders();

const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'hey.com',
  'zoho.com',
  'fastmail.com',
]);

function normalizeName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDomain(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./, '') || null;
  } catch {
    return raw.replace(/^www\./, '').replace(/\/.*$/, '') || null;
  }
}

function getClientIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || null;
}

async function isPublicEmailDomain(supabase: ReturnType<typeof getServiceRoleClient>, domain: string): Promise<boolean> {
  if (COMMON_EMAIL_DOMAINS.has(domain)) return true;

  const { data, error } = await supabase
    .from('public_email_domains')
    .select('domain')
    .eq('domain', domain)
    .maybeSingle();

  if (error) {
    console.warn('Public email domain lookup failed, falling back to built-in list:', error.message);
    return COMMON_EMAIL_DOMAINS.has(domain);
  }

  return Boolean(data);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }
  corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { user } = await authenticateRequest(req);
    const supabase = getServiceRoleClient();

    const body = await req.json().catch(() => ({}));
    const orgName = normalizeName(body.orgName);
    const domain = normalizeDomain(body.domain);

    if (body.userId && body.userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Authenticated user does not match request user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (orgName.length < 2 || orgName.length > 160) {
      return new Response(JSON.stringify({ error: 'Organization name must be between 2 and 160 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (domain && (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || domain.length > 255)) {
      return new Response(JSON.stringify({ error: 'Enter a valid organization domain' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (domain && await isPublicEmailDomain(supabase, domain)) {
      return new Response(JSON.stringify({
        error: 'Use a company-controlled domain, or leave the domain blank and create an unverified workspace.',
        code: 'public_email_domain_not_allowed',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (membershipLookupError) throw membershipLookupError;

    if (existingMembership?.organization_id) {
      return new Response(JSON.stringify({
        orgId: existingMembership.organization_id,
        alreadyMember: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (domain) {
      const { data: existingOrg, error: domainLookupError } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('domain', domain)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (domainLookupError) throw domainLookupError;

      if (existingOrg) {
        return new Response(JSON.stringify({
          error: `An organization already exists for ${domain}. Request access or use an invitation to join ${existingOrg.name}.`,
          code: 'organization_domain_exists',
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    console.log('Creating organization:', { userId: user.id, orgName, domain })

    // Start transaction - create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        domain: domain,
        auto_join_enabled: false,
        allowed_domains: domain ? [domain] : [],
        created_by: user.id
      })
      .select()
      .single()

    if (orgError) {
      console.error('Organization creation error:', orgError)
      throw orgError
    }

    console.log('Organization created:', org)

    // Create membership as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        user_id: user.id,
        organization_id: org.id,
        role: 'owner'
      })

    if (memberError) {
      console.error('Membership creation error:', memberError)
      await supabase.from('organizations').delete().eq('id', org.id)
      throw memberError
    }

    console.log('Membership created for user:', user.id)

    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        table_name: 'organizations',
        record_id: org.id,
        operation: 'INSERT',
        user_id: user.id,
        organization_id: org.id,
        new_values: {
          name: orgName,
          domain,
          owner_user_id: user.id,
        },
        changes: {
          source: 'create-org-with-user',
          membership_role: 'owner',
        },
        reason: 'Organization created during signup/onboarding',
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent'),
      });

    if (auditError) {
      console.warn('Organization audit log insert failed:', auditError.message);
    }

    return new Response(JSON.stringify({ orgId: org.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return createUnauthorizedResponse(error.message, req);
    }

    console.error('Error in create-org-with-user function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
