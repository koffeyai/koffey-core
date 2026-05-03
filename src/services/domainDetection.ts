/**
 * Domain detection and enrichment service
 */

export interface DomainDetectionResult {
  isDomain: boolean;
  domain?: string;
  suggestedAction?: 'create_account' | 'enrich_existing' | 'view_info';
  confidence: number;
}

/**
 * Detect if input contains a domain/website
 */
export function detectDomain(input: string): DomainDetectionResult {
  // Normalize input
  const normalized = input.toLowerCase().trim();
  
  // Common domain patterns
  const patterns = [
    // Full URL
    /^https?:\/\/(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/,
    // Domain with www
    /^www\.([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/,
    // Plain domain
    /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/,
    // Domain anywhere in text
    /\b(?:www\.)?([a-zA-Z0-9-]+\.)+(?:com|org|net|io|co|biz|info|edu|gov|mil|ai|app|dev)\b/
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      // Extract clean domain
      let domain = match[0];
      domain = domain.replace(/^https?:\/\//, '');
      domain = domain.replace(/\/$/, '');
      
      // Determine suggested action based on context
      let suggestedAction: DomainDetectionResult['suggestedAction'] = 'create_account';
      
      if (normalized.includes('create') || normalized.includes('add') || normalized.includes('new')) {
        suggestedAction = 'create_account';
      } else if (normalized.includes('enrich') || normalized.includes('update') || normalized.includes('fetch')) {
        suggestedAction = 'enrich_existing';
      } else if (normalized.includes('show') || normalized.includes('view') || normalized.includes('info')) {
        suggestedAction = 'view_info';
      }
      
      return {
        isDomain: true,
        domain,
        suggestedAction,
        confidence: 0.9
      };
    }
  }
  
  // Check for company names that might be domains
  const companyPatterns = [
    /\b(pepsi|coca-cola|microsoft|google|apple|amazon|facebook|meta|netflix|tesla|nike|adidas)\b/i
  ];
  
  for (const pattern of companyPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const companyName = match[1];
      const domain = `www.${companyName.toLowerCase()}.com`;
      
      return {
        isDomain: true,
        domain,
        suggestedAction: 'create_account',
        confidence: 0.7
      };
    }
  }
  
  return {
    isDomain: false,
    confidence: 0
  };
}

/**
 * Generate smart suggestions for domain-related actions
 */
export function generateDomainSuggestions(domain: string): string[] {
  const suggestions = [
    `Create account for ${domain}`,
    `Enrich ${domain} with company data`,
    `Find contacts at ${domain}`,
    `Check if ${domain} exists in CRM`,
    `Add opportunity for ${domain}`
  ];
  
  return suggestions;
}

/**
 * Format domain for display
 */
export function formatDomain(domain: string): string {
  // Remove www. for cleaner display
  let formatted = domain.replace(/^www\./, '');
  
  // Capitalize domain name
  const parts = formatted.split('.');
  if (parts.length > 0) {
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  
  return parts.join('.');
}