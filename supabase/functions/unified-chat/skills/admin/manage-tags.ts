/**
 * Skill: manage_tags
 *
 * Add, remove, or list tags on CRM entities (contacts, accounts, deals, etc.)
 * Tags enable filtering, grouping, and AI-driven categorization.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const manageTags: SkillDefinition = {
  name: 'manage_tags',
  displayName: 'Manage Tags',
  domain: 'admin',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'manage_tags',
      description:
        'Add, remove, or list tags on CRM entities. Tags help categorize and filter contacts, accounts, deals, activities, and tasks. Use for labeling entities with custom tags like "enterprise", "partner-referred", "at-risk", "healthcare", etc.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove', 'list'],
            description: 'Action to perform: add tags, remove tags, or list tags on an entity',
          },
          entity_type: {
            type: 'string',
            enum: ['contact', 'account', 'deal', 'activity', 'task', 'source_document'],
            description: 'Type of entity to tag',
          },
          entity_id: {
            type: 'string',
            description: 'UUID of the entity to tag',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add or remove (not required for list action)',
          },
          tag_category: {
            type: 'string',
            enum: ['user', 'system', 'ai'],
            description: 'Category of tag (default: user)',
          },
        },
        required: ['action', 'entity_type', 'entity_id'],
      },
    },
  },

  instructions: `**For tagging entities** → Use manage_tags
  - "tag acme as enterprise" → action: add, entity_type: account, tags: ["enterprise"]
  - "remove the healthcare tag from this deal" → action: remove, tags: ["healthcare"]
  - "what tags does this contact have?" → action: list
  - Tags are case-insensitive and normalized to lowercase
  - AI-generated tags include a confidence score`,

  execute: async (ctx: ToolExecutionContext) => {
    const { action, entity_type, entity_id, tags, tag_category } = ctx.args as {
      action: 'add' | 'remove' | 'list';
      entity_type: string;
      entity_id: string;
      tags?: string[];
      tag_category?: string;
    };

    if (action === 'list') {
      const { data, error } = await ctx.supabase
        .from('entity_tags')
        .select('tag, tag_category, confidence, created_at')
        .eq('organization_id', ctx.organizationId)
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        entity_type,
        entity_id,
        tags: data || [],
        count: data?.length || 0,
      };
    }

    if (!tags || tags.length === 0) {
      return { error: 'No tags provided. Please specify which tags to add or remove.' };
    }

    // Normalize tags to lowercase, trim whitespace
    const normalizedTags = tags.map((t: string) => t.toLowerCase().trim()).filter(Boolean);

    if (action === 'add') {
      const rows = normalizedTags.map((tag: string) => ({
        organization_id: ctx.organizationId,
        entity_type,
        entity_id,
        tag,
        tag_category: tag_category || 'user',
        created_by: ctx.userId,
      }));

      const { data, error } = await ctx.supabase
        .from('entity_tags')
        .upsert(rows, { onConflict: 'organization_id,entity_type,entity_id,tag' })
        .select('tag, tag_category');

      if (error) throw error;

      return {
        action: 'added',
        entity_type,
        entity_id,
        tags: data?.map((r: any) => r.tag) || normalizedTags,
        count: data?.length || normalizedTags.length,
      };
    }

    if (action === 'remove') {
      const { error } = await ctx.supabase
        .from('entity_tags')
        .delete()
        .eq('organization_id', ctx.organizationId)
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .in('tag', normalizedTags);

      if (error) throw error;

      return {
        action: 'removed',
        entity_type,
        entity_id,
        tags: normalizedTags,
        count: normalizedTags.length,
      };
    }

    return { error: `Unknown action: ${action}` };
  },

  triggerExamples: [
    'tag this deal as enterprise',
    'add healthcare tag to acme',
    'remove the partner tag',
    'what tags does this contact have',
    'label this as high-priority',
  ],
};

export default manageTags;
