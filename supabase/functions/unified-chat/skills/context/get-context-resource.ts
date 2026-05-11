/**
 * Skill: get_context_resource
 *
 * Generic read-only context gateway for typed CRM resources. This lets the
 * agent request a domain resource while the backend maps it to the correct
 * permission-scoped context skill.
 */

import type { SkillDefinition } from '../types.ts';
import { resolveContextResource } from './resource-gateway.ts';

const getContextResource: SkillDefinition = {
  name: 'get_context_resource',
  displayName: 'Get Context Resource',
  domain: 'context',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_context_resource',
      description:
        'Read a typed CRM context resource through the Koffey context gateway. Supports crm://deals/{id}/context, crm://accounts/{id}/context, crm://contacts/{id}/context, crm://accounts/{id}/messages, and analytics://pipeline. Use this for holistic CRM retrieval instead of making several unrelated lookups.',
      parameters: {
        type: 'object',
        properties: {
          resource_uri: {
            type: 'string',
            description:
              'Optional resource URI, for example crm://accounts/{account_id}/context, crm://deals/by-name/Acme/context, crm://contacts/{contact_id}/messages?limit=10, or analytics://pipeline?scope=org.',
          },
          resource_type: {
            type: 'string',
            enum: ['deal_context', 'account_context', 'contact_context', 'pipeline_context', 'entity_messages'],
            description: 'Structured fallback when resource_uri is not provided.',
          },
          entity_type: {
            type: 'string',
            enum: ['deal', 'account', 'contact'],
            description: 'Entity type for message resources.',
          },
          entity_id: {
            type: 'string',
            description: 'UUID of the target deal, account, or contact.',
          },
          entity_name: {
            type: 'string',
            description: 'Name of the target deal, account, or contact when the UUID is not known.',
          },
          period_start: {
            type: 'string',
            description: 'Start date for pipeline context in YYYY-MM-DD format.',
          },
          period_end: {
            type: 'string',
            description: 'End date for pipeline context in YYYY-MM-DD format.',
          },
          scope: {
            type: 'string',
            enum: ['mine', 'org'],
            description: 'Pipeline scope for analytics://pipeline resources.',
          },
          limit: {
            type: 'number',
            description: 'Maximum messages to return for message resources. Max 25.',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For holistic CRM context retrieval** -> Use get_context_resource when you can express the need as a typed resource:
- Deal context: crm://deals/{deal_id}/context
- Account context: crm://accounts/{account_id}/context
- Contact context: crm://contacts/{contact_id}/context
- Message history: crm://accounts/{account_id}/messages or crm://contacts/{contact_id}/messages
- Pipeline context: analytics://pipeline?scope=org

This gateway preserves typed tools, organization scoping, and citations. Do not use it for mutations.`,

  execute: async (ctx) => {
    return await resolveContextResource(ctx, ctx.args || {});
  },

  triggerExamples: [
    'read crm://accounts/acct-123/context',
    'get account context for Acme',
    'pull message history for this account',
    'pipeline context for the org',
  ],
};

export default getContextResource;
