/**
 * Text Pre-processing Utilities
 * 
 * These functions are for VALIDATION and EXTRACTION only.
 * They do NOT make intent decisions - that's the LLM's job.
 * 
 * Use cases:
 * - ✅ "Is this a valid domain?" → isValidDomain()
 * - ✅ "Extract the domain from this URL" → normalizeDomain()
 * - ✅ "Pull out any phone numbers" → extractPhoneNumber()
 * - ❌ "What does the user want to do?" → LLM only!
 */

/**
 * Check if a string is a valid domain format
 * Supports:
 * - Standard domains: example.com, pepsi.com
 * - Multi-part TLDs: example.co.uk, example.com.au
 * - International TLDs: example.io, example.ai, example.tech
 * - Subdomains: blog.example.com
 */
export function isValidDomain(input: string): boolean {
  const cleaned = normalizeDomain(input);
  // More permissive pattern that handles:
  // - Multi-part TLDs like .co.uk, .com.au, .org.uk
  // - New gTLDs like .tech, .io, .ai, .app
  // - Subdomains
  // - Hyphens in domain names
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(cleaned);
}

/**
 * Normalize a URL/domain to clean format
 * "https://www.PEPSI.COM/" → "pepsi.com"
 */
export function normalizeDomain(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/**
 * Check if a string is a valid email format
 */
export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

/**
 * Normalize an email address
 */
export function normalizeEmail(input: string): string {
  return input.toLowerCase().trim();
}

/**
 * Extract phone number from freeform text
 */
export function extractPhoneNumber(text: string): string | null {
  const match = text.match(/(\+?[\d\s\-\(\)]{10,})/);
  return match ? match[1].replace(/\s/g, '') : null;
}

/**
 * Extract email address from freeform text
 */
export function extractEmail(text: string): string | null {
  const match = text.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
  return match ? normalizeEmail(match[1]) : null;
}

/**
 * Extract domain from freeform text
 */
export function extractDomain(text: string): string | null {
  // Match domain patterns
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,})/i);
  return match ? normalizeDomain(match[1]) : null;
}

/**
 * Pre-extract structured patterns from user message
 * This helps the LLM make better decisions by highlighting what's in the message
 * 
 * IMPORTANT: This does NOT decide intent - it just extracts facts
 */
export function extractStructuredPatterns(message: string): {
  domains: string[];
  emails: string[];
  phones: string[];
  statusKeywords: string[];
  actionKeywords: string[];
} {
  const domains: string[] = [];
  const emails: string[] = [];
  const phones: string[] = [];
  const statusKeywords: string[] = [];
  const actionKeywords: string[] = [];

  // Extract domains
  const domainMatches = message.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,})/gi) || [];
  for (const match of domainMatches) {
    const domain = normalizeDomain(match);
    if (isValidDomain(domain) && !domains.includes(domain)) {
      domains.push(domain);
    }
  }

  // Extract emails
  const emailMatches = message.match(/[^\s@]+@[^\s@]+\.[^\s@]+/gi) || [];
  for (const match of emailMatches) {
    const email = normalizeEmail(match);
    if (isValidEmail(email) && !emails.includes(email)) {
      emails.push(email);
    }
  }

  // Extract phone numbers
  const phoneMatches = message.match(/\+?[\d\s\-\(\)]{10,}/g) || [];
  for (const match of phoneMatches) {
    const phone = match.replace(/\s/g, '');
    if (phone.length >= 10 && !phones.includes(phone)) {
      phones.push(phone);
    }
  }

  // Detect status keywords (these help the LLM understand context)
  const statusPatterns = ['prospect', 'customer', 'lead', 'partner', 'churned', 'active'];
  for (const status of statusPatterns) {
    if (message.toLowerCase().includes(status)) {
      statusKeywords.push(status);
    }
  }

  // Detect action keywords
  const actionPatterns = ['add', 'create', 'new', 'put', 'enter', 'list', 'show', 'find', 'search', 'update', 'delete'];
  for (const action of actionPatterns) {
    if (new RegExp(`\\b${action}\\b`, 'i').test(message)) {
      actionKeywords.push(action);
    }
  }

  return { domains, emails, phones, statusKeywords, actionKeywords };
}

/**
 * Extract brand name from domain
 * "pepsi.com" → "Pepsi"
 */
export function extractBrandName(domain: string): string {
  const clean = normalizeDomain(domain);
  const parts = clean.split('.');
  const name = parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Sanitize text for database insertion
 */
export function sanitizeForDb(text: string): string {
  return text
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 10000); // Limit length
}
