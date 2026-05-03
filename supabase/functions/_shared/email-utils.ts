/**
 * Enhanced Email Domain Utilities
 * 
 * Handles domain extraction, public domain detection, subdomain matching,
 * and generic email detection for the Lead/Contact lifecycle system.
 */

// Common public email domains - used for fallback when DB lookup fails
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'protonmail.com', 'icloud.com', 'aol.com', 'proton.me',
  'live.com', 'msn.com', 'ymail.com', 'googlemail.com',
  'mail.com', 'zoho.com', 'fastmail.com', 'tutanota.com',
  'me.com', 'mac.com'
]);

// Root patterns for international public email variants
const PUBLIC_DOMAIN_PATTERNS = [
  'gmail', 'yahoo', 'hotmail', 'outlook', 'protonmail', 
  'icloud', 'aol', 'yandex', 'mail', 'googlemail',
  'gmx', 'web', 'libero', 'virgilio', 'laposte', 'orange',
  'comcast', 'verizon', 'att', 'sbcglobal', 'cox', 'charter', 'earthlink'
];

// Generic email prefixes that suggest non-person addresses
const GENERIC_EMAIL_PREFIXES = [
  'support', 'billing', 'info', 'sales', 'help', 'admin', 
  'contact', 'hello', 'noreply', 'no-reply', 'notifications',
  'team', 'service', 'feedback', 'webmaster', 'postmaster',
  'marketing', 'orders', 'invoices', 'accounts', 'hr'
];

// Country-code TLDs that often appear in compound TLDs
const COUNTRY_TLDS = new Set([
  'co', 'com', 'org', 'net', 'ac', 'gov', 'edu'
]);

/**
 * Extract full domain from an email address
 * john@us.ibm.com → us.ibm.com
 */
export function extractDomain(email: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const match = email.trim().toLowerCase().match(/@([^@\s]+)$/);
  return match ? match[1] : null;
}

/**
 * Extract root domain from email, handling subdomains
 * john@us.ibm.com → ibm.com
 * jane@mail.google.com → google.com
 * bob@uk.finance.company.co.uk → company.co.uk
 */
export function extractRootDomain(email: string): string | null {
  const fullDomain = extractDomain(email);
  if (!fullDomain) return null;
  
  const parts = fullDomain.split('.');
  if (parts.length <= 2) return fullDomain;
  
  // Handle country TLDs: .co.uk, .com.br, .co.jp etc.
  // These have structure: name.co.uk (3 parts with country TLD)
  const lastPart = parts[parts.length - 1];
  const secondLastPart = parts[parts.length - 2];
  
  // Check if it's a compound TLD like .co.uk, .com.au
  if (parts.length >= 3 && COUNTRY_TLDS.has(secondLastPart) && lastPart.length === 2) {
    // Return last 3 parts: company.co.uk
    return parts.slice(-3).join('.');
  }
  
  // Standard case: return last 2 parts
  return parts.slice(-2).join('.');
}

/**
 * Check if a domain is a public email provider
 * Uses both exact matching and pattern matching for international variants
 * 
 * Examples:
 * - gmail.com → true
 * - yahoo.co.uk → true
 * - ibm.com → false
 */
export function isPublicDomain(domain: string): boolean {
  if (!domain) return false;
  const lower = domain.toLowerCase();
  
  // Direct match
  if (PUBLIC_DOMAINS.has(lower)) return true;
  
  // Pattern match for international variants
  // yahoo.co.uk → starts with "yahoo."
  // gmail.com.br → starts with "gmail."
  for (const pattern of PUBLIC_DOMAIN_PATTERNS) {
    if (lower.startsWith(pattern + '.')) return true;
  }
  
  // Check the root domain part before TLD
  const parts = lower.split('.');
  if (parts.length >= 2) {
    const rootName = parts[0];
    if (PUBLIC_DOMAIN_PATTERNS.includes(rootName)) return true;
  }
  
  return false;
}

/**
 * Check if a domain is a public email provider (using database lookup)
 * Falls back to pattern matching if DB lookup fails
 */
export async function isPublicDomainDB(supabase: any, domain: string): Promise<boolean> {
  if (!domain) return false;
  
  // First check local patterns (faster)
  if (isPublicDomain(domain)) return true;
  
  try {
    const { data } = await supabase
      .from('public_email_domains')
      .select('domain')
      .eq('domain', domain.toLowerCase())
      .single();
    
    return !!data;
  } catch {
    // Fallback to local check already done above
    return false;
  }
}

/**
 * Check if an email appears to be a generic/role-based address
 * These are often not real sales prospects (support@, billing@, etc.)
 * 
 * Examples:
 * - support@stripe.com → true
 * - billing@company.com → true
 * - john.doe@company.com → false
 */
export function isGenericEmail(email: string): boolean {
  if (!email) return false;
  const localPart = email.split('@')[0].toLowerCase();
  
  // Exact match on prefix
  if (GENERIC_EMAIL_PREFIXES.includes(localPart)) return true;
  
  // Check if starts with generic prefix followed by separator
  for (const prefix of GENERIC_EMAIL_PREFIXES) {
    if (localPart === prefix || 
        localPart.startsWith(prefix + '.') || 
        localPart.startsWith(prefix + '-') ||
        localPart.startsWith(prefix + '_')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find an account by email domain (supports root domain matching)
 * Matches both exact domain and root domain for subdomain support
 */
export async function findAccountByDomain(
  supabase: any, 
  domain: string, 
  organizationId: string
): Promise<{ id: string; name: string; account_type?: string } | null> {
  if (!domain) return null;
  
  // Skip public domains
  if (isPublicDomain(domain)) return null;
  
  const lowerDomain = domain.toLowerCase();
  
  try {
    // Try exact match first
    const { data: exactMatch } = await supabase
      .from('accounts')
      .select('id, name, account_type')
      .eq('organization_id', organizationId)
      .eq('domain', lowerDomain)
      .single();
    
    if (exactMatch) return exactMatch;
    
    // Try root domain match for subdomain cases
    // e.g., email from us.ibm.com should match account with domain ibm.com
    const parts = lowerDomain.split('.');
    if (parts.length > 2) {
      const rootDomain = parts.slice(-2).join('.');
      
      const { data: rootMatch } = await supabase
        .from('accounts')
        .select('id, name, account_type')
        .eq('organization_id', organizationId)
        .eq('domain', rootDomain)
        .single();
      
      if (rootMatch) return rootMatch;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Determine contact status - NEW CONTACTS ARE ALWAYS LEADS
 * They become contacts through the deal-close trigger
 * This allows prospecting new departments at existing customer accounts
 */
export function determineContactStatus(): 'lead' {
  return 'lead';
}

/**
 * Create a personal account name from a person's name
 * Used when adding freelancers/individuals with public email domains
 */
export function createPersonalAccountName(personName: string): string {
  if (!personName) return 'Personal Account';
  return `${personName.trim()} (Personal)`;
}

/**
 * Parse name into first and last name components
 */
export function parseName(fullName: string): { firstName: string; lastName: string | null } {
  if (!fullName) return { firstName: '', lastName: null };
  
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  
  return { firstName, lastName };
}
