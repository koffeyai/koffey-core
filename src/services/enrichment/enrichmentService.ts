/**
 * Enrichment Service
 * 
 * Orchestrates provider selection, execution, and contact updates
 */

import { supabase } from '@/integrations/supabase/client';
import { 
  ProviderDefinition, 
  ProviderConfig, 
  EnrichmentResult,
  EnrichmentServiceConfig,
  QualificationStage
} from './types';
import { UniversalAdapter } from './universalAdapter';
import { EmailParserProvider } from './providers/emailParser';

export class EnrichmentService {
  private organizationId: string;
  private enableLogging: boolean;
  private fallbackToEmailParser: boolean;
  
  private providers: Array<{
    definition: ProviderDefinition;
    config: ProviderConfig | null;
    adapter: UniversalAdapter | EmailParserProvider;
  }> = [];
  
  private initialized = false;

  constructor(config: EnrichmentServiceConfig) {
    this.organizationId = config.organization_id;
    this.enableLogging = config.enable_logging ?? true;
    this.fallbackToEmailParser = config.fallback_to_email_parser ?? true;
  }

  /**
   * Initialize the service by loading provider configurations
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load provider definitions
    const { data: definitions, error: defError } = await supabase
      .from('enrichment_provider_definitions')
      .select('*')
      .or(`is_system_default.eq.true,created_by_org.eq.${this.organizationId}`);

    if (defError) {
      console.error('Failed to load provider definitions:', defError);
      throw new Error('Failed to initialize enrichment service');
    }

    // Load org-specific configurations (BYOK API keys)
    const { data: configs, error: configError } = await supabase
      .from('enrichment_provider_configs')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (configError) {
      console.error('Failed to load provider configs:', configError);
    }

    // Build provider list sorted by priority
    const configuredProviders: typeof this.providers = [];
    const emailParserDef = definitions?.find(d => d.provider_key === 'email_parser');

    // Add configured BYOK providers first (by priority)
    if (configs && definitions) {
      for (const config of configs) {
        const definition = definitions.find(d => d.id === config.provider_definition_id);
        if (definition && definition.provider_key !== 'email_parser') {
          const typedDef = definition as unknown as ProviderDefinition;
          const typedConfig = config as unknown as ProviderConfig;
          configuredProviders.push({
            definition: typedDef,
            config: typedConfig,
            adapter: new UniversalAdapter(typedDef, typedConfig)
          });
        }
      }
    }

    // Add email parser as fallback (always available)
    if (this.fallbackToEmailParser && emailParserDef) {
      configuredProviders.push({
        definition: emailParserDef as unknown as ProviderDefinition,
        config: null,
        adapter: new EmailParserProvider()
      });
    }

    this.providers = configuredProviders;
    this.initialized = true;
  }

  /**
   * Get list of configured provider keys
   */
  getConfiguredProviders(): string[] {
    return this.providers.map(p => p.definition.provider_key);
  }

  /**
   * Enrich by email address (tries providers in priority order)
   */
  async enrichEmail(email: string, preferredProvider?: string): Promise<EnrichmentResult> {
    await this.initialize();

    let providers = [...this.providers];

    // If preferred provider specified, try it first
    if (preferredProvider) {
      const preferred = providers.find(p => p.definition.provider_key === preferredProvider);
      if (preferred) {
        providers = [preferred, ...providers.filter(p => p.definition.provider_key !== preferredProvider)];
      }
    }

    // Try each provider until one succeeds with useful data
    for (const provider of providers) {
      try {
        let result: EnrichmentResult;

        if (provider.adapter instanceof EmailParserProvider) {
          result = await provider.adapter.enrich(email);
        } else {
          result = await provider.adapter.enrichByEmail(email);
        }

        // Log the attempt
        if (this.enableLogging) {
          await this.logEnrichment(null, provider.definition.provider_key, email, result);
        }

        // If we got useful data, return it
        if (result.success && (result.fit_score > 0 || result.first_name || result.company_name)) {
          return result;
        }

        // Continue to next provider if this one returned empty/low-value result
        console.log(`Provider ${provider.definition.provider_key} returned limited data, trying next...`);

      } catch (error) {
        console.error(`Provider ${provider.definition.provider_key} failed:`, error);
        // Continue to next provider
      }
    }

    // All providers failed or returned no data
    return {
      success: false,
      provider_key: 'none',
      confidence: 'low',
      fit_score: 0,
      fit_signals: {},
      error: 'No enrichment data found from any provider'
    };
  }

