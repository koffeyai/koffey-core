/**
 * CRM Create Operations — extracted from unified-chat/index.ts
 *
 * Contains: executeCreateDeal, executeCreateDealConfirmed, executeCreateContact, executeCreateAccount
 */

import {
  createPersonalAccountName as defaultCreatePersonalAccountName,
  determineContactStatus as defaultDetermineContactStatus,
  extractDomain as defaultExtractDomain,
  extractRootDomain as defaultExtractRootDomain,
  findAccountByDomain as defaultFindAccountByDomain,
  isGenericEmail as defaultIsGenericEmail,
  isPublicDomain as defaultIsPublicDomain,
  parseName as defaultParseName,
} from '../../_shared/email-utils.ts';
import type { ToolExecutorContext, AccountMatchResult } from './types.ts';

// Re-export from parent module — these will be passed in or imported
// The parent index.ts provides: triggerEmbedding, buildAccountEmbeddingText,
// buildContactEmbeddingText, buildDealEmbeddingText, normalizeStage,
// findAccountByNameOrDomain, parseName, extractDomain, extractRootDomain,
// isPublicDomain, isGenericEmail, findAccountByDomain, determineContactStatus,
// createPersonalAccountName

interface AccountEnrichmentData {
  companyName?: string;
  company_name?: string;
  industry?: string;
  description?: string;
  phone?: string;
  address?: string;
  website?: string;
  domain?: string;
  vertical?: string;
  valueProposition?: string;
  enrichmentConfidence?: number;
  contactInfo?: {
    phone?: string;
    address?: string;
  };
}

function pickFirstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function getRuntimeEnv(name: string): string | undefined {
  const denoEnv = (globalThis as any)?.Deno?.env?.get?.(name);
  if (denoEnv) return denoEnv;
  return (globalThis as any)?.process?.env?.[name];
}

async function enrichAccountFromDomain(
  domain: string | null,
  organizationId: string
): Promise<AccountEnrichmentData | null> {
  if (!domain) return null;

  const supabaseUrl = getRuntimeEnv('SUPABASE_URL');
  const serviceRoleKey = getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/enrich-website`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ website: domain, organizationId }),
      signal: AbortSignal.timeout(4500),
    });

    if (!response.ok) {
      console.warn(`[create_account] enrichment skipped for ${domain}: HTTP ${response.status}`);
      return null;
    }

    const payload = await response.json().catch(() => null);
    if (!payload?.success || !payload?.data || typeof payload.data !== 'object') return null;
    return payload.data as AccountEnrichmentData;
  } catch (error: any) {
    console.warn(`[create_account] enrichment skipped for ${domain}:`, error?.message || error);
    return null;
  }
}

/**
 * Resolve fuzzy date expressions ("end of June", "Q3", "next month") to YYYY-MM-DD.
 * Returns null if the input can't be parsed.
 */
export function resolveFuzzyDate(input: string | null | undefined, now?: Date): string | null {
  if (!input) return null;
  const s = String(input).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const today = now || new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const lower = s.toLowerCase();

  const slashDate = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashDate) {
    const parsedMonth = parseInt(slashDate[1], 10);
    const parsedDay = parseInt(slashDate[2], 10);
    let parsedYear = slashDate[3]
      ? parseInt(slashDate[3], 10)
      : year;
    if (parsedYear < 100) parsedYear += 2000;
    if (!slashDate[3]) {
      const candidate = new Date(parsedYear, parsedMonth - 1, parsedDay);
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (candidate < todayStart) parsedYear += 1;
    }
    const maxDay = new Date(parsedYear, parsedMonth, 0).getDate();
    if (parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= maxDay) {
      return `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(parsedDay).padStart(2, '0')}`;
    }
  }

  // Quarter: "Q3", "Q3 2026", "end of Q2"
  const qMatch = lower.match(/q([1-4])(?:\s+(\d{4}))?/);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const qYear = qMatch[2] ? parseInt(qMatch[2]) : year;
    const lastMonth = q * 3; // Q1→3, Q2→6, Q3→9, Q4→12
    const lastDay = new Date(qYear, lastMonth, 0).getDate();
    return `${qYear}-${String(lastMonth).padStart(2, '0')}-${lastDay}`;
  }

  // Month names: "June", "end of June", "late March", "by September"
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  for (const [name, num] of Object.entries(months)) {
    if (lower.includes(name)) {
      const targetYear = num <= month ? year + 1 : year; // if month already passed, use next year
      const isEarly = /\b(early|start|beginning)\b/.test(lower);
      const isMid = /\b(mid|middle)\b/.test(lower);
      let day: number;
      if (isEarly) day = 15;
      else if (isMid) day = 15;
      else day = new Date(targetYear, num, 0).getDate(); // end of month (default)
      return `${targetYear}-${String(num).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Relative: "next month", "in 3 months", "in 2 weeks"
  const relMonths = lower.match(/(?:in\s+)?(\d+)\s+months?/);
  if (relMonths) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + parseInt(relMonths[1]));
    d.setDate(0); // last day of that month
    return d.toISOString().slice(0, 10);
  }
  if (/\bnext\s+month\b/.test(lower)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 2);
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  }

  // Relative weeks
  const relWeeks = lower.match(/(?:in\s+)?(\d+)\s+weeks?/);
  if (relWeeks) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(relWeeks[1]) * 7);
    return d.toISOString().slice(0, 10);
  }

  // "end of year", "year end"
  if (/\b(end of year|year.?end|eoy)\b/.test(lower)) {
    return `${year}-12-31`;
  }

  return null;
}

