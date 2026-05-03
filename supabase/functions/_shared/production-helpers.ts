/**
 * Production-Ready Helpers - Zero user-visible failures
 */

// Safe fetch with timeout + retry
export async function safeFetch(url: string, init: RequestInit, { timeoutMs = 8000, retries = 2 } = {}) {
  for (let a = 0; a <= retries; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) { 
        await new Promise(r => setTimeout(r, 300 * (2 ** a))); 
        continue; 
      }
      throw new Error(`HTTP_${res.status}`);
    } catch (e: any) { 
      clearTimeout(t);
      if (a === retries) throw e; 
    }
  }
  throw new Error("unreachable");
}

// Safe JSON parsing
export async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

// Markdown escaping - prevent injection
export const md = (s = ""): string => s.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");

// Currency formatting - pinned locale, zero-safe
export const money = (n?: number | null, c = "USD"): string => {
  if (n === null || n === undefined) return "TBD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);
};

// Date formatting - consistent locale
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "TBD";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: 'numeric',
      month: 'short', 
      day: 'numeric'
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

// Name handling - clean fallbacks
export const displayName = (contact: any): string => {
  if (!contact) return "Unknown Name";
  const combined = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  return md(contact.full_name ?? combined || "Unknown Name");
};

// Structured logging
export const log = (evt: string, data: Record<string, any> = {}) => {
  console.log(JSON.stringify({ 
    evt, 
    ts: new Date().toISOString(), 
    ...data 
  }));
};

// Schema validation result
export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: string[];
}

// Validate database search result shape
export function validateDbSearchResult(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Invalid response format'] };
  }
  
  // Coerce to expected shape
  const coerced = {
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    deals: Array.isArray(data.deals) ? data.deals : [],
    total: typeof data.total === 'number' ? data.total : 0,
    next_cursor: typeof data.next_cursor === 'string' ? data.next_cursor : undefined
  };
  
  return { isValid: true, data: coerced };
}

// Router JSON-Schema validation
export function validateRouterOutput(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Router returned invalid format'] };
  }
  
  const validIntents = [
    'list_contacts', 'list_accounts', 'list_deals',
    'add_contact', 'create_opportunity', 'update_opportunity_stage',
    'search_records', 'generate_report', 'unknown'
  ];
  
  if (!validIntents.includes(data.intent)) {
    return { isValid: false, errors: [`Invalid intent: ${data.intent}`] };
  }
  
  // Coerce to valid shape
  const coerced = {
    intent: data.intent,
    entity: data.entity || '',
    arguments: data.arguments || {},
    cursor: data.cursor,
    limit: Math.min(Math.max(data.limit || 10, 1), 50),
    confidence: Math.min(Math.max(data.confidence || 0.5, 0), 1)
  };
  
  return { isValid: true, data: coerced };
}

// Contact validation - enforce required fields
export function validateContactPayload(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Contact data required'] };
  }
  
  const errors: string[] = [];
  
  if (!data.first_name?.trim()) errors.push('first_name is required');
  if (!data.last_name?.trim()) errors.push('last_name is required');
  if (!data.email?.trim()) errors.push('email is required');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('email must be valid format');
  }
  
  if (errors.length > 0) {
    return { isValid: false, errors };
  }
  
  return { isValid: true, data };
}

// Opportunity validation - enforce required fields + enums
export function validateOpportunityPayload(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Opportunity data required'] };
  }
  
  const errors: string[] = [];
  const validStages = [
    '0-Prospect', '1-Qualification', '2-Discovery', '3-Evaluation',
    '4-Commitment', '5-Negotiation', '6-ClosedWon', '6-ClosedLost', '7-Nurture'
  ];
  
  if (!data.name?.trim()) errors.push('name is required');
  if (!data.account_id?.trim()) errors.push('account_id is required');
  if (!data.stage?.trim()) errors.push('stage is required');
  if (data.stage && !validStages.includes(data.stage)) {
    errors.push(`stage must be one of: ${validStages.join(', ')}`);
  }
  if (!data.close_date) errors.push('close_date is required (YYYY-MM-DD)');
  if (data.close_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.close_date)) {
    errors.push('close_date must be YYYY-MM-DD format');
  }
  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount < 0)) {
    errors.push('amount must be a positive number');
  }
  
  if (errors.length > 0) {
    return { isValid: false, errors };
  }
  
  return { isValid: true, data };
}