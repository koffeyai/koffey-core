/**
 * Skill: manage_custom_fields
 *
 * Manage custom fields on CRM entities.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const manageCustomFields: SkillDefinition = {
  name: 'manage_custom_fields',
  displayName: 'Manage Custom Fields',
  domain: 'admin',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'manage_custom_fields',
      description: 'Manage custom fields on CRM entities. Can list, create, or update custom field definitions.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create', 'delete'],
            description: 'Action to perform',
          },
          entity_type: {
            type: 'string',
            enum: ['contacts', 'accounts', 'deals', 'activities'],
            description: 'Which entity type the field applies to',
          },
          field_name: { type: 'string', description: 'Field name (snake_case)' },
          field_label: { type: 'string', description: 'Display label' },
          field_type: {
            type: 'string',
            enum: ['text', 'number', 'dropdown', 'date', 'checkbox', 'url', 'email'],
            description: 'Type of field',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Options for dropdown fields',
          },
          is_required: { type: 'boolean' },
        },
        required: ['action'],
      },
    },
  },

  instructions: `**For "add a custom field", "list custom fields", "create a dropdown field"** → Use manage_custom_fields
  - Supports list, create, delete actions on custom field definitions`,

  execute: async (ctx: ToolExecutionContext) => {
    const { action, entity_type, field_name, field_label, field_type, options, is_required } = ctx.args as {
      action: 'list' | 'create' | 'delete';
      entity_type?: string;
      field_name?: string;
      field_label?: string;
      field_type?: string;
      options?: string[];
      is_required?: boolean;
    };

    // Custom fields are stored in the custom_fields table.
    // If the table doesn't exist yet, the query will error and we handle it gracefully.
    const tableName = 'custom_fields';

    if (action === 'list') {
      let query = ctx.supabase
        .from(tableName)
        .select('*')
        .eq('organization_id', ctx.organizationId)
        .order('created_at', { ascending: false });

      if (entity_type) query = query.eq('entity_type', entity_type);

      const { data, error } = await query;

      if (error) {
        // Table may not exist yet — return empty
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return { fields: [], count: 0, note: 'Custom fields table not yet provisioned for this organization.' };
        }
        throw error;
      }

      return { fields: data || [], count: (data || []).length };
    }

    if (action === 'create') {
      if (!entity_type) return { error: 'entity_type is required to create a custom field.' };
      if (!field_name) return { error: 'field_name is required to create a custom field.' };
      if (!field_type) return { error: 'field_type is required to create a custom field.' };

      const row = {
        organization_id: ctx.organizationId,
        entity_type,
        field_name: field_name.toLowerCase().replace(/\s+/g, '_'),
        field_label: field_label || field_name,
        field_type,
        options: field_type === 'dropdown' ? options || [] : null,
        is_required: is_required || false,
        created_by: ctx.userId,
      };

      const { data, error } = await ctx.supabase
        .from(tableName)
        .insert(row)
        .select()
        .single();

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return { error: 'Custom fields table not yet provisioned. Please contact support to enable custom fields.' };
        }
        throw error;
      }

      return { action: 'created', field: data };
    }

    if (action === 'delete') {
      if (!field_name && !entity_type) {
        return { error: 'Provide field_name (and optionally entity_type) to identify which custom field to delete.' };
      }

      let query = ctx.supabase
        .from(tableName)
        .delete()
        .eq('organization_id', ctx.organizationId);

      if (field_name) query = query.eq('field_name', field_name);
      if (entity_type) query = query.eq('entity_type', entity_type);

      const { error, count } = await query;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return { error: 'Custom fields table not yet provisioned.' };
        }
        throw error;
      }

      return { action: 'deleted', field_name, entity_type: entity_type || null, deleted: count ?? 1 };
    }

    return { error: `Unknown action: ${action}. Use list, create, or delete.` };
  },

  triggerExamples: [
    'add a custom field for deal source',
    'list custom fields on contacts',
    'create a dropdown field for industry',
  ],
};

export default manageCustomFields;
