/**
 * Universal HTTP Adapter
 * 
 * Config-driven HTTP adapter that works with any REST API
 * based on provider definitions stored in the database.
 */

import { 
  ProviderDefinition, 
  ProviderConfig, 
  EnrichmentResult, 
  EnrichmentConfidence,
  AuthorityLevel
} from './types';
import { EmailParserProvider } from './providers/emailParser';

// Simple JSONPath implementation for response mapping
function getByPath(obj: unknown, path: string): unknown {
  if (!path || !obj) return undefined;
  
  // Remove leading $. if present
  const cleanPath = path.replace(/^\$\.?/, '');
  
  // Handle array access like [0]
  const parts = cleanPath.split(/[.\[\]]/).filter(Boolean);
  
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    
    // Handle numeric array indices
    const index = parseInt(part, 10);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  
  return current;
}

// Apply transforms to extracted values
function applyTransform(value: unknown, transform: string): unknown {
  if (value === null || value === undefined) return value;
  
  const stringValue = String(value);
  
  if (transform.startsWith('prepend(')) {
    const prefix = transform.match(/prepend\(['"](.+)['"]\)/)?.[1] || '';
    return prefix + stringValue;
  }
  
  if (transform.startsWith('append(')) {
    const suffix = transform.match(/append\(['"](.+)['"]\)/)?.[1] || '';
    return stringValue + suffix;
  }
  
  if (transform === 'lowercase') {
    return stringValue.toLowerCase();
  }
  
  if (transform === 'uppercase') {
    return stringValue.toUpperCase();
  }
  
  if (transform === 'trim') {
    return stringValue.trim();
  }
  
  if (transform === 'first' && Array.isArray(value)) {
    return value[0];
  }
  
  if (transform.startsWith('join(') && Array.isArray(value)) {
    const separator = transform.match(/join\(['"](.+)['"]\)/)?.[1] || ',';
    return value.join(separator);
  }
  
  if (transform === 'map_range' && typeof value === 'number') {
    if (value <= 10) return '1-10';
    if (value <= 50) return '11-50';
    if (value <= 200) return '51-200';
    if (value <= 500) return '201-500';
    if (value <= 1000) return '501-1000';
    if (value <= 5000) return '1001-5000';
    return '5000+';
  }
  
  return value;
}

// Parse and extract value with transforms
function extractValue(obj: unknown, pathWithTransforms: string): unknown {
  // Split path and transforms (separated by |)
  const [path, ...transforms] = pathWithTransforms.split('|').map(s => s.trim());
  
  let value = getByPath(obj, path);
  
  for (const transform of transforms) {
    value = applyTransform(value, transform);
  }
  
  return value;
}

// Evaluate condition for fit scoring
function evaluateCondition(obj: unknown, condition: string): boolean {
  if (!condition) return false;
  
  // Handle special built-in conditions for email parser
  if (['is_business_domain', 'has_parseable_name', 'not_generic_address', 'valid_email_format'].includes(condition)) {
    return false; // These are handled by the email parser
  }
  
  // Parse condition: $.path operator value
  const match = condition.match(/(\$[.\w\[\]]+)\s*(!=|==|>=|<=|>|<|matches)\s*(.+)/);
  if (!match) return false;
  
  const [, path, operator, rawValue] = match;
  const actualValue = getByPath(obj, path);
  
  switch (operator) {
    case '!=':
      if (rawValue === 'null') return actualValue !== null && actualValue !== undefined;
      return actualValue !== rawValue.replace(/['"]/g, '');
    
    case '==':
      if (rawValue === 'null') return actualValue === null || actualValue === undefined;
      return String(actualValue) === rawValue.replace(/['"]/g, '');
    
    case '>':
      return typeof actualValue === 'number' && actualValue > parseFloat(rawValue);
    
    case '>=':
      return typeof actualValue === 'number' && actualValue >= parseFloat(rawValue);
    
    case '<':
      return typeof actualValue === 'number' && actualValue < parseFloat(rawValue);
    
    case '<=':
      return typeof actualValue === 'number' && actualValue <= parseFloat(rawValue);
    
    case 'matches':
      try {
        const regexStr = rawValue.replace(/^\/|\/[gim]*$/g, '');
        const flags = rawValue.match(/\/([gim]*)$/)?.[1] || '';
        const regex = new RegExp(regexStr, flags);
        return typeof actualValue === 'string' && regex.test(actualValue);
      } catch {
        return false;
      }
    
    default:
      return false;
  }
}

export class UniversalAdapter {
  private definition: ProviderDefinition;
  private config: ProviderConfig;

  constructor(definition: ProviderDefinition, config: ProviderConfig) {
    this.definition = definition;
    this.config = config;
  }

  /**
   * Enrich by email address
   */
  async enrichByEmail(email: string): Promise<EnrichmentResult> {
    const endpoint = this.definition.api_config.endpoints?.person;
    if (!endpoint) {
      return this.errorResult('Provider does not support person enrichment');
    }

    const url = this.buildUrl(endpoint.path, { email });
    const body = endpoint.body_template 
      ? this.interpolateTemplate(endpoint.body_template, { email })
      : undefined;

    return this.executeRequest(endpoint.method, url, body, 'person');
  }

  /**
   * Enrich by company domain
   */
  async enrichByDomain(domain: string): Promise<EnrichmentResult> {
    const endpoint = this.definition.api_config.endpoints?.company;
    if (!endpoint) {
      return this.errorResult('Provider does not support company enrichment');
    }

    const url = this.buildUrl(endpoint.path, { domain });
    const body = endpoint.body_template 
      ? this.interpolateTemplate(endpoint.body_template, { domain })
      : undefined;

    return this.executeRequest(endpoint.method, url, body, 'company');
  }

  /**
   * Build the full URL with template interpolation and auth params
   */
  private buildUrl(pathTemplate: string, vars: Record<string, string>): string {
    let path = pathTemplate;
    
    // Interpolate variables
    for (const [key, value] of Object.entries(vars)) {
      path = path.replace(`{{${key}}}`, encodeURIComponent(value));
    }

    const baseUrl = this.definition.api_config.base_url || '';
    const url = new URL(path, baseUrl);

    // Add query param auth if configured
    if (this.definition.api_config.auth_type === 'query_param') {
      const paramName = this.definition.api_config.auth_config?.param_name || 'api_key';
      const apiKey = this.config.credentials?.api_key;
      if (apiKey) {
        url.searchParams.set(paramName, apiKey);
      }
    }

    return url.toString();
  }

  /**
   * Interpolate template variables in request body
   */
  private interpolateTemplate(
    template: Record<string, unknown>, 
    vars: Record<string, string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string') {
        let interpolated = value;
        for (const [varKey, varValue] of Object.entries(vars)) {
          interpolated = interpolated.replace(`{{${varKey}}}`, varValue);
        }
        result[key] = interpolated;
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Build request headers with auth
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const apiKey = this.config.credentials?.api_key;

    switch (this.definition.api_config.auth_type) {
      case 'bearer':
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      
      case 'header':
        const headerName = this.definition.api_config.auth_config?.header_name || 'X-Api-Key';
        if (apiKey) headers[headerName] = apiKey;
        break;
      
      case 'basic':
        const username = this.config.credentials?.username || '';
        const password = this.config.credentials?.password || '';
        const encoded = btoa(`${username}:${password}`);
        headers['Authorization'] = `Basic ${encoded}`;
        break;
    }

    return headers;
  }

  /**
   * Execute the HTTP request
   */
  private async executeRequest(
    method: string,
    url: string,
    body: Record<string, unknown> | undefined,
    mappingType: 'person' | 'company'
  ): Promise<EnrichmentResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined
      });

      const responseTime = Date.now() - startTime;

      // Handle error responses
      if (!response.ok) {
        const errorBehavior = this.getErrorBehavior(response.status);
        
        if (errorBehavior?.behavior === 'return_empty') {
          return {
            success: true,
            provider_key: this.definition.provider_key,
            confidence: 'low',
            fit_score: 0,
            fit_signals: {},
            error: `Not found (${response.status})`
          };
        }

        return this.errorResult(`API error: ${response.status} ${response.statusText}`);
      }

      const rawResponse = await response.json();
      
      // Map response to normalized format
      const mappedResult = this.mapResponse(rawResponse, mappingType);
      
      // Calculate fit score
      const { fitScore, fitSignals } = this.calculateFitScore(rawResponse);
      
      // Infer authority from title
      const inferredAuthority = EmailParserProvider.inferAuthorityFromTitle(mappedResult.title);

      return {
        success: true,
        provider_key: this.definition.provider_key,
        confidence: this.determineConfidence(fitScore, mappedResult),
        ...mappedResult,
        fit_score: fitScore,
        fit_signals: fitSignals,
        inferred_authority: inferredAuthority,
        raw_response: rawResponse
      };

    } catch (error) {
      return this.errorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Map API response to normalized fields
   */
  private mapResponse(
    response: unknown, 
    mappingType: 'person' | 'company'
  ): Partial<EnrichmentResult> {
    const mapping = this.definition.response_mapping[mappingType] || {};
    const result: Partial<EnrichmentResult> = {};

    for (const [field, path] of Object.entries(mapping)) {
      const value = extractValue(response, path);
      if (value !== undefined && value !== null) {
        (result as Record<string, unknown>)[field] = value;
      }
    }

    return result;
  }

  /**
   * Calculate fit score based on scoring rules
   */
  private calculateFitScore(response: unknown): { fitScore: number; fitSignals: Record<string, boolean> } {
    const rules = this.definition.fit_scoring_rules || {};
    const fitSignals: Record<string, boolean> = {};
    let fitScore = 0;

    for (const [ruleName, rule] of Object.entries(rules)) {
      const matched = evaluateCondition(response, rule.condition);
      fitSignals[ruleName] = matched;
      if (matched) {
        fitScore += rule.points;
      }
    }

    return {
      fitScore: Math.min(100, Math.max(0, fitScore)),
      fitSignals
    };
  }

  /**
   * Determine confidence level
   */
  private determineConfidence(fitScore: number, result: Partial<EnrichmentResult>): EnrichmentConfidence {
    // High confidence: good fit score + key fields present
    if (fitScore >= 50 && result.first_name && result.company_name) {
      return 'high';
    }
    
    // Medium confidence: some data found
    if (fitScore >= 20 || result.first_name || result.company_name) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get error behavior for a status code
   */
  private getErrorBehavior(statusCode: number): { behavior: string } | undefined {
    const errorMapping = this.definition.error_mapping || {};
    
    for (const behavior of Object.values(errorMapping)) {
      if (behavior.status_codes?.includes(statusCode)) {
        return behavior;
      }
    }
    
    return undefined;
  }

  /**
   * Create error result
   */
  private errorResult(message: string): EnrichmentResult {
    return {
      success: false,
      provider_key: this.definition.provider_key,
      confidence: 'low',
      fit_score: 0,
      fit_signals: {},
      error: message
    };
  }
}
