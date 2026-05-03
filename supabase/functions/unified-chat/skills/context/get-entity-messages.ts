/**
 * Skill: get_entity_messages
 *
 * Fetch cross-channel messages for any entity (deal, contact, account)
 * from the get_entity_messages Postgres RPC, which queries the
 * entity_messages_unified view (chat, messaging, email, call).
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';
import { normalizeEntityHint } from '../../intent/interpret-message.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanEntityDisplayName(displayName: string): string {
  if (!displayName) return '';
  let cleaned = displayName;
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');
  const suffixPattern =
    /\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{4}|\$[\d,.]+[KMB]?|prospecting|qualification|proposal|negotiation|closed[_\s]?(won|lost)?|\d+%?).*$/i;
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(suffixPattern, '');
  }
  return cleaned.trim();
}

function stripArticles(name: string): string {
  return name.replace(/^(the|a|an)\s+/i, '').trim();
}

/** Try to resolve an entity id from entityContext or activeContext. */
function resolveEntityId(
  ctx: ToolExecutionContext,
  entityType: string | undefined,
  entityName: string | undefined,
): { entityType: string; entityId: string } | null {
  // Explicit IDs from caller always win
  // (handled by caller before reaching here)

  // 1. Primary entity from entityContext
  if (ctx.entityContext?.primaryEntity?.id && ctx.entityContext.primaryEntity.type) {
    const pe = ctx.entityContext.primaryEntity;
    if (!entityType || pe.type === entityType) {
      return { entityType: pe.type, entityId: pe.id };
    }
  }

  // 2. Referenced entities matching type
  if (entityType && ctx.entityContext?.referencedEntities) {
    const pluralKey = entityType.endsWith('s') ? entityType : `${entityType}s`;
    const refs = (ctx.entityContext.referencedEntities as Record<string, Array<{ id: string; name: string }>>)[pluralKey];
    if (refs && refs.length > 0) {
      if (entityName) {
        const hint = String(normalizeEntityHint(entityName, { entityType }) || stripArticles(cleanEntityDisplayName(entityName))).toLowerCase();
        const match = refs.find(
          (r) =>
            (r.name || '').toLowerCase().includes(hint) ||
            hint.includes((r.name || '').toLowerCase()),
        );
        if (match) return { entityType, entityId: match.id };
      }
      return { entityType, entityId: refs[0].id };
    }
  }

  // 3. Active context
  if (
    ctx.activeContext?.lastEntityType &&
    ctx.activeContext.lastEntityIds?.length === 1
  ) {
    const lastType = ctx.activeContext.lastEntityType.replace(/s$/, '');
    if (!entityType || lastType === entityType) {
      return { entityType: lastType, entityId: ctx.activeContext.lastEntityIds[0] };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

const getEntityMessages: SkillDefinition = {
  name: 'get_entity_messages',
  displayName: 'Get Entity Messages',
  domain: 'context',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_entity_messages',
      description:
        'Fetch recent messages across all channels (chat, WhatsApp, SMS, email, call) for a specific entity. Returns a chronological list of messages with source attribution. Use when the user asks about communication history with a deal, contact, or account.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            enum: ['deal', 'contact', 'account'],
            description: 'The type of entity to fetch messages for.',
          },
          entity_id: {
            type: 'string',
            description: 'UUID of the entity. Use when available from context or previous tool results.',
          },
          entity_name: {
            type: 'string',
            description: 'Name of the entity to search for if entity_id is not available.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default 10, max 25).',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "what messages do we have with [entity]", "communication history", "what did they say", "show messages", "recent conversations"** → Use get_entity_messages
- Returns cross-channel messages (chat, WhatsApp, SMS, email, call) for a deal, contact, or account
- Use when the user wants to review communication history or find specific messages
- Results include source attribution (which system the message came from)`,

  execute: async (ctx: ToolExecutionContext) => {
    const args = (ctx.args || {}) as {
      entity_type?: string;
      entity_id?: string;
      entity_name?: string;
      limit?: number;
    };

    let entityType = args.entity_type;
    let entityId = args.entity_id;
    const limit = Math.min(Math.max(args.limit || 10, 1), 25);

    // Try to resolve from context if not provided
    if (!entityId) {
      const resolved = resolveEntityId(ctx, entityType, args.entity_name);
      if (resolved) {
        entityType = resolved.entityType;
        entityId = resolved.entityId;
      }
    }

    // If we have a name but no ID, search for the entity
    if (!entityId && args.entity_name && entityType) {
      const cleanedName = normalizeEntityHint(args.entity_name, { entityType }) || cleanEntityDisplayName(args.entity_name);
      const noArticle = stripArticles(cleanedName);
      const tableName =
        entityType === 'deal' ? 'deals' :
        entityType === 'contact' ? 'contacts' :
        entityType === 'account' ? 'accounts' : null;

      if (tableName) {
        const orFilter = tableName === 'contacts'
          ? `full_name.ilike.%${cleanedName}%,first_name.ilike.%${cleanedName}%,last_name.ilike.%${cleanedName}%,full_name.ilike.%${noArticle}%,first_name.ilike.%${noArticle}%,last_name.ilike.%${noArticle}%`
          : `name.ilike.%${cleanedName}%,name.ilike.%${noArticle}%`;
        const { data: matches } = await ctx.supabase
          .from(tableName)
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .or(orFilter)
          .limit(1);

        if (matches && matches.length === 1) {
          entityId = matches[0].id;
        }
      }
    }

    if (!entityType || !entityId) {
      return {
        success: false,
        message:
          'I need to know which entity to fetch messages for. Please specify the entity type (deal, contact, or account) and name.',
      };
    }

    // Call the RPC
    const { data, error } = await ctx.supabase.rpc('get_entity_messages', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_organization_id: ctx.organizationId,
      p_limit: limit,
    });

    if (error) {
      return { success: false, message: `Error fetching messages: ${error.message}` };
    }

    const messages = data || [];

    return {
      entity_type: entityType,
      entity_id: entityId,
      messages,
      count: messages.length,
      __trusted_context: true,
    };
  },

  triggerExamples: [
    'what messages do we have with Acme?',
    'show me recent communications with John',
    'what did they say about pricing?',
    'communication history for this deal',
  ],
};

export default getEntityMessages;