interface CrmCreateDeps {
  triggerEmbedding: (entityType: string, entityId: string, organizationId: string, content: string) => void;
  buildAccountEmbeddingText: (data: any) => string;
  buildContactEmbeddingText: (data: any) => string;
  buildDealEmbeddingText: (data: any) => string;
  normalizeStage: (rawStage: string | undefined | null, fallback?: string) => string;
  findAccountByNameOrDomain: (supabase: any, accountName: string, organizationId: string) => Promise<AccountMatchResult>;
  parseName: (name: string) => { firstName: string; lastName: string | null };
  extractDomain: (email: string) => string | null;
  extractRootDomain: (email: string) => string | null;
  isPublicDomain: (domain: string) => boolean;
  isGenericEmail: (email: string) => boolean;
  findAccountByDomain: (supabase: any, domain: string, organizationId: string) => Promise<any>;
  determineContactStatus: () => string;
  createPersonalAccountName: (name: string) => string;
}

let deps: Partial<CrmCreateDeps> = {};

export function initCrmCreateDeps(d: Partial<CrmCreateDeps>) {
  deps = d || {};
}

// Fallback implementations for when deps aren't initialized (decomposed module path)
function getFindAccountByNameOrDomain(supabase: any) {
  if (deps?.findAccountByNameOrDomain) return deps.findAccountByNameOrDomain;
  // Inline implementation
  return async (sb: any, accountName: string, orgId: string): Promise<AccountMatchResult> => {
    const { data: exact } = await sb.from('accounts').select('id, name')
      .eq('organization_id', orgId).ilike('name', accountName).maybeSingle();
    if (exact) return { ...exact, matchType: 'exact' as const };

    const { data: fuzzy } = await sb.from('accounts').select('id, name')
      .eq('organization_id', orgId).ilike('name', `%${accountName}%`).limit(1).maybeSingle();
    if (fuzzy) return { ...fuzzy, matchType: 'fuzzy' as const };

    return null as any;
  };
}

