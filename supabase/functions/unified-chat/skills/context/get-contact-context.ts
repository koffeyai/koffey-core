/**
 * Skill: get_contact_context
 *
 * Fetch comprehensive, pre-joined contact context from the
 * get_contact_context_for_llm Postgres RPC. Returns personal info,
 * lead score, account, active deals, activities, tasks, messages,
 * campaigns, and web engagement in a single call — optimised for
 * LLM synthesis.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

// ---------------------------------------------------------------------------
// Entity-name helpers (shared pattern from analyze-deal)
// ---------------------------------------------------------------------------

function cleanEntityDisplayName(displayName: string): string {
  if (!displayName) return '';

  let cleaned = displayName;
  // Strip markdown bold markers
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  // Strip leading numbered-list prefixes ("1. ")
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  // Strip trailing parenthetical suffixes
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  // Normalise dashes
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');

  // Strip trailing " - <date|amount|stage|percent>" suffixes iteratively
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

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function buildMissingContactDetailsPrompt(contactHint?: string): string {
  const cleanedHint = cleanEntityDisplayName(contactHint || '');
  const email = cleanedHint.match(EMAIL_PATTERN)?.[0]?.toLowerCase() || null;
  const target = cleanedHint || 'that person';

  if (email) {
    return `I couldn't find a contact matching "${email}". If this is a new person, I can add them. I already have the email, so please provide first name, last name, and title. Company/account and notes are helpful if you have them.`;
  }

  return `I couldn't find a contact matching "${target}". If this is a new person, I can add them. Please provide first name, last name, title, and email. Company/account and notes are helpful if you have them.`;
}

// ---------------------------------------------------------------------------
// Entity resolution from conversation context
// ---------------------------------------------------------------------------

function resolveContactFromContext(
  entityContext: ToolExecutionContext['entityContext'],
  nameHint?: string,
): string | null {
  if (!entityContext?.referencedEntities) return null;

  const contacts = entityContext.referencedEntities['contacts'];
  if (!contacts || contacts.length === 0) return null;

  // If the primary entity is a contact, try to match it first
  if (entityContext.primaryEntity?.type === 'contact') {
    if (!nameHint) return entityContext.primaryEntity.id ?? null;
    const hintClean = stripArticles(cleanEntityDisplayName(nameHint)).toLowerCase();
    const primaryClean = stripArticles(entityContext.primaryEntity.name ?? '').toLowerCase();
    if (primaryClean.includes(hintClean) || hintClean.includes(primaryClean)) {
      return entityContext.primaryEntity.id ?? null;
    }
  }

  // Try fuzzy-matching against all referenced contact entities
  if (nameHint) {
    const cleanedHint = cleanEntityDisplayName(nameHint).toLowerCase();
    const cleanedHintNoArticle = stripArticles(cleanedHint).toLowerCase();
    const match = contacts.find((e: { id: string; name: string }) => {
      const cleanedName = (e.name || '').toLowerCase();
      const cleanedNameNoArticle = stripArticles(e.name || '').toLowerCase();
      return (
        cleanedName.includes(cleanedHint) ||
        cleanedHint.includes(cleanedName) ||
        cleanedNameNoArticle.includes(cleanedHintNoArticle) ||
        cleanedHintNoArticle.includes(cleanedNameNoArticle)
      );
    });
    if (match) return match.id;
    return null;
  }

  // No name hint — return first referenced contact
  return contacts[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

const getContactContext: SkillDefinition = {
  name: 'get_contact_context',
  displayName: 'Get Contact Context',
  domain: 'context',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_contact_context',
      description:
        'Fetch comprehensive context for a contact in a single call: personal info, lead score, account, active deals, activities, tasks, messages, campaigns, and web engagement. Use this INSTEAD of multiple search_crm calls when you need a full picture of a contact. Prefer contact_id over contact_name when available from entity context or previous tool results.',
      parameters: {
        type: 'object',
        properties: {
          contact_id: {
            type: 'string',
            description: 'UUID of the contact.',
          },
          contact_name: {
            type: 'string',
            description: 'Name of the contact to search for.',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "tell me about [contact]", "what do we know about [person]", "contact summary", "brief me on [person]", "who is [person]"** \u2192 Use get_contact_context
- Returns complete contact context: personal info, lead score, account, active deals, activities, tasks, messages, campaigns, web engagement
- Use this INSTEAD of multiple search_crm calls when you need comprehensive contact information
- Prefer contact_id over contact_name when available from context`,

  execute: async (ctx: ToolExecutionContext) => {
    const args = (ctx.args || {}) as {
      contact_id?: string;
      contact_name?: string;
    };

    // ----- 1. Resolve contact_id from args / entityContext / activeContext -----

    let contactId = args.contact_id;

    // Try entity context when we have a name hint but no id
    if (!contactId && args.contact_name && ctx.entityContext) {
      contactId = resolveContactFromContext(ctx.entityContext, args.contact_name) ?? undefined;
    }

    // Try entity context without a name hint (primary entity)
    if (!contactId && !args.contact_name && ctx.entityContext) {
      contactId = resolveContactFromContext(ctx.entityContext) ?? undefined;
    }

    // Fall back to activeContext (most recently discussed contact)
    if (
      !contactId &&
      !args.contact_name &&
      ctx.activeContext?.lastEntityType === 'contacts' &&
      ctx.activeContext.lastEntityIds?.length === 1
    ) {
      contactId = ctx.activeContext.lastEntityIds[0];
    }

    // ----- 2. If still no id but we have a name, search contacts table -----

    if (!contactId && args.contact_name) {
      const cleanedName = cleanEntityDisplayName(args.contact_name);
      const noArticle = stripArticles(cleanedName);

      const { data: contacts, error } = await ctx.supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company')
        .eq('organization_id', ctx.organizationId)
        .or(
          `first_name.ilike.%${cleanedName}%,last_name.ilike.%${cleanedName}%,full_name.ilike.%${cleanedName}%,email.ilike.%${cleanedName}%,first_name.ilike.%${noArticle}%,last_name.ilike.%${noArticle}%,full_name.ilike.%${noArticle}%`,
        )
        .limit(5);

      if (error) {
        return { success: false, message: `Error searching for contact: ${error.message}` };
      }

      if (!contacts || contacts.length === 0) {
        return {
          success: false,
          _needsInput: true,
          clarification_type: 'missing_contact_details',
          missing: cleanedName.match(EMAIL_PATTERN)
            ? ['first_name', 'last_name', 'title']
            : ['first_name', 'last_name', 'title', 'email'],
          proposed_contact: {
            email: cleanedName.match(EMAIL_PATTERN)?.[0]?.toLowerCase() || null,
          },
          message: buildMissingContactDetailsPrompt(cleanedName),
        };
      }

      if (contacts.length > 1) {
        const contactList = contacts
          .map((c: any, i: number) => {
            const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
            const detail = c.company ? `${fullName} (${c.company})` : fullName;
            return `${i + 1}. **${detail}**${c.email ? ` - ${c.email}` : ''}`;
          })
          .join('\n');

        return {
          success: false,
          message: `I found multiple contacts matching "${cleanedName}":\n\n${contactList}\n\nWhich one would you like context on?`,
        };
      }

      // Single match
      contactId = contacts[0].id;
    }

    // ----- 3. If we still don't have a contact_id, ask the user -----

    if (!contactId) {
      // If activeContext has multiple contacts, offer disambiguation
      if (
        ctx.activeContext?.lastEntityType === 'contacts' &&
        (ctx.activeContext.lastEntityNames?.length || 0) > 1
      ) {
        const contactList = (ctx.activeContext.lastEntityNames || [])
          .slice(0, 5)
          .map((name: string, i: number) => `${i + 1}. **${name}**`)
          .join('\n');
        return {
          success: false,
          message: `I see several recent contacts:\n\n${contactList}\n\nWhich one would you like context on?`,
        };
      }

      return {
        success: false,
        message:
          'Which contact would you like context on? Share their name, or if this is a new person, send first name, last name, title, and email so I can add them.',
      };
    }

    // ----- 4. Call the RPC -----

    const { data, error } = await ctx.supabase.rpc('get_contact_context_for_llm', {
      p_contact_id: contactId,
      p_organization_id: ctx.organizationId,
    });

    if (error) {
      return { success: false, message: `Error fetching contact context: ${error.message}` };
    }

    if (!data) {
      return {
        success: false,
        message:
          'Could not retrieve contact context. The contact may not exist or you may not have access.',
      };
    }

    // ----- 5. Return pre-shaped context -----

    return {
      ...data,
      __trusted_context: true,
    };
  },

  triggerExamples: [
    'tell me about Sarah Johnson',
    'what do we know about Mike at Target?',
    'contact summary for John',
    'brief me on this contact',
    'who is Lisa Chen?',
    'give me context on the main contact at Pepsi',
  ],
};

export default getContactContext;
