/**
 * Skill: get_audit_trail
 *
 * Retrieve the audit trail (change history) for a CRM record.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getAuditTrail: SkillDefinition = {
  name: 'get_audit_trail',
  displayName: 'Get Audit Trail',
  domain: 'admin',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'get_audit_trail',
      description: 'Retrieve the audit trail (change history) for a specific CRM record. Shows who changed what, when, and the old vs new values. Use for RevOps audits, compliance checks, or investigating data changes.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            enum: ['deals', 'contacts', 'accounts', 'tasks', 'activities'],
            description: 'The type of record to audit',
          },
          record_id: {
            type: 'string',
            description: 'The UUID of the specific record to audit',
          },
          date_from: {
            type: 'string',
            description: 'Start date for audit range (ISO format)',
          },
          date_to: {
            type: 'string',
            description: 'End date for audit range (ISO format)',
          },
          limit: {
            type: 'number',
            description: 'Max number of audit entries to return (default 25)',
          },
        },
        required: ['entity_type'],
      },
    },
  },

  instructions: `**For "audit trail", "change history", "who changed this"** → Use get_audit_trail
  - Shows who changed what, when, and old vs new values
  - Use for RevOps audits, compliance checks, or investigating data changes`,

  execute: async (ctx: ToolExecutionContext) => {
    const { entity_type, record_id, date_from, date_to, limit } = ctx.args as {
      entity_type: string;
      record_id?: string;
      date_from?: string;
      date_to?: string;
      limit?: number;
    };

    const resultLimit = Math.min(Math.max(limit || 25, 1), 200);

    let query = ctx.supabase
      .from('audit_log')
      .select('id, user_id, table_name, record_id, operation, old_values, new_values, changes, reason, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('table_name', entity_type)
      .order('created_at', { ascending: false })
      .limit(resultLimit);

    if (record_id) query = query.eq('record_id', record_id);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', date_to);

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      operation: row.operation,
      record_id: row.record_id,
      changes: row.changes || null,
      old_values: row.old_values || null,
      new_values: row.new_values || null,
      reason: row.reason || null,
      timestamp: row.created_at,
    }));

    return {
      entity_type,
      record_id: record_id || null,
      entries,
      count: entries.length,
    };
  },

  triggerExamples: [
    'show audit trail for this deal',
    'who changed the amount on Pepsi',
    'change history for contacts',
  ],
};

export default getAuditTrail;