function getNormalizeStage() {
  if (deps?.normalizeStage) return deps.normalizeStage;
  return (raw: string | undefined | null, fallback = 'prospecting') => {
    const valid = ['prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    const normalized = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
    return valid.includes(normalized) ? normalized : fallback;
  };
}

function getParseName() {
  return deps?.parseName || defaultParseName;
}

function getExtractDomain() {
  return deps?.extractDomain || defaultExtractDomain;
}

function getExtractRootDomain() {
  return deps?.extractRootDomain || defaultExtractRootDomain;
}

function getIsPublicDomain() {
  return deps?.isPublicDomain || defaultIsPublicDomain;
}

function getIsGenericEmail() {
  return deps?.isGenericEmail || defaultIsGenericEmail;
}

function getFindAccountByDomain() {
  return deps?.findAccountByDomain || defaultFindAccountByDomain;
}

function getDetermineContactStatus() {
  return deps?.determineContactStatus || defaultDetermineContactStatus;
}

function getCreatePersonalAccountName() {
  return deps?.createPersonalAccountName || defaultCreatePersonalAccountName;
}

function cleanDealAccountName(value: unknown): string {
  const original = String(value || '').trim();
  if (!original) return '';

  const cleaned = original
    .replace(/^(?:account[_\s-]*name|account|company)\s*:?\s*/i, '')
    .replace(/\s+\b(?:closing|close\s+date|with\s+primary\s+contact|primary\s+contact|contact\s+is|at\s+(?:prospecting|qualified|proposal|negotiation|closed[_\s-]?won|closed[_\s-]?lost)\s+stage)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || original;
}

function cleanDealContactName(value: unknown): string {
  const original = String(value || '').trim();
  if (!original) return '';

  const cleaned = original
    .replace(/\s+\bat\s+(?:prospecting|qualified|proposal|negotiation|closed[_\s-]?won|closed[_\s-]?lost)\s+stage\b.*$/i, '')
    .replace(/\s+\b(?:for|on|regarding)\s+(?:the\s+)?(?:deal|opportunity)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || original;
}

function triggerEmbedding(entityType: string, entityId: string, orgId: string, content: string) {
  if (deps?.triggerEmbedding) {
    deps.triggerEmbedding(entityType, entityId, orgId, content);
  }
}

function buildEmbeddingText(type: 'account' | 'contact' | 'deal', data: any): string {
  if (type === 'account' && deps?.buildAccountEmbeddingText) return deps.buildAccountEmbeddingText(data);
  if (type === 'contact' && deps?.buildContactEmbeddingText) return deps.buildContactEmbeddingText(data);
  if (type === 'deal' && deps?.buildDealEmbeddingText) return deps.buildDealEmbeddingText(data);
  return JSON.stringify(data).slice(0, 500);
}

function formatContactOption(contact: any): string {
  const name = String(contact?.full_name || contact?.name || 'Unknown contact').trim();
  const descriptor = String(contact?.email || contact?.company || '').trim();
  return descriptor ? `${name} (${descriptor})` : name;
}

function normalizeDomainLikeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.includes('@') || /\s/.test(trimmed)) return null;

  let candidate = trimmed.toLowerCase();
  candidate = candidate.replace(/^https?:\/\//, '');
  candidate = candidate.replace(/^www\./, '');
  candidate = candidate.replace(/[/?#].*$/, '');
  candidate = candidate.replace(/:\d+$/, '');
  candidate = candidate.replace(/\.$/, '');

  if (!candidate) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(candidate)) return null;
  if (!candidate.split('.').every((label) => label.length > 0 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'))) {
    return null;
  }

  return candidate;
}

function normalizeWebsite(value: string | null | undefined, fallbackDomain: string | null): string | null {
  if (value && String(value).trim()) {
    const trimmed = String(value).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const normalized = normalizeDomainLikeValue(trimmed);
    if (normalized) return `https://${normalized}`;
    return trimmed;
  }
  if (fallbackDomain) return `https://${fallbackDomain}`;
  return null;
}

function deriveCompanyNameFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const root = String(domain).split('.')[0] || '';
  if (!root) return null;

  const segments = root.split(/[-_]+/).filter(Boolean);
  const acronymSuffixes = ['api', 'crm', 'erp', 'seo', 'sms', 'vps', 'vpn', 'ai', 'ml', 'ui', 'ux', 'qa', 'hr', 'it'];
  const toTitle = (segment: string) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();

  if (segments.length > 1) {
    return segments.map((segment) => acronymSuffixes.includes(segment.toLowerCase()) ? segment.toUpperCase() : toTitle(segment)).join(' ');
  }

  const compact = segments[0];
  for (const suffix of acronymSuffixes) {
    if (compact.toLowerCase().endsWith(suffix) && compact.length > suffix.length) {
      const prefix = compact.slice(0, compact.length - suffix.length);
      return `${toTitle(prefix)}${suffix.toUpperCase()}`;
    }
  }

  return toTitle(compact);
}

async function resolveDealPrimaryContact(
  supabase: any,
  organizationId: string,
  accountData: { id?: string | null; name?: string | null } | null | undefined,
  contactName: string | null | undefined,
): Promise<{
  contactId: string | null;
  resolvedName?: string | null;
  needsClarification?: boolean;
  message?: string;
  matches?: Array<{ id: string; name: string; email?: string | null; company?: string | null }>;
}> {
  if (!contactName) {
    return { contactId: null };
  }

  const cleaned = String(contactName).trim();
  const normalized = cleaned.toLowerCase();
  let query = supabase
    .from('contacts')
    .select('id, full_name, email, company, account_id')
    .eq('organization_id', organizationId)
    .or(`full_name.ilike.%${cleaned}%,first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (accountData?.id) {
    query = query.eq('account_id', accountData.id);
  }

  const { data: contactMatches, error: contactError } = await query;
  const rawMatches = Array.isArray(contactMatches) && !contactError ? contactMatches : [];
  const exactMatches = rawMatches.filter((contact: any) =>
    String(contact?.full_name || '').trim().toLowerCase() === normalized,
  );
  const rankedMatches = exactMatches.length > 0 ? exactMatches : rawMatches;

  if (rankedMatches.length === 1) {
    return {
      contactId: rankedMatches[0].id,
      resolvedName: rankedMatches[0].full_name || cleaned,
    };
  }

  const scopedSuffix = accountData?.name ? ` at ${accountData.name}` : '';
  if (rankedMatches.length > 1) {
    const preview = rankedMatches.slice(0, 3).map(formatContactOption).join('; ');
    return {
      contactId: null,
      needsClarification: true,
      message: `I found multiple contacts matching "${cleaned}"${scopedSuffix}: ${preview}. Which one should I use as the primary contact?`,
      matches: rankedMatches.map((contact: any) => ({
        id: contact.id,
        name: contact.full_name,
        email: contact.email || null,
        company: contact.company || null,
      })),
    };
  }

  let suggestedContacts: any[] = [];
  if (accountData?.id) {
    const { data: accountContacts } = await supabase
      .from('contacts')
      .select('id, full_name, email, company, account_id')
      .eq('organization_id', organizationId)
      .eq('account_id', accountData.id)
      .order('updated_at', { ascending: false })
      .limit(3);
    suggestedContacts = Array.isArray(accountContacts) ? accountContacts : [];
  }

  if (suggestedContacts.length > 0) {
    const preview = suggestedContacts.slice(0, 3).map(formatContactOption).join('; ');
    return {
      contactId: null,
      needsClarification: true,
      message: `I couldn't match "${cleaned}" to a contact${scopedSuffix}. I do see ${preview}. Which one should I use as the primary contact?`,
      matches: suggestedContacts.map((contact: any) => ({
        id: contact.id,
        name: contact.full_name,
        email: contact.email || null,
        company: contact.company || null,
      })),
    };
  }

  return {
    contactId: null,
    needsClarification: true,
    message: `I couldn't match "${cleaned}" to an existing contact${scopedSuffix}. Who should I use as the primary contact for this opportunity? If they're new, send their full name and email so I can add them first.`,
    matches: [],
  };
}

async function findContactByEmail(
  supabase: any,
  organizationId: string,
  email: string | null | undefined,
) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data: existingContact, error } = await supabase
    .from('contacts')
    .select('id, full_name, email, company, account_id')
    .eq('organization_id', organizationId)
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    console.warn(`[create_deal] Email lookup failed for "${normalizedEmail}": ${error.message}`);
    return null;
  }

  return existingContact || null;
}

async function createPrimaryContactForDeal(
  supabase: any,
  organizationId: string,
  userId: string,
  accountData: { id: string; name: string },
  contactName: string,
  contactEmail: string,
) {
  const { firstName, lastName } = getParseName()(contactName);
  const status = getDetermineContactStatus()();
  const normalizedEmail = String(contactEmail || '').trim().toLowerCase();

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      assigned_to: userId,
      first_name: firstName,
      last_name: lastName,
      full_name: contactName,
      email: normalizedEmail,
      company: accountData.name,
      account_id: accountData.id,
      status,
    })
    .select('id, full_name, email, company, account_id')
    .single();

  if (error) throw error;

  const { data: verifyContact, error: verifyError } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contact.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (verifyError || !verifyContact) {
    console.error('[create_deal] Contact inserted but verification read failed:', verifyError?.message || 'no row returned');
    throw new Error('Contact was created but could not be verified. Please refresh and check your contacts list.');
  }

  triggerEmbedding('contact', contact.id, organizationId, buildEmbeddingText('contact', {
    full_name: contact.full_name,
    email: contact.email,
    company: accountData.name,
  }));

  return contact;
}

// ============================================================================
// _createDealWithAccount (shared helper)
// ============================================================================

