/**
 * Email Parser Provider
 * 
 * Built-in free enrichment from email address patterns.
 * No API key required - extracts data from email format.
 */

import { EnrichmentResult, AuthorityLevel } from '../types';

// Public email domains that don't indicate a business
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'protonmail.com', 'icloud.com', 'aol.com', 'proton.me',
  'live.com', 'msn.com', 'ymail.com', 'googlemail.com',
  'mail.com', 'zoho.com', 'fastmail.com', 'tutanota.com',
  'me.com', 'mac.com', 'pm.me', 'hey.com'
]);

// Disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', '10minutemail.com',
  'guerrillamail.com', 'mailinator.com', 'temp-mail.org',
  'fakeinbox.com', 'trashmail.com', 'getnada.com'
]);

// Generic/role-based prefixes (not personal addresses)
const GENERIC_PREFIXES = new Set([
  'info', 'support', 'sales', 'help', 'admin', 'contact',
  'hello', 'team', 'billing', 'noreply', 'no-reply',
  'notifications', 'marketing', 'hr', 'careers', 'jobs',
  'press', 'media', 'legal', 'privacy', 'security'
]);

// Senior title patterns for authority inference
const SENIOR_TITLE_PATTERNS = [
  /^(ceo|cto|cfo|cmo|coo|cio|cso|cpo|cro)$/i,
  /^(chief|president|founder|owner|partner)$/i,
  /^(vp|vice\s*president)$/i,
  /^(director|head|lead|principal)$/i,
  /^(svp|evp|avp)$/i
];

export class EmailParserProvider {
  readonly provider_key = 'email_parser';

  /**
   * Enrich from email address
   */
  async enrich(email: string): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      success: false,
      provider_key: this.provider_key,
      confidence: 'low',
      fit_score: 0,
      fit_signals: {}
    };

    if (!email || !this.isValidEmail(email)) {
      result.error = 'Invalid email format';
      return result;
    }

    const [localPart, domain] = email.toLowerCase().split('@');
    
    // Check for disposable domains
    if (this.isDisposableDomain(domain)) {
      result.fit_signals.disposable_email = true;
      result.confidence = 'low';
      result.success = true;
      return result;
    }

    // Check for business vs personal email
    const isBusinessEmail = !this.isPublicDomain(domain);
    result.fit_signals.business_email = isBusinessEmail;

    // Check for generic/role addresses
    const isGeneric = this.isGenericAddress(localPart);
    result.fit_signals.not_generic = !isGeneric;

    // Try to parse name from email
    const parsedName = this.parseNameFromEmail(localPart);
    if (parsedName) {
      result.first_name = parsedName.firstName;
      result.last_name = parsedName.lastName;
      result.fit_signals.parseable_name = true;
    }

    // Extract company info from domain
    if (isBusinessEmail) {
      const companyInfo = this.extractCompanyFromDomain(domain);
      result.company_domain = domain;
      result.company_name = companyInfo.name;
    }

    // Set email format validity
    result.fit_signals.valid_format = true;
    result.fit_signals.not_disposable = true;

    // Calculate fit score
    result.fit_score = this.calculateFitScore(result.fit_signals);

    // Determine confidence
    if (result.fit_score >= 30) {
      result.confidence = 'medium';
    } else if (result.fit_score >= 15) {
      result.confidence = 'low';
    }

    result.success = true;
    return result;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if domain is a public email provider
   */
  private isPublicDomain(domain: string): boolean {
    // Direct match
    if (PUBLIC_DOMAINS.has(domain)) return true;
    
    // Check for international variants (e.g., yahoo.co.uk)
    const parts = domain.split('.');
    if (parts.length > 2) {
      const rootName = parts[0];
      if (['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'yandex', 'mail'].includes(rootName)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if domain is a disposable email service
   */
  private isDisposableDomain(domain: string): boolean {
    return DISPOSABLE_DOMAINS.has(domain);
  }

  /**
   * Check if email prefix is a generic/role address
   */
  private isGenericAddress(localPart: string): boolean {
    const normalized = localPart.replace(/[._-]/g, '').toLowerCase();
    return GENERIC_PREFIXES.has(normalized) || GENERIC_PREFIXES.has(localPart.split(/[._-]/)[0]);
  }

  /**
   * Parse name from email local part
   */
  private parseNameFromEmail(localPart: string): { firstName: string; lastName: string } | null {
    // Common patterns:
    // john.doe -> John Doe
    // jdoe -> J Doe (if we can't parse, skip)
    // john_doe -> John Doe
    // john-doe -> John Doe
    // johndoe -> can't reliably parse
    
    // Try splitting by common separators
    const separators = ['.', '_', '-'];
    for (const sep of separators) {
      if (localPart.includes(sep)) {
        const parts = localPart.split(sep).filter(p => p.length > 0);
        if (parts.length >= 2) {
          return {
            firstName: this.capitalize(parts[0]),
            lastName: this.capitalize(parts.slice(1).join(' '))
          };
        }
      }
    }
    
    // Can't reliably parse single string
    return null;
  }

  /**
   * Extract company name from domain
   */
  private extractCompanyFromDomain(domain: string): { name: string } {
    // Remove TLD and format as company name
    const parts = domain.split('.');
    
    // Handle multi-part TLDs (co.uk, com.au)
    let companyPart = parts[0];
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
      // e.g., company.co.uk -> company
      companyPart = parts[0];
    }
    
    // Format the company name
    const formatted = companyPart
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => this.capitalize(word))
      .join(' ');
    
    return { name: formatted };
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Calculate fit score from signals
   */
  private calculateFitScore(signals: Record<string, boolean>): number {
    let score = 0;
    
    // Business email is worth more
    if (signals.business_email) score += 15;
    if (signals.parseable_name) score += 10;
    if (signals.not_generic) score += 5;
    if (signals.valid_format) score += 5;
    if (signals.not_disposable) score += 0; // No penalty, just tracking
    
    // Penalties
    if (signals.disposable_email) score = Math.max(0, score - 30);
    
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Infer authority level from job title
   */
  static inferAuthorityFromTitle(title: string | undefined): AuthorityLevel {
    if (!title) return 'unknown';
    
    const normalizedTitle = title.toLowerCase().trim();
    
    // Check for C-suite and founders
    if (SENIOR_TITLE_PATTERNS[0].test(normalizedTitle) || 
        SENIOR_TITLE_PATTERNS[1].test(normalizedTitle)) {
      return 'economic_buyer';
    }
    
    // Check for VP level
    if (SENIOR_TITLE_PATTERNS[2].test(normalizedTitle)) {
      return 'decision_maker';
    }
    
    // Check for Director/Head level
    if (SENIOR_TITLE_PATTERNS[3].test(normalizedTitle) ||
        /director|head of/i.test(normalizedTitle)) {
      return 'decision_maker';
    }
    
    // Manager level
    if (/manager|lead/i.test(normalizedTitle)) {
      return 'recommender';
    }
    
    // Individual contributor
    if (/senior|specialist|engineer|analyst|consultant/i.test(normalizedTitle)) {
      return 'influencer';
    }
    
    return 'unknown';
  }
}

/**
 * Convenience function for quick email enrichment
 */
export async function quickEnrichEmail(email: string): Promise<EnrichmentResult> {
  const parser = new EmailParserProvider();
  return parser.enrich(email);
}