  /**
   * Enrich a contact by ID
   */
  async enrichContact(contactId: string, forceRefresh = false): Promise<{
    success: boolean;
    result: EnrichmentResult;
    contact: Record<string, unknown> | null;
  }> {
    await this.initialize();

    // Fetch the contact
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (fetchError || !contact) {
      return {
        success: false,
        result: {
          success: false,
          provider_key: 'none',
          confidence: 'low',
          fit_score: 0,
          fit_signals: {},
          error: 'Contact not found'
        },
        contact: null
      };
    }

    // Check if already enriched recently (within 30 days)
    if (!forceRefresh && contact.enriched_at) {
      const enrichedAt = new Date(contact.enriched_at);
      const daysSinceEnrichment = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceEnrichment < 30) {
        return {
          success: true,
          result: {
            success: true,
            provider_key: contact.enrichment_provider || 'cached',
            confidence: (String(contact.enrichment_confidence || 'medium') as 'high' | 'medium' | 'low'),
            fit_score: (contact.fit_score as number) || 0,
            fit_signals: (contact.fit_signals as Record<string, boolean>) || {},
            first_name: contact.first_name || undefined,
            last_name: contact.last_name || undefined,
            company_name: contact.company || undefined
          },
          contact
        };
      }
    }

    // Need email to enrich
    if (!contact.email) {
      return {
        success: false,
        result: {
          success: false,
          provider_key: 'none',
          confidence: 'low',
          fit_score: 0,
          fit_signals: {},
          error: 'Contact has no email address'
        },
        contact
      };
    }

    // Perform enrichment
    const result = await this.enrichEmail(contact.email);

    // Log the enrichment
    if (this.enableLogging) {
      await this.logEnrichment(contactId, result.provider_key, contact.email, result);
    }

    // Update the contact with enriched data
    if (result.success) {
      const updates: Record<string, unknown> = {
        enriched_at: new Date().toISOString(),
        enrichment_provider: result.provider_key,
        enrichment_confidence: result.confidence,
        fit_score: result.fit_score,
        fit_signals: result.fit_signals
      };

      // Only update fields if they're missing on the contact
      if (!contact.first_name && result.first_name) {
        updates.first_name = result.first_name;
      }
      if (!contact.last_name && result.last_name) {
        updates.last_name = result.last_name;
      }
      if ((!contact.first_name || !contact.last_name) && result.first_name) {
        updates.full_name = [result.first_name, result.last_name].filter(Boolean).join(' ');
      }
      if (!contact.company && result.company_name) {
        updates.company = result.company_name;
      }
      if (!contact.title && result.title) {
        updates.title = result.title;
      }
      if (!contact.phone && result.phone) {
        updates.phone = result.phone;
      }

      // Infer authority level if we have a title
      if (result.inferred_authority && result.inferred_authority !== 'unknown') {
        if (!contact.authority_level || contact.authority_level === 'unknown') {
          updates.authority_level = result.inferred_authority;
        }
      }

      // Progress qualification stage if data was found
      if (result.fit_score > 0 && contact.qualification_stage === 'captured') {
        updates.qualification_stage = 'enriched' as QualificationStage;
      }

      const { data: updatedContact, error: updateError } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', contactId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update contact:', updateError);
        return { success: true, result, contact };
      }

      return { success: true, result, contact: updatedContact };
    }

    return { success: false, result, contact };
  }

  /**
   * Log enrichment request for auditing
   */
  private async logEnrichment(
    contactId: string | null,
    providerKey: string,
    lookupValue: string,
    result: EnrichmentResult
  ): Promise<void> {
    try {
      await supabase.from('enrichment_logs').insert({
        organization_id: this.organizationId,
        contact_id: contactId,
        provider_key: providerKey,
        request_type: 'person',
        lookup_value: lookupValue,
        success: result.success,
        response_data: {
          confidence: result.confidence,
          fit_score: result.fit_score,
          fit_signals: result.fit_signals,
          first_name: result.first_name,
          last_name: result.last_name,
          company_name: result.company_name
        },
        error_message: result.error
      });
    } catch (error) {
      console.error('Failed to log enrichment:', error);
    }
  }
}

// Singleton instance cache
const serviceCache = new Map<string, EnrichmentService>();

/**
 * Get or create an enrichment service instance for an organization
 */
export function getEnrichmentService(organizationId: string): EnrichmentService {
  if (!serviceCache.has(organizationId)) {
    serviceCache.set(organizationId, new EnrichmentService({
      organization_id: organizationId,
      enable_logging: true,
      fallback_to_email_parser: true
    }));
  }
  return serviceCache.get(organizationId)!;
}

/**
 * Quick helper to enrich an email without managing service lifecycle
 */
export async function quickEnrichEmail(
  email: string, 
  organizationId: string
): Promise<EnrichmentResult> {
  const service = getEnrichmentService(organizationId);
  await service.initialize();
  return service.enrichEmail(email);
}