export async function _createDealWithAccount(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
  accountId: string,
  accountData: { id: string; name: string }
) {
  const { account_name, amount, name, stage, probability, close_date, contact_name, contact_email, notes, lead_source } = args;

  let contactId: string | null = null;
  let createdPrimaryContact: { id: string; full_name?: string | null; email?: string | null } | null = null;
  if (contact_name) {
    const existingContactByEmail = contact_email
      ? await findContactByEmail(supabase, organizationId, contact_email)
      : null;
    if (existingContactByEmail?.id) {
      contactId = existingContactByEmail.id;
    }

    const contactResolution = await resolveDealPrimaryContact(
      supabase,
      organizationId,
      accountData,
      contact_name,
    );
    if (!contactId) {
      if (contactResolution.needsClarification) {
        if (contact_email && (!Array.isArray(contactResolution.matches) || contactResolution.matches.length === 0)) {
          createdPrimaryContact = await createPrimaryContactForDeal(
            supabase,
            organizationId,
            userId,
            accountData,
            contact_name,
            contact_email,
          );
          contactId = createdPrimaryContact.id;
        } else {
          return {
            success: false,
            entity: 'deal',
            _needsInput: true,
            message: contactResolution.message,
            matches: contactResolution.matches || [],
          };
        }
      } else {
        contactId = contactResolution.contactId;
      }
    }
  }

  // Smart deal name generation: "Frito Lays - $45K" instead of "Frito Lays - 2/13/2026"
  const formatAmount = (amt: number) => {
    if (amt >= 1_000_000) return `$${(amt / 1_000_000).toFixed(amt % 1_000_000 === 0 ? 0 : 1)}M`;
    if (amt >= 1_000) return `$${(amt / 1_000).toFixed(amt % 1_000 === 0 ? 0 : 1)}K`;
    return `$${amt}`;
  };
  const dealName = name || (amount ? `${accountData?.name || account_name} - ${formatAmount(amount)}` : `${accountData?.name || account_name} - ${new Date().toLocaleDateString()}`);

  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      assigned_to: userId,
      account_id: accountId,
      contact_id: contactId,
      name: dealName,
      amount: amount,
      stage: getNormalizeStage()(stage),
      probability: probability || 20,
      description: notes || null,
      lead_source: lead_source || null,
      expected_close_date: close_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      currency: 'USD'
    })
    .select('id, name, amount, stage, deal_number, expected_close_date')
    .single();

  if (dealError) throw dealError;

  // Verify deal is persisted and readable
  const { data: verifyDeal, error: verifyError } = await supabase
    .from('deals')
    .select('id')
    .eq('id', deal.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (verifyError || !verifyDeal) {
    console.error('[create_deal] Deal inserted but verification read failed:', verifyError?.message || 'no row returned');
    throw new Error('Deal was created but could not be verified. Please refresh and check your deals list.');
  }

  // Trigger embedding generation (fire-and-forget)
  triggerEmbedding('deal', deal.id, organizationId, buildEmbeddingText('deal', {
    name: dealName, stage: getNormalizeStage()(stage), amount, currency: 'USD',
    probability: probability || 20, close_date, account_name: accountData.name,
    notes,
  }));

  const missingDetails: string[] = [];
  if (!contact_name && !contact_email) missingDetails.push('associated contact');
  if (!notes) missingDetails.push('deal notes or meeting context');
  if (!lead_source) missingDetails.push('lead source');
  const needsAdditionalDetails = missingDetails.length > 0;
  const followUpPrompt = needsAdditionalDetails
    ? `If you have ${missingDetails.slice(0, 3).join(', ')}${missingDetails.length > 3 ? ', and any extra context' : ''}, share it and I’ll categorize it for this opportunity.`
    : null;

  return {
    ...deal,
    account_name: accountData.name,
    account_created: true,
    contact_created: !!createdPrimaryContact,
    contact_name: createdPrimaryContact?.full_name || contact_name || null,
    entity: 'deal',
    notes: notes || null,
    lead_source: lead_source || null,
    needs_additional_details: needsAdditionalDetails,
    missing_details: missingDetails,
    follow_up_prompt: followUpPrompt,
    message: needsAdditionalDetails
      ? `Created ${deal.name}. ${followUpPrompt}`
      : `Created ${deal.name}.`,
  };
}

// ============================================================================
// Industry inference for auto-created accounts
// ============================================================================

/** Infer industry from well-known company names for auto-created accounts */
export function inferIndustryFromName(name: string): string | null {
  const lower = name.toLowerCase();
  const map: Record<string, string> = {
    'adobe': 'Technology', 'airbnb': 'Technology', 'amazon': 'Technology', 'amd': 'Technology',
    'apple': 'Technology', 'cisco': 'Technology', 'cloudflare': 'Technology', 'coreweave': 'Technology',
    'datadog': 'Technology', 'dell': 'Technology', 'docker': 'Technology', 'dropbox': 'Technology',
    'equinix': 'Technology', 'google': 'Technology', 'hp': 'Technology', 'hpe': 'Technology',
    'ibm': 'Technology', 'intel': 'Technology', 'meta': 'Technology', 'microsoft': 'Technology',
    'netflix': 'Technology', 'nvidia': 'Technology', 'oracle': 'Technology', 'salesforce': 'Technology',
    'sap': 'Technology', 'shopify': 'Technology', 'snowflake': 'Technology', 'stripe': 'Technology',
    'tesla': 'Technology', 'twilio': 'Technology', 'uber': 'Technology', 'vmware': 'Technology',
    'walmart': 'Retail', 'target': 'Retail', 'costco': 'Retail', 'home depot': 'Retail',
    'rei': 'Retail', 'nike': 'Retail', 'gucci': 'Luxury/Fashion', 'ralph lauren': 'Retail',
    'pepsi': 'Food & Beverage', 'pepsico': 'Food & Beverage', 'coca-cola': 'Food & Beverage',
    'kraft heinz': 'Food & Beverage', 'nestle': 'Food & Beverage',
    'ups': 'Logistics', 'fedex': 'Logistics', 'dhl': 'Logistics',
    'nfl': 'Media & Entertainment', 'espn': 'Media & Entertainment', 'disney': 'Media & Entertainment',
    'cvs': 'Retail/Healthcare', 'cvs pharmacy': 'Retail/Healthcare',
    'jpmorgan': 'Financial Services', 'goldman sachs': 'Financial Services',
  };
  return map[lower] || null;
}

