/**
 * Lead Enrichment System - Public Exports
 */

// Types
export * from './types';

// Providers
export { EmailParserProvider, quickEnrichEmail as parseEmail } from './providers/emailParser';

// Universal Adapter
export { UniversalAdapter } from './universalAdapter';

// Main Service
export { 
  EnrichmentService, 
  getEnrichmentService, 
  quickEnrichEmail 
} from './enrichmentService';
