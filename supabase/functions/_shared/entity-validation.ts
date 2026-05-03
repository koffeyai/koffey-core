/**
 * Entity Validation and Normalization (POST-LLM LAYER)
 * 
 * This runs AFTER the LLM returns its results to:
 * 1. Validate entity formats (is this a valid domain/email/phone?)
 * 2. Normalize entities (clean up URLs, lowercase domains)
 * 3. Correct common misclassifications (domain in name field)
 * 
 * This does NOT make intent decisions - the LLM already did that.
 */

import { 
  isValidDomain, 
  normalizeDomain, 
  isValidEmail, 
  normalizeEmail,
  extractBrandName 
} from './text-preprocessing.ts';

interface NLPResult {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
}

interface ValidationError {
  field: string;
  value: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  normalizedResult: NLPResult;
}

/**
 * Check if a string looks like a phone number (not a domain)
 * This prevents phone numbers from being misclassified as domains
 */
function looksLikePhoneNumber(input: string): boolean {
  // Remove common separators and check if mostly digits
  const digitsOnly = input.replace(/[\s\-\(\)\+\.]/g, '');
  // Phone numbers are typically 10-15 digits
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && /^\d+$/.test(digitsOnly)) {
    return true;
  }
  // Common phone patterns
  const phonePatterns = [
    /^\+?\d{1,3}[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}$/, // +1 (555) 123-4567
    /^\d{3}[\-\.]\d{3}[\-\.]\d{4}$/, // 555-123-4567 or 555.123.4567
    /^\(\d{3}\)\s?\d{3}[\-\.]\d{4}$/, // (555) 123-4567
    /^1?\d{10}$/, // 15551234567 or 5551234567
  ];
  return phonePatterns.some(pattern => pattern.test(input.trim()));
}

/**
 * Validates and normalizes entities extracted by LLM
 * Returns the corrected result with any validation errors
 */
export function validateAndNormalizeEntities(nlpResult: NLPResult): NLPResult {
  if (!nlpResult || !nlpResult.entities) {
    return nlpResult;
  }

  const corrections: string[] = [];
  const entities = { ...nlpResult.entities };

  // ====== PHONE NUMBER MISCLASSIFICATION FIX ======
  // Check if domain field actually contains a phone number
  if (entities.accounts?.[0]?.domain) {
    const account = { ...entities.accounts[0] };
    if (looksLikePhoneNumber(account.domain)) {
      // Move phone from domain to phone field
      account.phone = account.domain.replace(/[\s\-\(\)\.]/g, '');
      account.domain = undefined;
      corrections.push(`Moved phone number "${account.phone}" from domain field to phone field`);
      entities.accounts[0] = account;
    }
  }

  // ====== ACCOUNT ENTITY VALIDATION ======
  if (nlpResult.intent === 'create_account' && entities.accounts?.[0]?.name) {
    const account = { ...entities.accounts[0] };
    const name = account.name.trim();

    // First check if name looks like a phone number (don't treat as domain)
    if (looksLikePhoneNumber(name)) {
      account.phone = name.replace(/[\s\-\(\)\.]/g, '');
      account.name = 'Unknown Company';
      account.needsEnrichment = true;
      corrections.push(`Extracted phone number "${account.phone}" from name field`);
      entities.accounts[0] = account;
    }
    // Check if name is actually a domain (misclassification fix)
    else if (isValidDomain(name)) {
      const cleanDomain = normalizeDomain(name);
      const brandName = extractBrandName(cleanDomain);
      account.domain = cleanDomain;
      account.name = brandName;
      account.needsEnrichment = true;
      corrections.push(`Moved domain "${name}" from name to domain field → "${cleanDomain}", extracted brand name → "${brandName}"`);
      entities.accounts[0] = account;
    }
    // Check if name is an email (misclassification fix)
    else if (isValidEmail(name)) {
      const emailParts = name.split('@');
      const domain = emailParts[1]?.toLowerCase() || '';
      const brandName = extractBrandName(domain);
      account.domain = domain;
      account.email = normalizeEmail(name);
      account.name = brandName;
      account.needsEnrichment = true;
      corrections.push(`Extracted domain "${domain}" from email "${name}", brand name → "${brandName}"`);
      entities.accounts[0] = account;
    }
  }

  // ====== DOMAIN NORMALIZATION ======
  if (entities.accounts?.[0]?.domain) {
    const account = { ...entities.accounts[0] };
    const originalDomain = account.domain;
    account.domain = normalizeDomain(originalDomain);
    
    if (account.domain !== originalDomain) {
      corrections.push(`Normalized domain: "${originalDomain}" → "${account.domain}"`);
    }
    
    // Validate the domain format
    if (!isValidDomain(account.domain)) {
      corrections.push(`⚠️ Invalid domain format: "${account.domain}"`);
    }
    
    entities.accounts[0] = account;
  }

  // ====== CONTACT ENTITY VALIDATION ======
  if (nlpResult.intent === 'create_contact') {
    // If email is in name field, move it
    if (entities.name && isValidEmail(entities.name)) {
      entities.email = normalizeEmail(entities.name);
      entities.name = null;
      corrections.push(`Moved email from name to email field`);
    }
    
    // Normalize email if present
    if (entities.email) {
      const originalEmail = entities.email;
      entities.email = normalizeEmail(originalEmail);
      
      if (!isValidEmail(entities.email)) {
        corrections.push(`⚠️ Invalid email format: "${entities.email}"`);
      }
    }
    
    // Extract company domain from email if present
    if (entities.email && !entities.company) {
      const emailParts = entities.email.split('@');
      const domain = emailParts[1]?.toLowerCase() || '';
      
      if (domain && !isCommonEmailProvider(domain)) {
        entities.company = domain;
        corrections.push(`Extracted company domain "${domain}" from email`);
      }
    }

    // Handle contacts array if present
    if (entities.contacts?.[0]) {
      const contact = { ...entities.contacts[0] };
      
      if (contact.email) {
        contact.email = normalizeEmail(contact.email);
        if (!isValidEmail(contact.email)) {
          corrections.push(`⚠️ Invalid contact email format: "${contact.email}"`);
        }
      }
      
      entities.contacts[0] = contact;
    }
  }

  // Log corrections if any were made
  if (corrections.length > 0) {
    console.log('🔧 Entity corrections applied:', corrections.join(' | '));
  }

  return {
    ...nlpResult,
    entities
  };
}

/**
 * Full validation with error reporting
 * Use this when you need detailed validation errors
 */
export function validateEntitiesWithErrors(nlpResult: NLPResult): ValidationResult {
  const errors: ValidationError[] = [];
  const normalizedResult = validateAndNormalizeEntities(nlpResult);

  // Validate account entities
  for (const account of normalizedResult.entities?.accounts || []) {
    if (account.domain && !isValidDomain(account.domain)) {
      errors.push({
        field: 'domain',
        value: account.domain,
        message: 'Invalid domain format'
      });
    }
    if (account.email && !isValidEmail(account.email)) {
      errors.push({
        field: 'email',
        value: account.email,
        message: 'Invalid email format'
      });
    }
  }

  // Validate contact entities
  for (const contact of normalizedResult.entities?.contacts || []) {
    if (contact.email && !isValidEmail(contact.email)) {
      errors.push({
        field: 'email',
        value: contact.email,
        message: 'Invalid email format'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedResult
  };
}

/**
 * Check if domain is a common email provider (not a company domain)
 */
function isCommonEmailProvider(domain: string): boolean {
  const commonProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'mail.com',
    'live.com', 'msn.com', 'me.com', 'mac.com'
  ];
  return commonProviders.includes(domain.toLowerCase());
}