// ============================================================================
// executeCreateDeal
// ============================================================================

export async function executeCreateDeal(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
  sessionId?: string,
  sessionTable?: 'chat_sessions' | 'messaging_sessions'
) {
  const account_name = cleanDealAccountName(args?.account_name);
  const contact_name = cleanDealContactName(args?.contact_name);
  const { amount, name, stage, probability, contact_email, notes, lead_source } = args;
  // Resolve fuzzy dates: "end of June" → "2026-06-30", "Q3" → "2026-09-30"
  const close_date = resolveFuzzyDate(args.close_date) || args.close_date || null;
  // Ensure resolved date flows through to _createDealWithAccount
  args = { ...args, account_name, contact_name, close_date };

  // Guard: required fields — LLMs sometimes omit them despite schema
  if (!account_name) {
    return {
      success: false,
      message: 'I need a company name to create a deal. Which account is this deal for?',
      _needsInput: true
    };
  }
  if (amount == null) {
    return {
      success: false,
      message: `I need a deal value to create this deal. What's the expected amount for the ${account_name} deal?`,
      _needsInput: true
    };
  }

  // Helper to store pending deal state (supports compound creation as array)
  const storePending = async (pendingData: any) => {
    if (sessionId && sessionTable) {
      // Read existing pending to support compound deal creation
      const { data: existing } = await supabase
        .from(sessionTable)
        .select('pending_deal_creation')
        .eq('id', sessionId)
        .maybeSingle();

      let pending;
      if (existing?.pending_deal_creation) {
        // Existing pending deal(s) — append as array
        const prev = Array.isArray(existing.pending_deal_creation)
          ? existing.pending_deal_creation
          : [existing.pending_deal_creation];
        pending = [...prev, pendingData];
      } else {
        pending = pendingData;
      }

      await supabase
        .from(sessionTable)
        .update({
          pending_deal_creation: pending,
          pending_deal_creation_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      console.log(`[unified-chat] Stored pending_deal_creation in ${sessionTable}/${sessionId} (${Array.isArray(pending) ? pending.length + ' deals' : 'single'})`);
    }
  };

  const buildPendingPayload = (extra: Record<string, any> = {}) => ({
    account_name,
    amount,
    name,
    stage,
    probability,
    close_date,
    contact_name,
    contact_email,
    notes,
    lead_source,
    ...extra,
  });

  // Helper to clear pending deal state after successful creation
  const clearPending = async () => {
    if (sessionId && sessionTable) {
      await supabase
        .from(sessionTable)
        .update({ pending_deal_creation: null, pending_deal_creation_at: null })
        .eq('id', sessionId);
      console.log(`[unified-chat] Cleared pending_deal_creation in ${sessionTable}/${sessionId}`);
    }
  };

  if (!close_date) {
    await storePending({
      ...buildPendingPayload(),
      confirmation_type: 'required_fields',
    });
    return {
      success: false,
      entity: 'deal',
      _needsInput: true,
      missing_fields: ['expected_close_date'],
      partial: buildPendingPayload(),
      message: [
        `Got it — ${amount ? `$${Number(amount).toLocaleString()} ` : ''}opportunity for ${account_name}.`,
        'Before I create it, I need the expected close date so this is forecastable.',
        contact_name || contact_email
          ? 'I have the primary contact context you provided.'
          : 'If you know the primary contact, include that too and I will attach it; otherwise I can create it without a contact after you provide the close date.',
      ].join(' '),
    };
  }

  const findAccount = getFindAccountByNameOrDomain(supabase);
  let existingAccount;
  try {
    existingAccount = await findAccount(supabase, account_name, organizationId);
  } catch (findErr: any) {
    console.error(`[create_deal] findAccountByNameOrDomain threw: ${findErr?.message}`);
    existingAccount = null;
  }

  if (existingAccount && existingAccount.matchType === 'exact') {
    // Exact match — proceed directly
    console.log(`[unified-chat] Exact account match: ${existingAccount.name}`);
    const result = await _createDealWithAccount(supabase, args, organizationId, userId, existingAccount.id, existingAccount);
    if (result?._needsInput || result?._needsConfirmation) {
      await storePending(buildPendingPayload({
        matched_account_id: existingAccount.id,
        matched_account_name: existingAccount.name,
        confirmation_type: 'contact_resolution',
      }));
      return {
        ...result,
        partial: buildPendingPayload(),
      };
    }
    await clearPending();
    return result;
  }

  if (existingAccount && (existingAccount.matchType === 'fuzzy' || existingAccount.matchType === 'domain')) {
    // Fuzzy/domain match — ask user to confirm which account
    console.log(`[unified-chat] Fuzzy match: "${account_name}" → "${existingAccount.name}" — requesting confirmation`);

    await storePending({
      ...buildPendingPayload(),
      matched_account_id: existingAccount.id,
      matched_account_name: existingAccount.name,
      confirmation_type: 'account_selection',
    });

    return {
      _needsConfirmation: true,
      _confirmationType: 'account_selection',
      account_name,
      matched_account_name: existingAccount.name,
      entity: 'deal',
    };
  }

  // No match at all — auto-create the account and proceed (user explicitly asked to create a deal)
  console.log(`[unified-chat] Account "${account_name}" not found — auto-creating`);
  const inferredIndustry = inferIndustryFromName(account_name);
  const { data: newAccount, error: newAccountError } = await supabase
    .from('accounts')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      name: account_name,
      assigned_to: userId,
      ...(inferredIndustry ? { industry: inferredIndustry } : {}),
    })
    .select('id, name')
    .single();

  if (newAccountError) {
    console.error(`[unified-chat] Auto-create account failed: ${newAccountError.message}`);
    await storePending({
      ...buildPendingPayload(),
      confirmation_type: 'create_account',
    });
    return {
      _needsConfirmation: true,
      _confirmationType: 'create_account',
      account_name,
      entity: 'deal',
    };
  }

  // Account created — now create the deal
  console.log(`[unified-chat] Auto-created account: ${newAccount.name} (${newAccount.id})`);
  triggerEmbedding('account', newAccount.id, organizationId, buildEmbeddingText('account', { name: account_name }));
  const result = await _createDealWithAccount(supabase, args, organizationId, userId, newAccount.id, newAccount);
  if (result?._needsInput || result?._needsConfirmation) {
    await storePending(buildPendingPayload({
      matched_account_id: newAccount.id,
      matched_account_name: newAccount.name,
      confirmation_type: 'contact_resolution',
    }));
    return {
      ...result,
      partial: buildPendingPayload(),
    };
  }
  await clearPending();
  return result;
}

// ============================================================================
// executeCreateDealConfirmed
// ============================================================================

export async function executeCreateDealConfirmed(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string
) {
  const { account_name } = args;

  // Create the new account
  const { data: newAccount, error: accountError } = await supabase
    .from('accounts')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      name: account_name,
      assigned_to: userId,
    })
    .select('id, name')
    .single();

  if (accountError) throw accountError;
  console.log(`[unified-chat] Created new account after confirmation: ${newAccount.name}`);

  // Trigger embedding for the new account
  triggerEmbedding('account', newAccount.id, organizationId, buildEmbeddingText('account', { name: account_name }));

  return await _createDealWithAccount(supabase, args, organizationId, userId, newAccount.id, newAccount);
}

// ============================================================================
// executeCreateContact
// ============================================================================

function normalizeLookupValue(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function companyNamesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeLookupValue(left);
  const b = normalizeLookupValue(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function storePendingContactCreation(
  supabase: any,
  sessionId: string,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
  pending: any,
) {
  const { error } = await supabase
    .from(sessionTable)
    .update({
      pending_contact_creation: pending,
      pending_contact_creation_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.warn(`[create_contact] Failed to store pending_contact_creation: ${error.message}`);
  }
}

async function readPendingContactCreation(
  supabase: any,
  sessionId: string,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
) {
  const { data, error } = await supabase
    .from(sessionTable)
    .select('pending_contact_creation')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    console.warn(`[create_contact] Failed to read pending_contact_creation: ${error.message}`);
    return null;
  }

  return data?.pending_contact_creation || null;
}

async function clearPendingContactCreation(
  supabase: any,
  sessionId: string,
  sessionTable: 'chat_sessions' | 'messaging_sessions',
) {
  const { error } = await supabase
    .from(sessionTable)
    .update({
      pending_contact_creation: null,
      pending_contact_creation_at: null,
    })
    .eq('id', sessionId);

  if (error) {
    console.warn(`[create_contact] Failed to clear pending_contact_creation: ${error.message}`);
  }
}

export async function executeCreateContact(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
  sessionId?: string,
  sessionTable?: 'chat_sessions' | 'messaging_sessions',
) {
  const incoming = args || {};
  let {
    name,
    email,
    phone,
    company,
    title,
    is_personal,
    lead_source,
    notes,
    confirmed,
  } = incoming;

  if (confirmed && sessionId && sessionTable) {
    const pending = await readPendingContactCreation(supabase, sessionId, sessionTable);
    if (pending) {
      name = name || pending.name;
      email = email || pending.email;
      phone = phone || pending.phone;
      company = company || pending.company;
      title = title || pending.title;
      is_personal = is_personal ?? pending.is_personal;
      lead_source = lead_source || pending.lead_source;
      notes = notes || pending.notes;
    }
  }

  if (!name) {
    return {
      success: false,
      entity: 'contact',
      _needsInput: true,
      message: 'I need the contact name to create this record. Who should I add?',
    };
  }

  const { firstName, lastName } = getParseName()(name);
  const normalizedName = name.trim().toLowerCase();

  // Duplicate check: exact email always wins.
  if (email) {
    const { data: existingByEmail } = await supabase
      .from('contacts')
      .select('id, full_name, email, company, account_id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .limit(1);
    if (existingByEmail && existingByEmail.length > 0) {
      return {
        entity: 'contact',
        duplicate: true,
        existing: existingByEmail[0],
        message: `A contact with email ${email} already exists: ${existingByEmail[0].full_name}. Would you like to update them instead?`
      };
    }
  }

  const { data: existingByName } = await supabase
    .from('contacts')
    .select('id, full_name, email, company, account_id, accounts(name)')
    .eq('organization_id', organizationId)
    .ilike('full_name', name)
    .limit(10);

  const exactNameMatches = (existingByName || []).filter(
    (c: any) => (c.full_name || '').trim().toLowerCase() === normalizedName,
  );

  let accountId: string | null = null;
  let accountName: string | null = null;
  let autoLinked = false;
  let createdPersonalAccount = false;
  let createdAccount = false;
  let isGeneric = false;
  let accountMatchType: 'domain' | 'exact' | 'fuzzy' | null = null;

  if (email && getIsGenericEmail()(email)) {
    isGeneric = true;
    console.log(`[unified-chat] Generic email detected: ${email}`);
  }

  if (email && !isGeneric) {
    const domain = getExtractDomain()(email);
    const rootDomain = getExtractRootDomain()(email);

    if (domain && !getIsPublicDomain()(domain)) {
      const matchedAccount = await getFindAccountByDomain()(supabase, domain, organizationId);
      if (matchedAccount) {
        accountId = matchedAccount.id;
        accountName = matchedAccount.name;
        accountMatchType = 'domain';
        autoLinked = true;
        console.log(`[unified-chat] Auto-linked contact to account ${matchedAccount.name} via domain ${domain}`);
      } else if (rootDomain && rootDomain !== domain) {
        const rootMatchedAccount = await getFindAccountByDomain()(supabase, rootDomain, organizationId);
        if (rootMatchedAccount) {
          accountId = rootMatchedAccount.id;
          accountName = rootMatchedAccount.name;
          accountMatchType = 'domain';
          autoLinked = true;
          console.log(`[unified-chat] Auto-linked contact to account ${rootMatchedAccount.name} via root domain ${rootDomain}`);
        }
      }
    }
  }

  if (!accountId && company) {
    const matchedAccount = await getFindAccountByNameOrDomain(supabase)(supabase, company, organizationId);
    if (matchedAccount) {
      accountId = matchedAccount.id;
      accountName = matchedAccount.name;
      accountMatchType = matchedAccount.matchType || 'exact';
    }
  }

  const requestedCompanyName = company || accountName || null;
  const exactCompanyNameMatch = exactNameMatches.find((c: any) => {
    const candidateCompany = c.accounts?.name || c.company || null;
    return companyNamesMatch(candidateCompany, requestedCompanyName);
  });

  if (exactCompanyNameMatch) {
    return {
      entity: 'contact',
      duplicate: true,
      existing: exactCompanyNameMatch,
      message: `A contact named "${exactCompanyNameMatch.full_name}" already exists${exactCompanyNameMatch.email ? ` (${exactCompanyNameMatch.email})` : ''}${requestedCompanyName ? ` at ${requestedCompanyName}` : ''}. Would you like to update them instead?`,
    };
  }

  if (!requestedCompanyName && exactNameMatches.length > 0) {
    return {
      entity: 'contact',
      duplicate: true,
      existing: exactNameMatches[0],
      message: `A contact named "${exactNameMatches[0].full_name}" already exists${exactNameMatches[0].email ? ` (${exactNameMatches[0].email})` : ''}. Would you like to update them instead?`,
    };
  }

  const contactExists = exactNameMatches.length > 0;
  const companyExists = !!accountId;
  const oneEntityAlreadyExists = contactExists !== companyExists;
  const hasExplicitCompany = !!company && company.trim().length > 0;
  const bothMissing = hasExplicitCompany && !contactExists && !companyExists && !is_personal;

  if (bothMissing && !confirmed) {
    const pendingPayload = { name, email, phone, company, title, is_personal, lead_source, notes };
    if (sessionId && sessionTable) {
      await storePendingContactCreation(supabase, sessionId, sessionTable, pendingPayload);
    }
    return {
      success: false,
      entity: 'contact',
      _needsConfirmation: true,
      _confirmationType: 'create_contact_details',
      pending_contact: pendingPayload,
      message: `I couldn't find an existing contact named "${name}" or a company record for "${company}". Reply "yes" to create both, or tell me what to fix first.`,
    };
  }

  if (!accountId && company && !is_personal) {
    const { data: newAccount, error: newAccountError } = await supabase
      .from('accounts')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        assigned_to: userId,
        name: company,
        account_type: 'prospect',
      })
      .select('id, name')
      .single();

    if (newAccountError) {
      throw newAccountError;
    }

    accountId = newAccount.id;
    accountName = newAccount.name;
    createdAccount = true;
    accountMatchType = null;
    console.log(`[create_contact] Created missing account "${newAccount.name}" for new contact "${name}"`);
  } else if (!accountId && is_personal) {
    const personalAccountName = getCreatePersonalAccountName()(name);
    const { data: personalAccount, error: accountError } = await supabase
      .from('accounts')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        assigned_to: userId,
        name: personalAccountName,
        account_type: 'prospect',
        is_personal: true
      })
      .select('id, name')
      .single();

    if (personalAccount && !accountError) {
      accountId = personalAccount.id;
      accountName = personalAccount.name;
      createdPersonalAccount = true;
      console.log(`[unified-chat] Created personal account: ${personalAccountName}`);
    }
  }

  const status = getDetermineContactStatus()();

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      assigned_to: userId,
      first_name: firstName,
      last_name: lastName,
      full_name: name,
      email: email || null,
      phone: phone || null,
      company: company || accountName || null,
      title: title || null,
      account_id: accountId,
      status: status,
      lead_source: lead_source || null,
      notes: notes || null
    })
    .select('id, full_name, email, contact_number, status')
    .single();

  if (error) throw error;

  // Verify contact is persisted and readable (read-after-write)
  const { data: verifyContact, error: verifyError } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contact.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (verifyError || !verifyContact) {
    console.error('[create_contact] Contact inserted but verification read failed:', verifyError?.message || 'no row returned');
    throw new Error('Contact was created but could not be verified. Please refresh and check your contacts list.');
  }

  // Trigger embedding generation (fire-and-forget)
  triggerEmbedding('contact', contact.id, organizationId, buildEmbeddingText('contact', {
    full_name: name, email, phone, title, company: company || accountName || undefined,
  }));

  if (sessionId && sessionTable) {
    await clearPendingContactCreation(supabase, sessionId, sessionTable);
  }

  const missingDetails: string[] = [];
  if (!email) missingDetails.push('email');
  if (!phone) missingDetails.push('phone');
  if (!title) missingDetails.push('title');
  if (!lead_source) missingDetails.push('lead source');
  const needsAdditionalDetails = missingDetails.length > 0 || oneEntityAlreadyExists;
  const additionalDetailsPrompt = missingDetails.length > 0
    ? `I can fill this in further if you share ${missingDetails.slice(0, 3).join(', ')}${missingDetails.length > 3 ? ', and other details' : ''}.`
    : 'I can capture extra context too (title, phone, lead source, or meeting notes) if you want.';

  return {
    ...contact,
    entity: 'contact',
    autoLinked,
    accountName,
    isLead: true,
    createdPersonalAccount,
    createdAccount,
    isGenericEmail: isGeneric,
    accountMatchType,
    needs_additional_details: needsAdditionalDetails,
    missing_details: missingDetails,
    message: needsAdditionalDetails
      ? `Created ${name}${accountName ? ` at ${accountName}` : ''}. ${additionalDetailsPrompt}`
      : `Created ${name}${accountName ? ` at ${accountName}` : ''}.`,
  };
}

// ============================================================================
// executeCreateAccount
// ============================================================================

export async function executeCreateAccount(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string
) {
  const {
    name,
    website,
    industry,
    phone,
    address,
    notes,
    description,
    contact_name,
    contact_email,
    associated_contacts,
    domain: providedDomain,
  } = args;

  const rawName = String(name || '').trim();
  const nameDomain = normalizeDomainLikeValue(rawName);
  const explicitDomain = normalizeDomainLikeValue(providedDomain);
  const websiteDomain = normalizeDomainLikeValue(website);
  const normalizedDomain = explicitDomain || websiteDomain || nameDomain || null;
  const normalizedWebsite = normalizeWebsite(website, normalizedDomain);
  const normalizedName = (() => {
    if (rawName && !nameDomain) return rawName;
    if (rawName && nameDomain && rawName.toLowerCase() !== nameDomain) return rawName;
    return deriveCompanyNameFromDomain(normalizedDomain) || rawName;
  })();

  let existing: any = null;
  if (normalizedDomain) {
    const { data: byDomain } = await supabase
      .from('accounts')
      .select('id, name, account_type')
      .eq('organization_id', organizationId)
      .eq('domain', normalizedDomain)
      .maybeSingle();
    existing = byDomain;
  }
  if (!existing && normalizedName) {
    const { data: byName } = await supabase
      .from('accounts')
      .select('id, name, account_type')
      .eq('organization_id', organizationId)
      .ilike('name', normalizedName)
      .maybeSingle();
    existing = byName;
  }

  if (existing) {
    return {
      ...existing,
      isExisting: true,
      entity: 'account',
      message: `Found existing account: ${existing.name}`
    };
  }

  const enrichment = normalizedDomain
    ? await enrichAccountFromDomain(normalizedDomain, organizationId)
    : null;
  const enrichedName = pickFirstNonEmpty(enrichment?.companyName, enrichment?.company_name);
  const accountName = normalizedName || (rawName && !nameDomain ? rawName : null) || enrichedName || rawName || 'Unknown Account';
  const enrichedIndustry = pickFirstNonEmpty(enrichment?.industry, enrichment?.vertical);
  const enrichedDescription = pickFirstNonEmpty(enrichment?.description, enrichment?.valueProposition);
  const enrichedPhone = pickFirstNonEmpty(enrichment?.phone, enrichment?.contactInfo?.phone);
  const enrichedAddress = pickFirstNonEmpty(enrichment?.address, enrichment?.contactInfo?.address);
  const finalIndustry = industry || enrichedIndustry || null;
  const finalPhone = phone || enrichedPhone || null;
  const finalAddress = address || enrichedAddress || null;
  const finalDescription = notes || description || enrichedDescription || null;
  const enrichmentApplied = !!enrichment && !!(
    (!industry && enrichedIndustry)
    || (!phone && enrichedPhone)
    || (!address && enrichedAddress)
    || (!description && !notes && enrichedDescription)
  );

  const { data: account, error } = await supabase
    .from('accounts')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      assigned_to: userId,
      name: accountName,
      website: normalizedWebsite,
      industry: finalIndustry,
      phone: finalPhone,
      address: finalAddress,
      description: finalDescription,
      domain: normalizedDomain,
      account_type: 'prospect',
      scraped_data: enrichment || null,
      enriched_at: enrichmentApplied ? new Date().toISOString() : null,
      data_sources: enrichmentApplied ? ['enrich-website'] : null,
      confidence_scores: enrichment?.enrichmentConfidence != null
        ? { enrichment: enrichment.enrichmentConfidence }
        : null,
    })
    .select('id, name, account_number, account_type, domain, industry, website, phone, address, description')
    .single();

  if (error) throw error;

  // Verify account is persisted and readable (read-after-write)
  const { data: verifyAccount, error: verifyError } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', account.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (verifyError || !verifyAccount) {
    console.error('[create_account] Account inserted but verification read failed:', verifyError?.message || 'no row returned');
    throw new Error('Account was created but could not be verified. Please refresh and check your accounts list.');
  }

  // Trigger embedding generation (fire-and-forget)
  triggerEmbedding('account', account.id, organizationId, buildEmbeddingText('account', {
    name: accountName,
    industry: finalIndustry,
    website: normalizedWebsite,
    phone: finalPhone,
    description: finalDescription,
  }));

  const hasNotesContext = !!String(finalDescription || '').trim();
  const hasAssociatedContact = !!String(contact_name || contact_email || associated_contacts || '').trim();
  const missingDetails: string[] = [];
  if (!finalIndustry) missingDetails.push('industry');
  if (!finalPhone) missingDetails.push('phone');
  if (!normalizedWebsite) missingDetails.push('website');
  if (!hasAssociatedContact) missingDetails.push('associated contacts');
  if (!hasNotesContext) missingDetails.push('notes or meeting context');
  const needsAdditionalDetails = missingDetails.length > 0;
  const followUpPrompt = needsAdditionalDetails
    ? `If you have ${missingDetails.slice(0, 4).join(', ')}${missingDetails.length > 4 ? ', and any additional context' : ''}, share it and I’ll categorize it automatically.`
    : null;

  return {
    ...account,
    entity: 'account',
    enrichment_applied: enrichmentApplied,
    needs_additional_details: needsAdditionalDetails,
    missing_details: missingDetails,
    follow_up_prompt: followUpPrompt,
    message: needsAdditionalDetails
      ? `Created ${account.name}. ${followUpPrompt}`
      : `Created ${account.name}.`,
  };
}
